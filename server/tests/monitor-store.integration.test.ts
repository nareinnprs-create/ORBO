import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { monitors, notifications, users } from "../src/db/schema";
import type { FetchPage } from "../src/monitors/check";
import { hashWatchText, normalizeWatchText } from "../src/monitors/check";
import {
  createNotificationFanoutWriter,
  type FanoutOutcome,
  runDueWatchChecks,
} from "../src/monitors/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The durable half of a watch (25 M6; TD-06, TD-09).
 *
 * `check.ts` and `fanout.ts` decide; this suite proves the decisions land in rows:
 * a firing becomes exactly one notification under its dedup key, the monitor row
 * carries the baseline, the backoff and the pause, and a replay of the same firing —
 * the crash between the notification write and the state write — dedupes instead of
 * double-alerting. The page fetch is a stub; the writer and the claim are the real
 * tables.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

/**
 * The per-test ceiling. Generous, because these tests run on the shared test database
 * alongside every other suite in the same process, and the five-second default is
 * contention food: a busy moment stalls a statement, not a property under test.
 */
const DB_TIMEOUT = 30_000;

const suite = randomUUID().slice(0, 8);
const owner = `user_watch_${suite}`;
const monitorId = `monitor_watch_${suite}`;
const URL = "https://page.example/status";

const PAGE_A = "Status: all systems normal. Nothing to see.";
const PAGE_B = "Status: degraded. The export queue is backing up.";

/** A page fetch that serves `pages` in order, recording what it was asked for. */
function scriptedFetch(pages: string[]) {
  const asked: string[] = [];
  const fetchPage: FetchPage = async (url) => {
    asked.push(url);
    const text = pages.shift();
    if (text === undefined) throw new Error("the page fetch was not scripted");
    return { url, title: "Status page", text };
  };
  return { asked, fetchPage };
}

function failingFetch() {
  const fetchPage: FetchPage = async () => {
    throw new Error("getaddrinfo ENOTFOUND page.example");
  };
  return fetchPage;
}

async function monitorRow() {
  const [row] = await database
    .select()
    .from(monitors)
    .where(eq(monitors.id, monitorId));
  return row;
}

/** Where the next check is due, per the row — the claim reads the row, not the clock. */
async function makeDue() {
  // An hour ago, not a second ago: the claim compares against the database's clock
  // and this host's clock is a different device. A one-second margin is skew food.
  await database
    .update(monitors)
    .set({ nextCheckAt: new Date(Date.now() - 3_600_000) })
    .where(eq(monitors.id, monitorId));
}

function textHash(text: string) {
  return hashWatchText(normalizeWatchText(text));
}

beforeAll(async () => {
  // Rows this file's earlier runs left behind when a run was killed mid-flight:
  // the claim reads every active due watch, so a leftover row would answer as a
  // second outcome. The id prefix is this file's, and only its own.
  await database.delete(monitors).where(like(monitors.id, "monitor_watch_%"));
  await database.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: owner,
  });
  await database.insert(monitors).values({
    id: monitorId,
    ownerUserId: owner,
    url: URL,
    condition: "change",
    value: "",
    intervalMinutes: 15,
  });
});

afterAll(async () => {
  await database.delete(monitors).where(eq(monitors.id, monitorId));
  await database
    .delete(notifications)
    .where(eq(notifications.ownerUserId, owner));
  await database.delete(users).where(eq(users.id, owner));
  await database.$client.close();
});

