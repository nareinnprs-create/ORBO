import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { tasks } from "../src/db/schema";
import type { RoutineDefinition } from "../src/routines/produce";
import { fireRoutineTask, RoutineNotDueError } from "../src/routines/produce";
import type { TaskLedger } from "../src/work/tasks";
import { createTaskLedger, TaskLedgerError } from "../src/work/tasks";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * One cron routine firing one task, with run row + receipt (WS-09; TD-03, TD-04).
 *
 * The ledger is the real one over its tables, so what is under test is the sequence
 * a firing promises: a due schedule becomes exactly one durable task, one run row
 * closed with its outcome, and one receipt naming the run — and a replayed firing,
 * whether it arrives after the fact or while another replica is mid-turn, cannot
 * fire the turn twice. The clock is a variable the test moves by hand and the turn
 * is a stub, so no model and no cron daemon is involved. Fatigue is the runner's
 * and appears here only as an absence: one firing, one run, no counters.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

/**
 * The per-test ceiling. Generous, because these tests run on the shared test database
 * alongside every other suite in the same process, and the five-second default is
 * contention food: a busy moment stalls a statement, not a property under test.
 */
const DB_TIMEOUT = 30_000;

const suite = randomUUID().slice(0, 8);
const ROUTINE: RoutineDefinition = {
  id: `routine_standup_${suite}`,
  cron: "0 9 * * *",
  timezone: "UTC",
  instruction: "Post the standup summary.",
};

/** The clock, held by the test: `now()` answers whatever was last set. */
function fakeClock(start: string) {
  let at = new Date(start);
  return {
    now: () => new Date(at),
    set: (iso: string) => {
      at = new Date(iso);
    },
  };
}

function harness(start: string) {
  const clock = fakeClock(start);
  const ledger: TaskLedger = createTaskLedger(database, { now: clock.now });
  const turns: { instruction: string; scheduledFor: Date }[] = [];
  const run = async (input: { instruction: string; scheduledFor: Date }) => {
    turns.push(input);
    return "standup posted";
  };
  return { clock, ledger, turns, run };
}

/** Every day at 09:00 UTC, measured from 08:00: comfortably above the floor. */
const AFTER = new Date("2026-08-26T08:00:00.000Z");
const DUE = new Date("2026-08-26T09:00:00.000Z");

beforeEach(async () => {
  // Each test owns the routine's whole key namespace: a firing is durable now, so
  // yesterday's test's due minute would otherwise be this test's `offered: false`.
  await database.delete(tasks).where(like(tasks.key, `${ROUTINE.id}:%`));
});

afterAll(async () => {
  await database.delete(tasks).where(like(tasks.key, `${ROUTINE.id}:%`));
  await database.$client.close();
});

