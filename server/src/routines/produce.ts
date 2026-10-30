/**
 * A routine firing, as a producer of unified tasks (WS-09; 09 §4, 08 §6).
 *
 * One cron routine firing one task: the schedule names the due minute, the durable
 * ledger in `server/src/work/tasks.ts` takes the task + run row + receipt, and the
 * turn itself is injected so this never dials a model and never reads a live clock.
 * Both moments that decide anything — `after` for the schedule, `now` for whether it
 * is due — arrive as arguments, which is what "control time explicitly" means here.
 *
 * SCHEDULERS STAY PRODUCERS (09 R5). This decides what should fire and records that
 * it did; leases, retries, fatigue and expiry live on the queue and the runner that
 * already own them. Nothing here claims, renews or counts. Duplicate-fire is answered
 * at the storage layer: the task key this builds is unique on the `tasks` table and
 * the same string the queue's `(kind, key)` idempotence uses, so concurrent sweeps and
 * replayed leases collapse into the one row that got there first.
 */
import type { Task, TaskLedger, TaskReceipt, TaskRun } from "../work/tasks";
import { nextOccurrence } from "./schedule";

export type RoutineDefinition = {
  id: string;
  cron: string;
  timezone: string;
  instruction: string;
};

/** The schedule has not produced a firing by `now`: nothing was created. */
export class RoutineNotDueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineNotDueError";
  }
}

/** Everything one firing leaves behind: the task, its run row, and the receipt. */
export type RoutineFiring = {
  task: Task;
  run: TaskRun;
  receipt: TaskReceipt;
  /** False means the same due minute was fired before: the existing triple, not new rows. */
  offered: boolean;
};

/**
 * The minute a firing was due, rendered the same way by every caller.
 *
 * `2026-08-26T09:00Z`: ISO, truncated to the minute, always UTC, no seconds. This
 * string is half of the task key, so THE FORMAT IS THE IDEMPOTENCE — the same
 * contract `sweep.ts` pins for its offer key, asserted literally in the tests rather
 * than recomputed. Truncated, never rounded, so a stamp never names a minute it is
 * not in.
 */
function minuteKey(due: Date): string {
  return `${due.toISOString().slice(0, 16)}Z`;
}

export async function fireRoutineTask(options: {
  routine: RoutineDefinition;
  /** The moment the schedule is measured from — the last firing, or the test's start. */
  after: Date;
  /** The clock, controlled by the caller. */
  now: () => Date;
  ledger: TaskLedger;
  /** The turn itself, injected so no firing dials a model. Resolves with the reply. */
  run: (input: { instruction: string; scheduledFor: Date }) => Promise<string>;
}): Promise<RoutineFiring> {
  const { routine, ledger } = options;
  // Refused schedules propagate as the schedule's own refusal, like the store: a cron
  // nobody can read is a firing nobody can name.
  const scheduledFor = nextOccurrence(
    routine.cron,
    routine.timezone,
    options.after,
  );
  const at = options.now();
  if (scheduledFor.getTime() > at.getTime()) {
    throw new RoutineNotDueError(
      `That routine is not due until ${scheduledFor.toISOString()}.`,
    );
  }

  const key = `${routine.id}:${minuteKey(scheduledFor)}`;
  const { task, offered } = await ledger.offer({
    key,
    producer: { kind: "routine", id: routine.id },
    scheduledFor,
  });
  if (!offered) {
    // Fired before: the run row and the receipt are already there, so hand back the
    // triple rather than running the turn a second time for one due minute.
    const run = await ledger.runForTask(task.id);
    const receipt = run ? await ledger.receiptForRun(run.id) : null;
    if (run && receipt) return { task, run, receipt, offered };
    throw new Error("an offered task has no run row or receipt");
  }

  const run = await ledger.startRun(task.id);
  /*
   * `fire` never throws for a turn's failure. Every outcome a turn can have is a row
   * the ledger owns — succeeded or failed, each with its receipt — which is the
   * runner's discipline in miniature: whoever fires must not have to catch what the
   * firing already recorded. Only not-due, refused schedules and ledger misuse throw.
   */
  try {
    await options.run({ instruction: routine.instruction, scheduledFor });
    const finished = await ledger.finishRun(run.id, "succeeded");
    const receipt = await ledger.recordReceipt(run.id, {
      title: "routine fired",
      detail: `Fired on schedule for ${minuteKey(scheduledFor)}.`,
    });
    // The task snapshot the offer returned predates its own outcome; the row now
    // holds the run's status, and a task is its run's outcome by the ledger's rule.
    return {
      task: { ...task, status: finished.status },
      run: finished,
      receipt,
      offered,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const finished = await ledger.finishRun(run.id, "failed", reason);
    const receipt = await ledger.recordReceipt(run.id, {
      title: "routine failed",
      detail: `The scheduled firing failed: ${reason}`,
    });
    return {
      task: { ...task, status: finished.status },
      run: finished,
      receipt,
      offered,
    };
  }
}
