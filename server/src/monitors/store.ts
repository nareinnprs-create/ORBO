/**
 * Monitor persistence and fan-out wiring (25 M6; TD-06, TD-09).
 *
 * `check.ts` decides fired/not; `fanout.ts` decides what a firing is worth; this
 * module connects both to the rows that make any of it real, which is the part the
 * register's TOP RISK names: checks that run but alert nobody, because every result
 * died in the memory of the process that computed it. What lands here:
 *
 * - `createNotificationFanoutWriter` — the `NotificationWriter` fan-out always
 *   wanted, over the `notifications` table: the dedup key is the row id and the
 *   insert is `on conflict do nothing`, so a replay of one firing is one row for
 *   ever, across restarts and replicas.
 * - `claimDueMonitors` — the due sweep, one transaction, `for update skip locked`:
 *   each claim takes the rows nobody else holds and advances `next_check_at`, so a
 *   replica that dies mid-check costs the watch one interval, never a double alert.
 * - `persistMonitorUpdate` — the check's outcome written back onto the `monitors`
 *   row, including the backoff/pause/sequence state the fan-out slice added as
 *   columns (TD-09 step 2).
 * - `runDueWatchChecks` — claim, check, fan out, persist, in the one call a
 *   scheduler needs. The scheduler itself stays where the other schedulers are;
 *   this module adds none.
 */
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { type Monitor, monitors, notifications } from "../db/schema";
import type { Clock, FetchPage } from "./check";
import {
  type FanoutMonitor,
  type FanoutMonitorUpdate,
  type FanoutOutcome,
  type NotificationWriter,
  runWatchCheck,
} from "./fanout";

/**
 * The fields fan-out reads, from the row as it is stored. A full `monitors` row
 * satisfies this now that the fan-out columns exist.
 */
type MonitorFanoutColumns = Pick<
  Monitor,
  | "id"
  | "ownerUserId"
  | "status"
  | "url"
  | "condition"
  | "value"
  | "intervalMinutes"
  | "lastHash"
  | "lastValue"
  | "lastTimelessHash"
  | "consecutiveFailures"
  | "alertSequence"
>;

/** The monitor row's state, as the pure fan-out reads it. */
export function toFanoutMonitor(row: MonitorFanoutColumns): FanoutMonitor {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status,
    url: row.url,
    condition: row.condition,
    value: row.value,
    intervalMinutes: row.intervalMinutes,
    lastHash: row.lastHash,
    lastValue: row.lastValue,
    lastTimelessHash: row.lastTimelessHash,
    consecutiveFailures: row.consecutiveFailures,
    alertSequence: row.alertSequence,
  };
}

/**
 * The durable `NotificationWriter`: existence by primary key, insert with
 * `on conflict do nothing`. The dedup key `monitor:<id>:<seq>:<hash>` is the row
 * id, exactly as fan-out's header prescribed, so a replay computes a key that is
 * already there and writes nothing — the legacy `insertIfAbsent` dedup, kept by a
 * primary key instead of a scan.
 */
export function createNotificationFanoutWriter(
  database: Database,
): NotificationWriter {
  return {
    async has(id: string): Promise<boolean> {
      const [row] = await database
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.id, id))
        .limit(1);
      return Boolean(row);
    },
    async insert(notification) {
      await database
        .insert(notifications)
        .values({
          id: notification.id,
          ownerUserId: notification.ownerUserId,
          taskId: notification.taskId,
          title: notification.title,
          body: notification.body,
        })
        .onConflictDoNothing({ target: notifications.id });
    },
  };
}

