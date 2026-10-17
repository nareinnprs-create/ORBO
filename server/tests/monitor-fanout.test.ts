import { describe, expect, test } from "bun:test";
import {
  backoffDelayMinutes,
  buildDedupKey,
  createMemoryNotificationWriter,
  runWatchCheck,
  type FanoutMonitor,
  type FanoutMonitorUpdate,
} from "../src/monitors/fanout";
import type { FetchPage } from "../src/monitors/check";

/**
 * The monitor fan-out writer, asserted without a database, without a network, and
 * without timers.
 *
 * Fetching arrives as an injected fake, time as an injected clock, and notification
 * rows land in an in-memory writer — so what is under test is the fan-out alone: a
 * firing writes exactly one row under `monitor:<id>:<seq>:<hash>`, a replay of the
 * same firing deduplicates instead of double-alerting, fetch failures reschedule
 * with backoff without firing, and the fifth consecutive strike pauses the monitor.
 * Nothing here needs Postgres (Docker is down).
 */

const NOW = new Date("2026-10-16T12:00:00.000Z");
const now = () => new Date(NOW);

const OWNER = "user_owner";

function monitor(overrides: Partial<FanoutMonitor> = {}): FanoutMonitor {
  return {
    id: "monitor_1",
    ownerUserId: OWNER,
    url: "https://example.com/page",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    lastHash: null,
    status: "active",
    consecutiveFailures: 0,
    alertSequence: 0,
    lastTimelessHash: null,
    lastValue: null,
    ...overrides,
  };
}

/** Carry the returned update forward, the way the caller persists it. */
function persisted(
  before: FanoutMonitor,
  update: FanoutMonitorUpdate,
): FanoutMonitor {
  return {
    ...before,
    lastHash: update.lastHash,
    lastValue: update.lastValue,
    lastTimelessHash: update.lastTimelessHash,
    consecutiveFailures: update.consecutiveFailures,
    alertSequence: update.alertSequence,
    status: update.status,
  };
}

function fetchText(text: string): FetchPage {
  return async (url: string) => ({ url, title: "Example", text });
}

function fetchFailing(reason = "connection reset"): FetchPage {
  return async () => {
    throw new Error(reason);
  };
}