describe("one cron routine firing one task", () => {
  test(
    "a due schedule creates a task, a run row, and a receipt",
    async () => {
      const { clock, ledger, turns, run } = harness("2026-08-26T09:00:30.000Z");

      const firing = await fireRoutineTask({
        routine: ROUTINE,
        after: AFTER,
        now: clock.now,
        ledger,
        run,
      });

      expect(firing.offered).toBe(true);
      // The key carries the minute the firing was due, asserted literally: the format
      // is the idempotence, and recomputing it here would assert nothing.
      expect(firing.task.key).toBe(`${ROUTINE.id}:2026-08-26T09:00Z`);
      expect(firing.task.producer).toEqual({
        kind: "routine",
        id: ROUTINE.id,
      });
      expect(firing.task.scheduledFor).toEqual(DUE);
      expect(firing.task.status).toBe("succeeded");

      expect(firing.run.taskId).toBe(firing.task.id);
      expect(firing.run.status).toBe("succeeded");
      expect(firing.run.startedAt).toEqual(
        new Date("2026-08-26T09:00:30.000Z"),
      );
      expect(firing.run.finishedAt).toEqual(
        new Date("2026-08-26T09:00:30.000Z"),
      );
      expect(firing.run.error).toBeNull();

      expect(firing.receipt.taskId).toBe(firing.task.id);
      expect(firing.receipt.runId).toBe(firing.run.id);
      expect(firing.receipt.kind).toBe("receipt");

      expect(turns).toHaveLength(1);
      expect(turns[0]?.instruction).toBe("Post the standup summary.");
      expect(turns[0]?.scheduledFor).toEqual(DUE);
    },
    DB_TIMEOUT,
  );

  test(
    "the same due minute fired twice runs the turn once",
    async () => {
      const { clock, ledger, turns, run } = harness("2026-08-26T09:00:30.000Z");

      const first = await fireRoutineTask({
        routine: ROUTINE,
        after: AFTER,
        now: clock.now,
        ledger,
        run,
      });
      const second = await fireRoutineTask({
        routine: ROUTINE,
        after: AFTER,
        now: clock.now,
        ledger,
        run,
      });

      expect(second.offered).toBe(false);
      expect(second.task.id).toBe(first.task.id);
      expect(second.run.id).toBe(first.run.id);
      expect(second.receipt.id).toBe(first.receipt.id);
      expect(turns).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "two replicas firing one due minute concurrently still run it once",
    async () => {
      const { clock, ledger, turns, run } = harness("2026-08-26T09:00:30.000Z");
      const fire = () =>
        fireRoutineTask({
          routine: ROUTINE,
          after: AFTER,
          now: clock.now,
          ledger,
          run,
        });

      const settled = await Promise.allSettled([fire(), fire()]);
      const fulfilled = settled
        .filter(
          (s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof fire>>> =>
            s.status === "fulfilled",
        )
        .map((s) => s.value);

      // The turn ran exactly once, whatever order the two arrived in.
      expect(turns).toHaveLength(1);
      // Exactly one caller became the firing. The other either reports the firing it
      // lost honestly (rejected: the winner had not closed its triple yet) or is
      // handed that finished triple whole (fulfilled, `offered: false`) — never a
      // second turn.
      expect(fulfilled.filter((f) => f.offered)).toHaveLength(1);
      expect(new Set(fulfilled.map((f) => f.task.id))).toHaveLength(1);
      for (const outcome of settled) {
        if (outcome.status === "rejected") {
          expect(outcome.reason).toBeInstanceOf(Error);
          expect((outcome.reason as Error).message).toContain(
            "no run row or receipt",
          );
        }
      }

      // And once the firing has closed, a later sweep is handed it whole.
      const replay = await fire();
      expect(replay.offered).toBe(false);
      expect(replay.run.status).toBe("succeeded");
      expect(replay.receipt.detail).toContain("2026-08-26T09:00Z");
    },
    DB_TIMEOUT,
  );

  test(
    "a schedule that has not fired yet creates nothing",
    async () => {
      const { clock, ledger, run } = harness("2026-08-26T08:59:59.000Z");

      await expect(
        fireRoutineTask({
          routine: ROUTINE,
          after: AFTER,
          now: clock.now,
          ledger,
          run,
        }),
      ).rejects.toBeInstanceOf(RoutineNotDueError);
      const rows = await database
        .select()
        .from(tasks)
        .where(like(tasks.key, `${ROUTINE.id}:%`));
      expect(rows).toHaveLength(0);
    },
    DB_TIMEOUT,
  );

  test(
    "a failing turn closes the run as failed and still records a receipt",
    async () => {
      const { clock, ledger } = harness("2026-08-26T09:00:30.000Z");

      const firing = await fireRoutineTask({
        routine: ROUTINE,
        after: AFTER,
        now: clock.now,
        ledger,
        run: async () => {
          throw new Error("the model said no");
        },
      });

      expect(firing.offered).toBe(true);
      expect(firing.run.status).toBe("failed");
      expect(firing.run.error).toBe("the model said no");
      expect(firing.task.status).toBe("failed");
      expect(firing.receipt.runId).toBe(firing.run.id);
      expect(firing.receipt.detail).toContain("the model said no");
    },
    DB_TIMEOUT,
  );

  test(
    "the next occurrence fires anew once time moves on",
    async () => {
      const { clock, ledger, turns, run } = harness("2026-08-26T09:00:30.000Z");

      await fireRoutineTask({
        routine: ROUTINE,
        after: AFTER,
        now: clock.now,
        ledger,
        run,
      });
      // A day passes on the test's clock — no waiting, no cron daemon, just a later `now`
      // measured against the previous firing.
      clock.set("2026-08-27T09:00:30.000Z");
      const next = await fireRoutineTask({
        routine: ROUTINE,
        after: DUE,
        now: clock.now,
        ledger,
        run,
      });

      expect(next.offered).toBe(true);
      expect(next.task.key).toBe(`${ROUTINE.id}:2026-08-27T09:00Z`);
      expect(turns).toHaveLength(2);
    },
    DB_TIMEOUT,
  );

  test(
    "a receipt needs a finished run, and a run finishes once",
    async () => {
      const { clock, ledger } = harness("2026-08-26T09:00:30.000Z");

      const { task } = await ledger.offer({
        key: `${ROUTINE.id}:2026-08-26T09:00Z`,
        producer: { kind: "routine", id: ROUTINE.id },
        scheduledFor: DUE,
      });
      const run = await ledger.startRun(task.id);
      await expect(
        ledger.recordReceipt(run.id, {
          title: "too early",
          detail: "no outcome yet",
        }),
      ).rejects.toBeInstanceOf(TaskLedgerError);

      await ledger.finishRun(run.id, "succeeded");
      const kept = await ledger.finishRun(run.id, "failed", "a late failure");
      expect(kept.status).toBe("succeeded");
      expect(kept.error).toBeNull();

      const receipt = await ledger.recordReceipt(run.id, {
        title: "routine fired",
        detail: "done",
      });
      expect(receipt.at).toEqual(clock.now());
    },
    DB_TIMEOUT,
  );
});