/** The check's state, written back onto the monitor row, with the check counted. */
export async function persistMonitorUpdate(
  database: Database,
  monitorId: string,
  update: FanoutMonitorUpdate,
): Promise<void> {
  await database
    .update(monitors)
    .set({
      lastHash: update.lastHash,
      lastValue: update.lastValue,
      lastTimelessHash: update.lastTimelessHash,
      lastCheckedAt: update.checkedAt,
      nextCheckAt: update.nextCheckAt,
      consecutiveFailures: update.consecutiveFailures,
      alertSequence: update.alertSequence,
      status: update.status,
      error: update.error,
      checks: sql`${monitors.checks} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(monitors.id, monitorId));
}

/**
 * Take the due active watches, and only the ones nobody else is taking.
 *
 * The claim and the reschedule are one transaction: `for update skip locked` hands
 * this caller rows no other replica holds, and advancing `next_check_at` releases
 * them with the slot already spent, so a replica that dies after claiming does not
 * leave the watch due again the next second — the sweep that finds nothing does no
 * work, and a repeated check is one interval away rather than one retry loop.
 * Whatever the check itself then decides (backoff, pause) overwrites this advance.
 */
export async function claimDueMonitors(
  database: Database,
  options?: { limit?: number; now?: Clock },
): Promise<FanoutMonitor[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  return database.transaction(async (transaction) => {
    const due = await transaction.execute(sql`
      select "id", "owner_user_id", "status", "url", "condition", "value",
             "interval_minutes", "last_hash", "last_value", "last_timeless_hash",
             "consecutive_failures", "alert_sequence"
      from "monitors"
      where "status" = 'active'
        and "next_check_at" <= now()
      order by "next_check_at" asc
      limit ${limit}
      for update skip locked
    `);
    const rows = (
      Array.isArray(due) ? due : ((due as { rows?: unknown[] })?.rows ?? [])
    ) as {
      id: string;
      owner_user_id: string;
      status: "active" | "paused" | "stopped";
      url: string;
      condition: "change" | "contains" | "price_below";
      value: string;
      interval_minutes: number;
      last_hash: string | null;
      last_value: string | null;
      last_timeless_hash: string | null;
      consecutive_failures: number;
      alert_sequence: number;
    }[];
    if (rows.length === 0) return [];

    const claimed: FanoutMonitor[] = [];
    for (const row of rows) {
      await transaction
        .update(monitors)
        .set({
          nextCheckAt: sql`now() + make_interval(mins => ${row.interval_minutes})`,
          updatedAt: sql`now()`,
        })
        .where(eq(monitors.id, row.id));
      claimed.push(
        toFanoutMonitor({
          id: row.id,
          ownerUserId: row.owner_user_id,
          status: row.status,
          url: row.url,
          condition: row.condition,
          value: row.value,
          intervalMinutes: row.interval_minutes,
          lastHash: row.last_hash,
          lastValue: row.last_value,
          lastTimelessHash: row.last_timeless_hash,
          consecutiveFailures: row.consecutive_failures,
          alertSequence: row.alert_sequence,
        }),
      );
    }
    return claimed;
  });
}

/** Strip the markup a watcher should never read as content. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script/gi, " ")
    .replace(/<style[\s\S]*?<\/style/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html: string): string {
  return /<title[^>]*>([\s\S]*?)<\/title/i.exec(html)?.[1]?.trim() ?? "";
}

/**
 * The real page fetch, for the scheduler that has no test's stub to inject. A
 * non-2xx answer throws, which is a fetch failure as fan-out defines one: a strike,
 * a backoff, and on the fifth a paused monitor — never a silent one.
 */
export const fetchPageOverHttp: FetchPage = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "ORBO watch check" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Page check failed: HTTP ${response.status}`);
  }
  const html = await response.text();
  return { url: response.url || url, title: titleOf(html), text: textOf(html) };
};

/**
 * One scheduling pass over the due watches: claim, check, fan out, persist.
 *
 * Every outcome is durable — the monitor row carries the new baseline, the backoff
 * and the pause; a firing carries its notification row under its dedup key. Nothing
 * here can double-alert: the claim is `skip locked` against other replicas, and the
 * dedup key answers a replay of the same firing regardless of who asks.
 */
export async function runDueWatchChecks(options: {
  database: Database;
  /** Where notification rows go. Defaulted to the `notifications` table, never live by need. */
  notifications?: NotificationWriter;
  /** The page fetch. Defaulted to HTTP; tests inject a stub. */
  fetchPage?: FetchPage;
  now?: Clock;
  limit?: number;
}): Promise<FanoutOutcome[]> {
  const fanout =
    options.notifications ?? createNotificationFanoutWriter(options.database);
  const claimed = await claimDueMonitors(options.database, {
    limit: options.limit,
    now: options.now,
  });
  const outcomes: FanoutOutcome[] = [];
  for (const monitor of claimed) {
    const outcome = await runWatchCheck(monitor, {
      fetchPage: options.fetchPage ?? fetchPageOverHttp,
      ...(options.now ? { now: options.now } : {}),
      notifications: fanout,
    });
    await persistMonitorUpdate(options.database, monitor.id, outcome.monitor);
    outcomes.push(outcome);
  }
  return outcomes;
}
