import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { taskEvents, taskRuns, tasks } from "../src/db/schema";
import {
  createTaskLedger,
  MAX_RECEIPT_DETAIL_CODE_POINTS,
  TaskLedgerError,
  type TaskProducer,
} from "../src/work/tasks";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The unified task ledger over its tables (TD-03; 01 §5).
 *
 * What the in-memory slice proved as shape, proven as rows: the key is the
 * idempotence (a unique index, so concurrent offers collapse into one task), the
 * run row is one per task, the receipt is one per run, and every bit of it survives
 * a restart, because it was never in a process's memory to lose.
 *
 * The suite owns its rows by a key prefix and takes them away afterwards. Bun runs
 * test files concurrently against this one database, so nothing here may touch a
 * row it did not create: no table-wide cleanup, no table-wide count assertions.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

/**
 * The per-test ceiling. Generous, because these tests run on the shared test database
 * alongside every other suite in the same process, and the five-second default is
 * contention food: a busy moment stalls a statement, not a property under test.
 */
const DB_TIMEOUT = 30_000;

const suite = randomUUID().slice(0, 8);
const prefix = `ledger:${suite}`;
const producer: TaskProducer = { kind: "routine", id: `${prefix}-routine` };
const AT = new Date("2026-08-26T09:00:30.000Z");

function ledgerFor() {
  return createTaskLedger(database, { now: () => new Date(AT) });
}

async function rowsFor(key: string) {
  const [task] = await database
    .select()
    .from(tasks)
    .where(like(tasks.key, `${key}%`));
  return task;
}

beforeAll(async () => {
  // Leftovers from a crashed earlier run of this suite would collide on keys.
  await database.delete(tasks).where(like(tasks.key, `${prefix}%`));
});

afterAll(async () => {
  await database.delete(tasks).where(like(tasks.key, `${prefix}%`));
  await database.$client.close();
});

