/**
 * Monitor fan-out writer (25 M6).
 *
 * `check.ts` decides fired/not; this module decides what a firing is worth. When a
 * check fires, exactly one notification row is written, deduplicated on
 * `monitor:<id>:<seq>:<hash>`: a firing whose key already exists is a replay (a lost
 * outcome retried, a restart republishing), not a new alert, so the row is skipped.
 * The sequence counts notification-worthy firings only, which is what makes the
 * replay land on the same key. Fetch failures never fire: they reschedule with
 * backoff (`min(60, 2^failures)` minutes, mirroring the legacy `observe` streak) and
 * the fifth consecutive strike pauses the monitor instead of scheduling a sixth.
 * A `change` firing whose timeless fingerprint matches the saved baseline is only
 * relative times ticking, and stays quiet — the baseline still advances.
 *
 * Pure apart from the seams: page fetching arrives as an injected `fetchPage`, time
 * as an injected `now`, and notification rows go through an injected
 * `NotificationWriter`. Nothing here opens a database, which is why the tests run
 * with in-memory fakes and no Postgres. The production wiring lives in
 * `./store.ts`: the `NotificationWriter` over the `notifications` table (owner-scoped,
 * the dedup key as the row id, `onConflictDoNothing` — the drizzle form of the legacy
 * `insertIfAbsent` dedup), the monitor update persisted onto the `monitors` row, and
 * the due sweep that ties them together. No new tables: the notification IS the alert
 * record (D9:A).
 *
 * Follow-ups, deliberately out of this slice:
 * - The backoff/pause/sequence columns now exist (`consecutive_failures`,
 *   `alert_sequence`, `last_timeless_hash`; TD-09 step 2), so a real scheduler can
 *   persist this module's state.
 * - `contains` / `price_below` notify on every matching poll while the condition
 *   holds (level-triggered). The legacy rising edge (`previouslyMatched`) needs a
 *   `lastMatched` column with the same collapse.
 * - Failure-attention notices ("Watch needs attention", the paused alert) travel
 *   with the task-outcome publication slice, not here: failures stay silent rows-wise.
 * - The baseline-ahead race refinement (saved page lines newer than the committed
 *   baseline) needs the `monitor-pages` baseline, which does not exist yet.
 */
import {
  type Clock,
  checkWatch,
  type FetchPage,
  type WatchMonitor,
} from "./check";

/** Consecutive fetch failures before the monitor pauses itself. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Upper bound on the failure backoff; the delay doubles per strike until here. */
export const MAX_BACKOFF_MINUTES = 60;

export type FanoutMonitorStatus = "active" | "paused" | "stopped";

/**
 * The monitor fields fan-out reads. A full `monitors` row satisfies this; the row's
 * fan-out counters (`consecutive_failures`, `alert_sequence`, `last_timeless_hash`,
 * TD-09 step 2) are what makes the state persistable across restarts.
 */
export interface FanoutMonitor extends WatchMonitor {
  ownerUserId: string;
  status: FanoutMonitorStatus;
  /** Fetch failures since the last successful check. Reset on success. */
  consecutiveFailures: number;
  /** Firings notified so far. The next firing notifies as `sequence + 1`. */
  alertSequence: number;
  /** Timeless fingerprint saved by the last successful check; null until the first one. */
  lastTimelessHash: string | null | undefined;
  /** Excerpt saved by the last successful check; echoed back untouched on failure. */
  lastValue?: string | null;
}

/**
 * One notification row, shaped like the `notifications` table (`task_id` stays null:
 * the unified `tasks` table has not landed, so the FK-less column carries nothing).
 */
export interface FanoutNotification {
  /** The dedup key `monitor:<id>:<seq>:<hash>`, stored as the row id. */
  id: string;
  ownerUserId: string;
  taskId: string | null;
  title: string;
  body: string;
}

/**
 * The notification half of the store, narrowed to what fan-out needs: an existence
 * check for the dedup key and an idempotent insert. Mirrors the owner-scoped store
 * in `notifications/routes.ts`, with `insert` carrying `insertIfAbsent` semantics
 * so a concurrent double-fire still lands one row.
 */
export interface NotificationWriter {
  has(id: string): Promise<boolean>;
  insert(notification: FanoutNotification): Promise<void>;
}

/** The monitor state for the caller to persist after the check. */
export interface FanoutMonitorUpdate {
  lastHash: string;
  lastValue: string;
  lastTimelessHash: string | null;
  checkedAt: Date;
  nextCheckAt: Date;
  consecutiveFailures: number;
  alertSequence: number;
  status: FanoutMonitorStatus;
  /** Why the last check failed; null when the last check succeeded. */
  error: string | null;
}

export interface FanoutOutcome {
  /** True when the condition matched this snapshot (even if quieted or deduped). */
  fired: boolean;
  /** True when this check inserted a notification row. */
  notified: boolean;
  /** True when the firing replayed an existing dedup key and wrote nothing. */
  deduped: boolean;
  /** True when only relative times changed and the firing stayed quiet. */
  quieted: boolean;
  /** True when this check's strike paused the monitor. */
  paused: boolean;
  /** Human-readable reason: validation failure or fetch failure. Null on success. */
  error: string | null;
  /** The dedup key for the firing, or null when nothing fired. */
  notificationId: string | null;
  /** State for the caller to persist on the monitor row. */
  monitor: FanoutMonitorUpdate;
}

/**
 * The dedup key for a firing: the monitor, which notification-worthy firing this
 * is, and what the page looked like. A replay of the same firing computes the same
 * key, so it can never write a second row.
 */
export function buildDedupKey(
  monitorId: string,
  sequence: number,
  hash: string,
): string {
  return `monitor:${monitorId}:${sequence}:${hash}`;
}

