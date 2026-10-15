import { describe, expect, test } from "bun:test";
import { fireRoutineTask, RoutineNotDueError } from "../src/routines/produce";
import type { RoutineDefinition } from "../src/routines/produce";
import { createTaskLedger, TaskLedgerError } from "../src/work/tasks";
import type { TaskLedger } from "../src/work/tasks";

/**
 * One cron routine firing one task, with run row + receipt (WS-09 slice 1; 09 §4).
 *
 * No database, no model, no live cron. The clock is a variable the test moves by
 * hand, the turn is a stub, and the ledger is in-memory — so what is under test is
 * the sequence the slice promises: a due schedule becomes exactly one task, one run
 * row closed with its outcome, and one receipt naming the run. Fatigue and
 * lease-expiry are slice 2 and appear here only as absences: one firing, one run,
 * no counters.
 */

const ROUTINE: RoutineDefinition = {
  id: "routine_standup",
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
  const ledger: TaskLedger = createTaskLedger({ now: clock.now });
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

describe("one cron routine firing one task", () => {
  test("a due schedule creates a task, a run row, and a receipt", async () => {
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
    expect(firing.task.key).toBe("routine_standup:2026-08-26T09:00Z");
    expect(firing.task.producer).toEqual({
      kind: "routine",
      routineId: "routine_standup",
    });
    expect(firing.task.scheduledFor).toEqual(DUE);
    expect(firing.task.status).toBe("succeeded");

    expect(firing.run.taskId).toBe(firing.task.id);
    expect(firing.run.status).toBe("succeeded");
    expect(firing.run.startedAt).toEqual(new Date("2026-08-26T09:00:30.000Z"));
    expect(firing.run.finishedAt).toEqual(new Date("2026-08-26T09:00:30.000Z"));
    expect(firing.run.error).toBeNull();

    expect(firing.receipt.taskId).toBe(firing.task.id);
    expect(firing.receipt.runId).toBe(firing.run.id);
    expect(firing.receipt.kind).toBe("receipt");

    expect(turns).toHaveLength(1);
    expect(turns[0]?.instruction).toBe("Post the standup summary.");
    expect(turns[0]?.scheduledFor).toEqual(DUE);
    expect(ledger.counts()).toEqual({ tasks: 1, runs: 1, receipts: 1 });
  });

  test("the same due minute fired twice runs the turn once", async () => {
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
    expect(ledger.counts()).toEqual({ tasks: 1, runs: 1, receipts: 1 });
  });

  test("a schedule that has not fired yet creates nothing", async () => {
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
    expect(ledger.counts()).toEqual({ tasks: 0, runs: 0, receipts: 0 });
  });

  test("a failing turn closes the run as failed and still records a receipt", async () => {
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
    expect(firing.receipt.runId).toBe(firing.run.id);
    expect(firing.receipt.detail).toContain("the model said no");
    expect(ledger.counts()).toEqual({ tasks: 1, runs: 1, receipts: 1 });
  });

  test("the next occurrence fires anew once time moves on", async () => {
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
    expect(next.task.key).toBe("routine_standup:2026-08-27T09:00Z");
    expect(turns).toHaveLength(2);
    expect(ledger.counts()).toEqual({ tasks: 2, runs: 2, receipts: 2 });
  });

  test("a receipt needs a finished run, and a run finishes once", async () => {
    const { clock, ledger } = harness("2026-08-26T09:00:30.000Z");

    const { task } = ledger.offer({
      key: "routine_standup:2026-08-26T09:00Z",
      routineId: "routine_standup",
      scheduledFor: DUE,
    });
    const run = ledger.startRun(task.id);
    expect(() =>
      ledger.recordReceipt(run.id, {
        title: "too early",
        detail: "no outcome yet",
      }),
    ).toThrow(TaskLedgerError);

    ledger.finishRun(run.id, "succeeded");
    const kept = ledger.finishRun(run.id, "failed", "a late failure");
    expect(kept.status).toBe("succeeded");
    expect(kept.error).toBeNull();

    const receipt = ledger.recordReceipt(run.id, {
      title: "routine fired",
      detail: "done",
    });
    expect(receipt.at).toEqual(clock.now());
  });
});