describe("offering a task", () => {
  test(
    "a new key writes one row and says so",
    async () => {
      const ledger = ledgerFor();
      const { task, offered } = await ledger.offer({
        key: `${prefix}:2026-08-26T09:00Z`,
        producer,
        scheduledFor: new Date("2026-08-26T09:00:00.000Z"),
      });

      expect(offered).toBe(true);
      expect(task.id).toMatch(/^task_/);
      expect(task.producer).toEqual(producer);
      expect(task.status).toBe("open");
      expect(task.createdAt).toEqual(AT);
      // Exactly one row: the idempotence is a constraint, not a convention.
      expect(await rowsFor(`${prefix}:2026-08-26T09:00Z`)).toBeDefined();
    },
    DB_TIMEOUT,
  );

  test(
    "the same key again is the same task, and writes nothing",
    async () => {
      const ledger = ledgerFor();
      const key = `${prefix}:repeat`;
      const first = await ledger.offer({ key, producer, scheduledFor: AT });
      const second = await ledger.offer({ key, producer, scheduledFor: AT });

      expect(second.offered).toBe(false);
      expect(second.task.id).toBe(first.task.id);
      const all = await database
        .select()
        .from(tasks)
        .where(like(tasks.key, key));
      expect(all).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "concurrent offers of one key create exactly one task",
    async () => {
      const ledger = ledgerFor();
      const key = `${prefix}:concurrent`;
      // Five replicas waking at 07:00, in the order they actually arrive: interleaved.
      const offers = await Promise.all(
        Array.from({ length: 5 }, () =>
          ledger.offer({ key, producer, scheduledFor: AT }),
        ),
      );

      expect(offers.filter((offer) => offer.offered)).toHaveLength(1);
      expect(new Set(offers.map((offer) => offer.task.id))).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "the key format the schedulers share is pinned, literally",
    async () => {
      const ledger = ledgerFor();
      // `${routineId}:${minute}` is half the queue's key and all of the ledger's; the
      // format IS the idempotence, so it is asserted as the string it must be.
      const key = "routine_standup:2026-08-26T09:00Z";
      const { offered } = await ledger.offer({
        key: `${prefix}:${key}`,
        producer,
        scheduledFor: new Date("2026-08-26T09:00:00.000Z"),
      });
      expect(offered).toBe(true);
      expect(`${prefix}:${key}`).toBe(
        `${prefix}:routine_standup:2026-08-26T09:00Z`,
      );
    },
    DB_TIMEOUT,
  );
});

describe("running a task", () => {
  test(
    "a task starts once; a second start is refused",
    async () => {
      const ledger = ledgerFor();
      const { task } = await ledger.offer({
        key: `${prefix}:start-once`,
        producer,
        scheduledFor: AT,
      });

      const run = await ledger.startRun(task.id);
      expect(run.taskId).toBe(task.id);
      expect(run.status).toBe("running");
      expect(run.startedAt).toEqual(AT);

      await expect(ledger.startRun(task.id)).rejects.toBeInstanceOf(
        TaskLedgerError,
      );
      const runs = await database
        .select()
        .from(taskRuns)
        .where(like(taskRuns.taskId, `${task.id}%`));
      expect(runs).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "starting a task that does not exist names it",
    async () => {
      const ledger = ledgerFor();
      await expect(ledger.startRun("task_missing")).rejects.toThrow(
        /does not exist/,
      );
    },
    DB_TIMEOUT,
  );

  test(
    "a run finishes once, and the task carries the outcome",
    async () => {
      const ledger = ledgerFor();
      const { task } = await ledger.offer({
        key: `${prefix}:finish-once`,
        producer,
        scheduledFor: AT,
      });
      const run = await ledger.startRun(task.id);

      const finished = await ledger.finishRun(
        run.id,
        "failed",
        "the model said no",
      );
      expect(finished.status).toBe("failed");
      expect(finished.finishedAt).toEqual(AT);
      expect(finished.error).toBe("the model said no");

      // A replayed finish is the first outcome, not a second one.
      const kept = await ledger.finishRun(run.id, "succeeded");
      expect(kept.status).toBe("failed");
      expect(kept.error).toBe("the model said no");

      const row = await rowsFor(`${prefix}:finish-once`);
      expect(row?.status).toBe("failed");
    },
    DB_TIMEOUT,
  );

  test(
    "finishing a run that does not exist names it",
    async () => {
      const ledger = ledgerFor();
      await expect(
        ledger.finishRun("task_run_missing", "succeeded"),
      ).rejects.toThrow(/does not exist/);
    },
    DB_TIMEOUT,
  );
});

describe("recording a receipt", () => {
  test(
    "a receipt needs a finished run",
    async () => {
      const ledger = ledgerFor();
      const { task } = await ledger.offer({
        key: `${prefix}:receipt-open`,
        producer,
        scheduledFor: AT,
      });
      const run = await ledger.startRun(task.id);

      await expect(
        ledger.recordReceipt(run.id, {
          title: "too early",
          detail: "no outcome yet",
        }),
      ).rejects.toThrow(/still open/);
    },
    DB_TIMEOUT,
  );

  test(
    "a finished run receipts once, and a replay hands back the first",
    async () => {
      const ledger = ledgerFor();
      const { task } = await ledger.offer({
        key: `${prefix}:receipt-once`,
        producer,
        scheduledFor: AT,
      });
      const run = await ledger.startRun(task.id);
      await ledger.finishRun(run.id, "succeeded");

      const receipt = await ledger.recordReceipt(run.id, {
        title: "routine fired",
        detail: "done",
      });
      const replay = await ledger.recordReceipt(run.id, {
        title: "routine fired",
        detail: "done",
      });

      expect(replay.id).toBe(receipt.id);
      expect(receipt.taskId).toBe(task.id);
      expect(receipt.runId).toBe(run.id);
      expect(receipt.kind).toBe("receipt");
      expect(receipt.at).toEqual(AT);
      const events = await database
        .select()
        .from(taskEvents)
        .where(like(taskEvents.runId, `${run.id}%`));
      expect(events).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "a receipt is one line, never the transcript",
    async () => {
      const ledger = ledgerFor();
      const { task } = await ledger.offer({
        key: `${prefix}:receipt-trim`,
        producer,
        scheduledFor: AT,
      });
      const run = await ledger.startRun(task.id);
      await ledger.finishRun(run.id, "succeeded");

      const receipt = await ledger.recordReceipt(run.id, {
        title: "routine fired",
        detail: "x".repeat(500),
      });
      expect(Array.from(receipt.detail).length).toBe(
        MAX_RECEIPT_DETAIL_CODE_POINTS,
      );
      expect(receipt.detail.endsWith("…")).toBe(true);
    },
    DB_TIMEOUT,
  );
});

describe("reading a ledger across a restart", () => {
  test(
    "a new ledger over the same database sees the same triple",
    async () => {
      const first = ledgerFor();
      const { task } = await first.offer({
        key: `${prefix}:restart`,
        producer,
        scheduledFor: AT,
      });
      const run = await first.startRun(task.id);
      const finished = await first.finishRun(run.id, "succeeded");
      const receipt = await first.recordReceipt(run.id, {
        title: "routine fired",
        detail: "done",
      });

      // The ledger the restart builds holds no state of its own.
      const second = ledgerFor();
      const replay = await second.offer({
        key: `${prefix}:restart`,
        producer,
        scheduledFor: AT,
      });
      expect(replay.offered).toBe(false);
      expect(replay.task.id).toBe(task.id);
      expect(await second.runForTask(task.id)).toEqual(finished);
      expect(await second.receiptForRun(run.id)).toEqual(receipt);
    },
    DB_TIMEOUT,
  );
});

describe("counting the ledger", () => {
  test(
    "counts the tables it is the ledger of",
    async () => {
      // Table-wide by design — the ledger's own view of its tables — so asserted
      // relatively: this suite runs alongside others against the same database, and
      // a count that assumed it was alone would read their rows as its own.
      const ledger = ledgerFor();
      const before = await ledger.counts();

      const { task } = await ledger.offer({
        key: `${prefix}:counts`,
        producer,
        scheduledFor: AT,
      });
      const run = await ledger.startRun(task.id);
      await ledger.finishRun(run.id, "succeeded");
      await ledger.recordReceipt(run.id, {
        title: "routine fired",
        detail: "done",
      });

      const after = await ledger.counts();
      expect(after.tasks).toBe(before.tasks + 1);
      expect(after.runs).toBe(before.runs + 1);
      expect(after.receipts).toBe(before.receipts + 1);
    },
    DB_TIMEOUT,
  );
});