describe("monitor fan-out writer", () => {
  test("a firing writes exactly one notification row, and its replay dedupes", async () => {
    const writer = createMemoryNotificationWriter();
    const watching = monitor({ condition: "contains", value: "in stock" });

    const first = await runWatchCheck(watching, {
      fetchPage: fetchText("Only 3 left — IN STOCK now"),
      now,
      notifications: writer,
    });
    expect(first.fired).toBe(true);
    expect(first.notified).toBe(true);
    expect(first.deduped).toBe(false);
    expect(first.notificationId).toBe(
      buildDedupKey("monitor_1", 1, first.monitor.lastHash),
    );
    expect(writer.rows).toHaveLength(1);
    expect(writer.rows[0]).toMatchObject({
      id: first.notificationId,
      ownerUserId: OWNER,
      taskId: null,
    });
    expect(writer.rows[0]?.title).toContain("https://example.com/page");
    expect(writer.rows[0]?.body).toContain("IN STOCK");

    // The same firing again — a lost outcome retried, a restart republishing —
    // recomputes the same key and writes nothing.
    const replay = await runWatchCheck(watching, {
      fetchPage: fetchText("Only 3 left — IN STOCK now"),
      now,
      notifications: writer,
    });
    expect(replay.fired).toBe(true);
    expect(replay.notified).toBe(false);
    expect(replay.deduped).toBe(true);
    expect(replay.notificationId).toBe(first.notificationId);
    expect(writer.rows).toHaveLength(1);
  });

  test("a failed check reschedules with backoff and fires nothing", async () => {
    const writer = createMemoryNotificationWriter();
    const outcome = await runWatchCheck(monitor({ lastHash: "baseline" }), {
      fetchPage: fetchFailing(),
      now,
      notifications: writer,
    });
    expect(outcome.fired).toBe(false);
    expect(outcome.notified).toBe(false);
    expect(outcome.error).toBe("connection reset");
    expect(outcome.paused).toBe(false);
    expect(writer.rows).toHaveLength(0);
    // First strike waits 2 minutes, not the full 15-minute interval.
    expect(outcome.monitor.nextCheckAt).toEqual(
      new Date(NOW.getTime() + 2 * 60_000),
    );
    expect(outcome.monitor.consecutiveFailures).toBe(1);
    expect(outcome.monitor.status).toBe("active");
    // The baseline survives the failure for the next check to compare against.
    expect(outcome.monitor.lastHash).toBe("baseline");
  });

  test("five consecutive failures pause the monitor with doubling backoff", async () => {
    const writer = createMemoryNotificationWriter();
    let current = monitor({ lastHash: "baseline" });
    const expectedDelays = [2, 4, 8, 16, 32];

    for (let strike = 1; strike <= 5; strike++) {
      const outcome = await runWatchCheck(current, {
        fetchPage: fetchFailing(),
        now,
        notifications: writer,
      });
      expect(outcome.fired).toBe(false);
      expect(outcome.notified).toBe(false);
      expect(outcome.monitor.consecutiveFailures).toBe(strike);
      expect(outcome.monitor.nextCheckAt).toEqual(
        new Date(NOW.getTime() + expectedDelays[strike - 1]! * 60_000),
      );
      expect(outcome.paused).toBe(strike === 5);
      expect(outcome.monitor.status).toBe(strike === 5 ? "paused" : "active");
      current = persisted(current, outcome.monitor);
    }

    expect(backoffDelayMinutes(1)).toBe(2);
    expect(backoffDelayMinutes(5)).toBe(32);
    expect(backoffDelayMinutes(10)).toBe(60);
    expect(writer.rows).toHaveLength(0);
    expect(current.status).toBe("paused");
  });

  test("a success resets the failure streak", async () => {
    const writer = createMemoryNotificationWriter();
    let current = monitor({ condition: "contains", value: "open" });
    for (let strike = 0; strike < 2; strike++) {
      const failed = await runWatchCheck(current, {
        fetchPage: fetchFailing(),
        now,
        notifications: writer,
      });
      current = persisted(current, failed.monitor);
    }
    expect(current.consecutiveFailures).toBe(2);

    const recovered = await runWatchCheck(current, {
      fetchPage: fetchText("Doors open"),
      now,
      notifications: writer,
    });
    expect(recovered.error).toBeNull();
    expect(recovered.monitor.consecutiveFailures).toBe(0);
    expect(recovered.monitor.status).toBe("active");
    expect(recovered.notified).toBe(true);
    expect(writer.rows).toHaveLength(1);
  });

  test("only relative times changing stays quiet; a real change still alerts", async () => {
    const writer = createMemoryNotificationWriter();
    const baseline = await runWatchCheck(monitor({ condition: "change" }), {
      fetchPage: fetchText("Posted 3 minutes ago: doors open"),
      now,
      notifications: writer,
    });
    expect(baseline.fired).toBe(false);
    expect(writer.rows).toHaveLength(0);
    let current = persisted(monitor({ condition: "change" }), baseline.monitor);

    const retimed = await runWatchCheck(current, {
      fetchPage: fetchText("Posted 4 minutes ago: doors open"),
      now,
      notifications: writer,
    });
    // The hash moved, so the executor fired — but only the clock ticked.
    expect(retimed.fired).toBe(true);
    expect(retimed.quieted).toBe(true);
    expect(retimed.notified).toBe(false);
    expect(retimed.notificationId).toBeNull();
    expect(writer.rows).toHaveLength(0);
    current = persisted(current, retimed.monitor);

    const changed = await runWatchCheck(current, {
      fetchPage: fetchText("Posted 4 minutes ago: doors closed"),
      now,
      notifications: writer,
    });
    expect(changed.fired).toBe(true);
    expect(changed.quieted).toBe(false);
    expect(changed.notified).toBe(true);
    // The quiet check consumed no sequence: this is the first notification.
    expect(changed.notificationId).toBe(
      buildDedupKey("monitor_1", 1, changed.monitor.lastHash),
    );
    expect(writer.rows).toHaveLength(1);
  });

  test("a paused monitor is never fetched and never fires", async () => {
    const writer = createMemoryNotificationWriter();
    let fetched = 0;
    const counting: FetchPage = async (url: string) => {
      fetched++;
      return { url, title: "Example", text: "IN STOCK" };
    };
    const outcome = await runWatchCheck(
      monitor({
        condition: "contains",
        value: "in stock",
        status: "paused",
        consecutiveFailures: 5,
      }),
      { fetchPage: counting, now, notifications: writer },
    );
    expect(fetched).toBe(0);
    expect(outcome.fired).toBe(false);
    expect(outcome.notified).toBe(false);
    expect(outcome.monitor.status).toBe("paused");
    expect(writer.rows).toHaveLength(0);
  });
});