describe("a firing fans out durably", () => {
  test(
    "the first check saves a baseline and stays quiet",
    async () => {
      const { fetchPage } = scriptedFetch([PAGE_A]);
      await makeDue();

      const outcomes = await runDueWatchChecks({
        database,
        fetchPage,
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.fired).toBe(false);
      expect(outcomes[0]?.notified).toBe(false);
      const row = await monitorRow();
      expect(row?.lastHash).toBe(textHash(PAGE_A));
      expect(row?.alertSequence).toBe(0);
      const rows = await database
        .select()
        .from(notifications)
        .where(eq(notifications.ownerUserId, owner));
      expect(rows).toHaveLength(0);
    },
    DB_TIMEOUT,
  );

  test(
    "a change writes exactly one notification row under its dedup key",
    async () => {
      const { fetchPage } = scriptedFetch([PAGE_B]);
      await makeDue();

      const outcomes = await runDueWatchChecks({ database, fetchPage });

      expect(outcomes[0]?.fired).toBe(true);
      expect(outcomes[0]?.notified).toBe(true);
      const key = `monitor:${monitorId}:1:${textHash(PAGE_B)}`;
      expect(outcomes[0]?.notificationId).toBe(key);
      const rows = await database
        .select()
        .from(notifications)
        .where(eq(notifications.ownerUserId, owner));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(key);
      expect(rows[0]?.taskId).toBeNull();
      expect(rows[0]?.title).toContain(URL);
      expect(rows[0]?.read).toBe(false);
    },
    DB_TIMEOUT,
  );

  test(
    "the monitor row carries the outcome: baseline, sequence, schedule, count",
    async () => {
      const row = await monitorRow();
      expect(row?.lastHash).toBe(textHash(PAGE_B));
      expect(row?.lastValue).toContain("degraded");
      expect(row?.lastTimelessHash).not.toBeNull();
      expect(row?.alertSequence).toBe(1);
      expect(row?.consecutiveFailures).toBe(0);
      expect(row?.lastCheckedAt).not.toBeNull();
      expect(row?.checks).toBe(2);
      expect(row?.error).toBeNull();
      expect(row?.nextCheckAt.getTime()).toBeGreaterThan(Date.now());
    },
    DB_TIMEOUT,
  );

  test(
    "a replay of the same firing dedupes instead of double-alerting",
    async () => {
      // The crash the dedup key exists for: the notification row was written, the
      // state write behind it was not. The row still says the old baseline — plain
      // and timeless — so the replay computes the same key.
      await database
        .update(monitors)
        .set({
          lastHash: textHash(PAGE_A),
          lastTimelessHash: textHash(PAGE_A),
          alertSequence: 0,
        })
        .where(eq(monitors.id, monitorId));
      await makeDue();
      const { fetchPage } = scriptedFetch([PAGE_B]);

      const outcomes = await runDueWatchChecks({ database, fetchPage });

      expect(outcomes[0]?.fired).toBe(true);
      expect(outcomes[0]?.notified).toBe(false);
      expect(outcomes[0]?.deduped).toBe(true);
      const rows = await database
        .select()
        .from(notifications)
        .where(eq(notifications.ownerUserId, owner));
      // Still the one row the first firing wrote.
      expect(rows).toHaveLength(1);
      // And the sequence committed with the outcome this time.
      expect((await monitorRow())?.alertSequence).toBe(1);
    },
    DB_TIMEOUT,
  );
});

describe("failure backoff and the five-strike pause", () => {
  beforeAll(async () => {
    await database
      .update(monitors)
      .set({
        lastHash: textHash(PAGE_B),
        lastTimelessHash: "irrelevant-here",
        consecutiveFailures: 0,
        status: "active",
      })
      .where(eq(monitors.id, monitorId));
  }, DB_TIMEOUT);

  test(
    "each strike backs off further, and the fifth pauses the monitor",
    async () => {
      const fetchPage = failingFetch();
      let outcomes: FanoutOutcome[] = [];
      for (let strike = 1; strike <= 5; strike += 1) {
        await makeDue();
        outcomes = await runDueWatchChecks({ database, fetchPage });
        const row = await monitorRow();
        expect(outcomes[0]?.notified).toBe(false);
        expect(row?.consecutiveFailures).toBe(strike);
        expect(row?.error).toContain("ENOTFOUND");
        if (strike < 5) {
          expect(row?.status).toBe("active");
          // The backoff doubles: the next due moment is minutes out, not seconds.
          expect(row?.nextCheckAt.getTime()).toBeGreaterThan(
            Date.now() + (2 ** strike - 1) * 60_000,
          );
        }
      }

      const row = await monitorRow();
      expect(row?.status).toBe("paused");
    },
    DB_TIMEOUT,
  );

  test(
    "a paused monitor is never claimed, and a success resets the streak",
    async () => {
      await makeDue();
      const { fetchPage } = scriptedFetch([PAGE_B]);
      const outcomes = await runDueWatchChecks({ database, fetchPage });
      expect(outcomes).toHaveLength(0);

      await database
        .update(monitors)
        .set({ status: "active", consecutiveFailures: 3 })
        .where(eq(monitors.id, monitorId));
      await makeDue();
      const recovered = await runDueWatchChecks({ database, fetchPage });
      expect(recovered).toHaveLength(1);
      const row = await monitorRow();
      expect(row?.consecutiveFailures).toBe(0);
      expect(row?.error).toBeNull();
    },
    DB_TIMEOUT,
  );
});

describe("claiming due monitors", () => {
  test(
    "a claim takes a watch off the board until its next interval",
    async () => {
      await database
        .update(monitors)
        .set({
          status: "active",
          nextCheckAt: new Date(Date.now() - 3_600_000),
        })
        .where(eq(monitors.id, monitorId));

      const { fetchPage } = scriptedFetch([PAGE_B]);
      // The first pass claims and answers; the second finds nothing to take.
      expect(await runDueWatchChecks({ database, fetchPage })).toHaveLength(1);
      expect(await runDueWatchChecks({ database, fetchPage })).toHaveLength(0);
    },
    DB_TIMEOUT,
  );
});

describe("the durable notification writer", () => {
  test(
    "insert is insert-if-absent on the dedup key",
    async () => {
      const writer = createNotificationFanoutWriter(database);
      const id = `monitor:${monitorId}:99:${textHash(PAGE_A)}`;
      try {
        expect(await writer.has(id)).toBe(false);
        await writer.insert({
          id,
          ownerUserId: owner,
          taskId: null,
          title: "Watch fired",
          body: "twice offered, once written",
        });
        await writer.insert({
          id,
          ownerUserId: owner,
          taskId: null,
          title: "Watch fired",
          body: "twice offered, once written",
        });
        expect(await writer.has(id)).toBe(true);
        const rows = await database
          .select()
          .from(notifications)
          .where(eq(notifications.id, id));
        expect(rows).toHaveLength(1);
      } finally {
        await database.delete(notifications).where(eq(notifications.id, id));
      }
    },
    DB_TIMEOUT,
  );
});
