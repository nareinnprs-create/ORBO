import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { monitors, tasks, users } from "../src/db/schema";
import { importMonitors } from "../src/monitors/import";
import { createTaskLedger } from "../src/work/tasks";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * TD-09 step 3 over its rows: the widened `tasks_producer_kind_check` accepts
 * the `monitor` producer, an imported watch satisfies every `monitors` CHECK
 * and FK, and the offered task is the one the due sweep would later claim.
 *
 * The suite owns its rows by id/prefix and takes them away afterwards; Bun runs
 * test files concurrently against this one database, so nothing here may touch
 * a row it did not create.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const DB_TIMEOUT = 30_000;

const SUITE = "monitor-import-test";
const LEGACY_ID = "a1111111-2222-4333-8444-555555555555";
const MONITOR_ID = `mon-${LEGACY_ID}`;
const KEY_PREFIX = `monitor:${LEGACY_ID}:`;

const USER_ID = `user_${SUITE}`;
const NEXT_CHECK = new Date("2026-11-14T09:00:00.000Z");

beforeAll(async () => {
  await database.delete(monitors).where(like(monitors.id, `${MONITOR_ID}%`));
  await database.delete(tasks).where(like(tasks.key, `${KEY_PREFIX}%`));
  await database.delete(users).where(like(users.id, `${USER_ID}%`));
  await database.insert(users).values({
    id: USER_ID,
    email: `${SUITE}@example.test`,
    name: "Monitor Import Test User",
  });
});

afterAll(async () => {
  await database.delete(tasks).where(like(tasks.key, `${KEY_PREFIX}%`));
  await database.delete(monitors).where(like(monitors.id, `${MONITOR_ID}%`));
  await database.delete(users).where(like(users.id, `${USER_ID}%`));
  await database.$client.close();
});

describe("importing a legacy monitor into its rows", () => {
  test(
    "the imported row and its due task offer both land, key idempotent",
    async () => {
      const result = importMonitors([
        {
          id: LEGACY_ID,
          owner: USER_ID,
          taskId: "legacy-task-1",
          url: "https://example.test/watch",
          condition: "contains",
          value: "back in stock",
          intervalMinutes: 60,
          status: "active",
          nextCheckAt: NEXT_CHECK.getTime(),
        },
      ]);
      expect(result.report).toEqual({ imported: 1, skipped: [] });

      const ledger = createTaskLedger(database);

      // The monitor row: every CHECK and the owner FK hold.
      const [row] = await database
        .insert(monitors)
        .values(result.monitors[0]!)
        .returning();
      expect(row!.ownerUserId).toBe(USER_ID);
      expect(row!.condition).toBe("contains");
      expect(row!.status).toBe("active");

      // The offer: the 'monitor' producer rides the widened CHECK.
      const first = await ledger.offer(result.taskOffers[0]!);
      expect(first.offered).toBe(true);
      expect(first.task.producer).toEqual({
        kind: "monitor",
        id: MONITOR_ID,
      });

      // A replayed import offers the same key: one task, not two.
      const replay = await ledger.offer(
        importMonitors([
          {
            id: LEGACY_ID,
            owner: USER_ID,
            url: "https://example.test/watch",
            intervalMinutes: 60,
            status: "active",
            nextCheckAt: NEXT_CHECK.getTime(),
          },
        ]).taskOffers[0]!,
      );
      expect(replay.offered).toBe(false);
      expect(replay.task.id).toBe(first.task.id);
    },
    DB_TIMEOUT,
  );
});
