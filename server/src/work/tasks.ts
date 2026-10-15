/**
 * The unified task ledger, first slice (WS-09 slice 1; 09 §4, 08 §6).
 *
 * The end state (01 §5) is `tasks` / `task_runs` / `task_events` tables that every
 * scheduler enqueues into, with the schedulers kept as producers (09 R5). Those tables
 * do not exist yet, so this slice proves the SHAPE in code, with no database and no
 * clock: one task + one run row + one receipt event, all on an injected `now`.
 *
 * WHAT THIS IS NOT. No leases, no attempts, no retries — that is slice 2, on top of
 * `server/src/work/queue.ts`, which already owns leases on the database's clock. No
 * fatigue counting either — the runner's fatigue rule stays where it is until the
 * unified runs carry the history it counts. A second lease or counter grown here is
 * the duplicated firing mechanism the routines store header exists to prevent.
 */
export type TaskStatus = "open" | "running" | "succeeded" | "failed";

export type TaskProducer = { kind: "routine"; routineId: string };

export type Task = {
  id: string;
  /** The identity of the work: `${routineId}:${minute the firing was due}`. */
  key: string;
  producer: TaskProducer;
  scheduledFor: Date;
  status: TaskStatus;
  createdAt: Date;
};

export type TaskRunStatus = "running" | "succeeded" | "failed";

export type TaskRun = {
  id: string;
  taskId: string;
  status: TaskRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
};

export type TaskReceipt = {
  id: string;
  taskId: string;
  runId: string;
  /** The `task_events` kind this becomes on import. One kind, because slice 1 records one thing. */
  kind: "receipt";
  title: string;
  /**
   * The outcome in one sentence — never the turn's content. Receipts are read by pages
   * and feeds the turn never saw, so anything secret that reaches the reply must stop
   * before this field.
   */
  detail: string;
  at: Date;
};

export class TaskLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskLedgerError";
  }
}

/**
 * How much of a reason a receipt carries. Outcomes, not transcripts: the run row
 * owns the full error and the channel owns the reply, so the receipt stays a line.
 */
export const MAX_RECEIPT_DETAIL_CODE_POINTS = 160;

function shorten(detail: string): string {
  const codePoints = Array.from(detail);
  if (codePoints.length <= MAX_RECEIPT_DETAIL_CODE_POINTS) return detail;
  return `${codePoints.slice(0, MAX_RECEIPT_DETAIL_CODE_POINTS - 1).join("")}…`;
}

export type TaskLedger = {
  /**
   * Offer a task, or leave what is there. Idempotent on the key: `{offered: false}`
   * is the same firing seen again, not a second piece of work — the queue's
   * `"queued" | "already"` contract in ledger form.
   */
  offer(input: { key: string; routineId: string; scheduledFor: Date }): {
    task: Task;
    offered: boolean;
  };
  /** Open the task's one run row. A task runs once in this slice; retries are slice 2. */
  startRun(taskId: string): TaskRun;
  /** Close a run row, and with it the task. Finish-once: a second finish is a no-op. */
  finishRun(
    runId: string,
    status: "succeeded" | "failed",
    error?: string,
  ): TaskRun;
  /**
   * Record what happened. The run must already be finished: a receipt answers what
   * happened, never what is happening, so an open run has nothing to receipt yet.
   */
  recordReceipt(
    runId: string,
    input: { title: string; detail: string },
  ): TaskReceipt;
  runForTask(taskId: string): TaskRun | null;
  receiptForRun(runId: string): TaskReceipt | null;
  counts(): { tasks: number; runs: number; receipts: number };
};

export function createTaskLedger(options?: {
  /** The clock, so tests put a firing anywhere they like. Defaulted, never live by need. */
  now?: () => Date;
}): TaskLedger {
  const now = options?.now ?? (() => new Date());
  const tasks = new Map<string, Task>();
  const tasksByKey = new Map<string, Task>();
  const runs = new Map<string, TaskRun>();
  const runByTask = new Map<string, TaskRun>();
  const receipts = new Map<string, TaskReceipt>();
  const receiptByRun = new Map<string, TaskReceipt>();

  return {
    offer(input) {
      const existing = tasksByKey.get(input.key);
      if (existing) return { task: existing, offered: false };
      const task: Task = {
        id: `task_${crypto.randomUUID()}`,
        key: input.key,
        producer: { kind: "routine", routineId: input.routineId },
        scheduledFor: input.scheduledFor,
        status: "open",
        createdAt: now(),
      };
      tasks.set(task.id, task);
      tasksByKey.set(task.key, task);
      return { task, offered: true };
    },

    startRun(taskId) {
      const task = tasks.get(taskId);
      if (!task) throw new TaskLedgerError("That task does not exist.");
      if (task.status !== "open") {
        throw new TaskLedgerError("That task has already run.");
      }
      const run: TaskRun = {
        id: `task_run_${crypto.randomUUID()}`,
        taskId,
        status: "running",
        startedAt: now(),
        finishedAt: null,
        error: null,
      };
      runs.set(run.id, run);
      runByTask.set(taskId, run);
      task.status = "running";
      return run;
    },

    finishRun(runId, status, error) {
      const run = runs.get(runId);
      if (!run) throw new TaskLedgerError("That run does not exist.");
      if (run.status !== "running") return run;
      run.status = status;
      run.finishedAt = now();
      run.error = error === undefined ? null : shorten(error);
      const task = tasks.get(run.taskId);
      if (task) task.status = status;
      return run;
    },

    recordReceipt(runId, input) {
      const run = runs.get(runId);
      if (!run) throw new TaskLedgerError("That run does not exist.");
      if (run.status === "running") {
        throw new TaskLedgerError(
          "That run is still open, and an open run has no outcome to receipt.",
        );
      }
      const existing = receiptByRun.get(runId);
      if (existing) return existing;
      const receipt: TaskReceipt = {
        id: `task_event_${crypto.randomUUID()}`,
        taskId: run.taskId,
        runId,
        kind: "receipt",
        title: input.title,
        detail: shorten(input.detail),
        at: now(),
      };
      receipts.set(receipt.id, receipt);
      receiptByRun.set(runId, receipt);
      return receipt;
    },

    runForTask(taskId) {
      return runByTask.get(taskId) ?? null;
    },

    receiptForRun(runId) {
      return receiptByRun.get(runId) ?? null;
    },

    counts() {
      return { tasks: tasks.size, runs: runs.size, receipts: receipts.size };
    },
  };
}