/**
 * How long a failed check waits before the next one: doubling per consecutive
 * strike, capped at an hour. The first strike waits 2 minutes.
 */
export function backoffDelayMinutes(consecutiveFailures: number): number {
  return Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(consecutiveFailures, 0));
}

/**
 * An in-memory `NotificationWriter` for tests: `rows` holds every inserted row in
 * insert order, and `insert` keeps `insertIfAbsent` semantics so the suite can act
 * out replays and concurrent double-fires without a database.
 */
export function createMemoryNotificationWriter(): NotificationWriter & {
  rows: FanoutNotification[];
} {
  const rows: FanoutNotification[] = [];
  const has = async (id: string): Promise<boolean> =>
    rows.some((row) => row.id === id);
  const insert = async (notification: FanoutNotification): Promise<void> => {
    if (!(await has(notification.id))) rows.push(notification);
  };
  return { rows, has, insert };
}

/**
 * Run one watch check and fan out at most one notification row.
 *
 * Success resets the failure streak and advances the baseline even when nothing
 * fired. A firing writes one row under its dedup key unless the key already exists
 * (replay: `deduped`) or only relative times changed (quiet: `quieted`). A fetch
 * failure advances the streak, reschedules with backoff, and pauses the monitor on
 * the fifth consecutive strike — writing nothing either way. An unusable target is
 * a config error, not a fetch failure: no strike, no backoff, no alert. A monitor
 * that is not active is never fetched.
 */
export async function runWatchCheck(
  monitor: FanoutMonitor,
  deps: {
    fetchPage: FetchPage;
    now?: Clock;
    notifications: NotificationWriter;
  },
): Promise<FanoutOutcome> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now();

  if (monitor.status !== "active") {
    // Only the due sweep's active watches reach here; a stray call cannot fire.
    return {
      fired: false,
      notified: false,
      deduped: false,
      quieted: false,
      paused: false,
      error: null,
      notificationId: null,
      monitor: {
        lastHash: monitor.lastHash ?? "",
        lastValue: monitor.lastValue ?? "",
        lastTimelessHash: monitor.lastTimelessHash ?? null,
        checkedAt,
        nextCheckAt: checkedAt,
        consecutiveFailures: monitor.consecutiveFailures,
        alertSequence: monitor.alertSequence,
        status: monitor.status,
        error: null,
      },
    };
  }

  const result = await checkWatch(monitor, {
    fetchPage: deps.fetchPage,
    now: () => checkedAt,
  });

  if (result.invalidTarget) {
    return {
      fired: false,
      notified: false,
      deduped: false,
      quieted: false,
      paused: false,
      error: result.error,
      notificationId: null,
      monitor: {
        lastHash: result.lastHash,
        lastValue: monitor.lastValue ?? "",
        lastTimelessHash: monitor.lastTimelessHash ?? null,
        checkedAt,
        nextCheckAt: result.nextCheckAt,
        consecutiveFailures: monitor.consecutiveFailures,
        alertSequence: monitor.alertSequence,
        status: monitor.status,
        error: result.error,
      },
    };
  }

  if (result.error) {
    const consecutiveFailures = monitor.consecutiveFailures + 1;
    const paused = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
    return {
      fired: false,
      notified: false,
      deduped: false,
      quieted: false,
      paused,
      error: result.error,
      notificationId: null,
      monitor: {
        lastHash: result.lastHash,
        lastValue: monitor.lastValue ?? "",
        lastTimelessHash: monitor.lastTimelessHash ?? null,
        checkedAt,
        nextCheckAt: new Date(
          checkedAt.getTime() +
            backoffDelayMinutes(consecutiveFailures) * 60_000,
        ),
        consecutiveFailures,
        alertSequence: monitor.alertSequence,
        status: paused ? "paused" : monitor.status,
        error: result.error,
      },
    };
  }

  const timelessUnchanged =
    typeof monitor.lastTimelessHash === "string" &&
    monitor.lastTimelessHash !== "" &&
    monitor.lastTimelessHash === result.timelessHash;
  const quieted =
    result.fired && monitor.condition === "change" && timelessUnchanged;
  const update: FanoutMonitorUpdate = {
    lastHash: result.lastHash,
    lastValue: result.lastValue,
    lastTimelessHash: result.timelessHash,
    checkedAt,
    nextCheckAt: result.nextCheckAt,
    consecutiveFailures: 0,
    alertSequence: monitor.alertSequence,
    status: monitor.status,
    error: null,
  };

  if (!result.fired || quieted || !result.alert) {
    return {
      fired: result.fired,
      notified: false,
      deduped: false,
      quieted,
      paused: false,
      error: null,
      notificationId: null,
      monitor: update,
    };
  }

  // A notification-worthy firing is a new event even at identical text (a change
  // back to a seen state), so the sequence commits with the outcome: a replay of
  // this firing recomputes this key and deduplicates instead of double-alerting.
  const sequence = monitor.alertSequence + 1;
  const key = buildDedupKey(monitor.id, sequence, result.lastHash);
  update.alertSequence = sequence;
  if (await deps.notifications.has(key)) {
    return {
      fired: true,
      notified: false,
      deduped: true,
      quieted: false,
      paused: false,
      error: null,
      notificationId: key,
      monitor: update,
    };
  }
  await deps.notifications.insert({
    id: key,
    ownerUserId: monitor.ownerUserId,
    taskId: null,
    title: result.alert.title,
    body: result.alert.body,
  });
  return {
    fired: true,
    notified: true,
    deduped: false,
    quieted: false,
    paused: false,
    error: null,
    notificationId: key,
    monitor: update,
  };
}
