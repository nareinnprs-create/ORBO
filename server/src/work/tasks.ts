/**
 * The unified task ledger, durable (WS-09 slice 2; TD-03; 01 §5, 08 §6).
 *
 * The three tables the shape proved in slice 1 now exist (`tasks` / `task_runs` /
 * `task_events` in `../db/schema/work.ts`), and this is the same offer/start/finish/
 * receipt discipline over them. Every scheduler enqueues here and stays a producer
 * (09 R5); what the ledger owns is WHAT HAPPENED — the task, its one run row, and the
 * receipt a person reads — which survives a restart because it was never in this
 * process's memory to lose.
 *
 * WHO OWNS WHAT. Leases, attempts and retries stay on `server/src/work/queue.ts`, which
 * already owns them on the database's clock; this module grows no lease and no counter.
 * The two layers share one idempotence key instead: the task key IS the queue key
 * (`routine_standup:2026-08-26T09:00Z`, `suggestion:<id>`), unique on both tables, so a
 * firing replayed by a reclaimed lease, a restart or three replicas waking at 07:00
 * collides with the row that is already there and is answered `offered: false` — the
 * queue's `"queued" | "already"` contract in ledger form, enforced by a unique index
 * rather than by a `Map.get`. That is the double-fire fix: task creation is one
 * `insert … on conflict do nothing` per key, the same step the queue takes, so the
 * winner and the replay can never both proceed.
 *
 * WHAT THIS IS NOT. No fatigue counting — the runner's fatigue rule stays where it is
 * until the unified runs carry the history it counts. No purge — the queue is swept on
 * retention windows because it is what still wants doing; the ledger is the record and
 * is kept.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { taskEvents, taskRuns, tasks } from "../db/schema/work";

export type TaskStatus = "open" | "running" | "succeeded" | "failed";

/**
 * What offered the task. Once one kind rode another (`proactive:<settingId>` inside a
 * `routine` producer, TD-05's namespace-by-convention); kinds are their own column now,
 * so the key namespace and the producer kind each say the one true thing about a row.
 */
export type TaskProducerKind = "routine" | "proactive" | "finance";

export type TaskProducer = { kind: TaskProducerKind; id: string };

export type Task = {
  id: string;
  /** The identity of the work: `${routineId}:${minute the firing was due}` and friends. */
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
  /** The `task_events` kind. One kind, because slice one records one thing. */
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
   * Offer a task, or leave what is there. Idempotent on the key: `{offered: false}` is
   * the same firing seen again, not a second piece of work. One insert on conflict do
   * nothing against the unique key — the queue's `"queued" | "already"` contract, and
   * the same step, so a concurrent second offer cannot double-create.
   */
  offer(input: {
    key: string;
    producer: TaskProducer;
    scheduledFor: Date;
  }): Promise<{ task: Task; offered: boolean }>;
  /**
   * Open the task's one run row. A task runs once: the run row is unique per task and
   * the task leaves `open` in the same transaction, so a second start is refused even
   * when two replicas race.
   */
  startRun(taskId: string): Promise<TaskRun>;
  /** Close a run row, and with it the task. Finish-once: a second finish is a no-op. */
  finishRun(
    runId: string,
    status: "succeeded" | "failed",
    error?: string,
  ): Promise<TaskRun>;
  /**
   * Record what happened. The run must already be finished: a receipt answers what
   * happened, never what is happening, so an open run has nothing to receipt yet.
   */
  recordReceipt(
    runId: string,
    input: { title: string; detail: string },
  ): Promise<TaskReceipt>;
  runForTask(taskId: string): Promise<TaskRun | null>;
  receiptForRun(runId: string): Promise<TaskReceipt | null>;
  counts(): Promise<{ tasks: number; runs: number; receipts: number }>;
};

type TaskRow = typeof tasks.$inferSelect;
type TaskRunRow = typeof taskRuns.$inferSelect;
type TaskEventRow = typeof taskEvents.$inferSelect;

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  key: row.key,
  producer: { kind: row.producerKind, id: row.producerId },
  scheduledFor: row.scheduledFor,
  status: row.status,
  createdAt: row.createdAt,
});

const toRun = (row: TaskRunRow): TaskRun => ({
  id: row.id,
  taskId: row.taskId,
  status: row.status,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  error: row.error,
});

const toReceipt = (row: TaskEventRow): TaskReceipt => ({
  id: row.id,
  taskId: row.taskId,
  runId: row.runId,
  kind: "receipt",
  title: row.title,
  detail: row.detail,
  at: row.at,
});

export function createTaskLedger(
  database: Database,
  options?: {
    /** The clock, so tests put a firing anywhere they like. Defaulted, never live by need. */
    now?: () => Date;
  },
): TaskLedger {
  const now = options?.now ?? (() => new Date());

  return {
    async offer(input) {
      const at = now();
      const [written] = await database
        .insert(tasks)
        .values({
          id: `task_${crypto.randomUUID()}`,
          key: input.key,
          producerKind: input.producer.kind,
          producerId: input.producer.id,
          scheduledFor: input.scheduledFor,
          status: "open",
          createdAt: at,
          updatedAt: at,
        })
        /*
         * Nothing is updated on conflict, deliberately. The key is the identity of the
         * work, so a second offer of the same thing is the same thing, not a new one —
         * word for word the queue's own rule, and enforced by its own unique index so
         * the two layers cannot disagree about which firings already happened.
         */
        .onConflictDoNothing({ target: tasks.key })
        .returning();
      if (written) return { task: toTask(written), offered: true };
      const [existing] = await database
        .select()
        .from(tasks)
        .where(eq(tasks.key, input.key))
        .limit(1);
      if (!existing) {
        throw new TaskLedgerError(
          "That key collided and then named no task, which cannot happen.",
        );
      }
      return { task: toTask(existing), offered: false };
    },

    async startRun(taskId) {
      return database.transaction(async (transaction) => {
        const at = now();
        /*
         * Leaving `open` and opening the run row are one step. A task that already left
         * `open` flips nothing, and the run insert behind it never happens: whoever
         * gets here second is told, not given a second run.
         */
        const [flipped] = await transaction
          .update(tasks)
          .set({ status: "running", updatedAt: at })
          .where(and(eq(tasks.id, taskId), eq(tasks.status, "open")))
          .returning();
        if (!flipped) {
          const [existing] = await transaction
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);
          if (!existing) throw new TaskLedgerError("That task does not exist.");
          throw new TaskLedgerError("That task has already run.");
        }
        const [run] = await transaction
          .insert(taskRuns)
          .values({
            id: `task_run_${crypto.randomUUID()}`,
            taskId,
            status: "running",
            startedAt: at,
            finishedAt: null,
            error: null,
          })
          .onConflictDoNothing({ target: taskRuns.taskId })
          .returning();
        if (!run) {
          throw new TaskLedgerError(
            "That task left open without a run row, which cannot happen.",
          );
        }
        return toRun(run);
      });
    },

    async finishRun(runId, status, error) {
      const at = now();
      const [finished] = await database
        .update(taskRuns)
        .set({
          status,
          finishedAt: at,
          error: error === undefined ? null : shorten(error),
        })
        /*
         * Only while still running. A run already closed keeps the outcome it closed
         * with: finish-once, with the second caller handed the first outcome rather
         * than an error, because "already finished" is not a misuse, it is a replay.
         */
        .where(and(eq(taskRuns.id, runId), eq(taskRuns.status, "running")))
        .returning();
      if (!finished) {
        const [existing] = await database
          .select()
          .from(taskRuns)
          .where(eq(taskRuns.id, runId))
          .limit(1);
        if (!existing) throw new TaskLedgerError("That run does not exist.");
        return toRun(existing);
      }
      await database
        .update(tasks)
        .set({ status, updatedAt: at })
        .where(eq(tasks.id, finished.taskId));
      return toRun(finished);
    },

    async recordReceipt(runId, input) {
      const [run] = await database
        .select()
        .from(taskRuns)
        .where(eq(taskRuns.id, runId))
        .limit(1);
      if (!run) throw new TaskLedgerError("That run does not exist.");
      if (run.status === "running") {
        throw new TaskLedgerError(
          "That run is still open, and an open run has no outcome to receipt.",
        );
      }
      const [existing] = await database
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.runId, runId))
        .limit(1);
      if (existing) return toReceipt(existing);
      const [written] = await database
        .insert(taskEvents)
        .values({
          id: `task_event_${crypto.randomUUID()}`,
          taskId: run.taskId,
          runId,
          kind: "receipt",
          title: input.title,
          detail: shorten(input.detail),
          at: now(),
        })
        .onConflictDoNothing({ target: taskEvents.runId })
        .returning();
      if (written) return toReceipt(written);
      const [winner] = await database
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.runId, runId))
        .limit(1);
      if (!winner) {
        throw new TaskLedgerError(
          "That receipt collided and then named no event, which cannot happen.",
        );
      }
      return toReceipt(winner);
    },

    async runForTask(taskId) {
      const [run] = await database
        .select()
        .from(taskRuns)
        .where(eq(taskRuns.taskId, taskId))
        .limit(1);
      return run ? toRun(run) : null;
    },

    async receiptForRun(runId) {
      const [receipt] = await database
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.runId, runId))
        .limit(1);
      return receipt ? toReceipt(receipt) : null;
    },

    async counts() {
      const result = await database.execute<{
        tasks: number;
        runs: number;
        receipts: number;
      }>(sql`
        select
          (select count(*) from "tasks")::int as "tasks",
          (select count(*) from "task_runs")::int as "runs",
          (select count(*) from "task_events")::int as "receipts"
      `);
      const rows = (
        Array.isArray(result)
          ? result
          : ((result as { rows?: unknown[] })?.rows ?? [])
      ) as { tasks: number; runs: number; receipts: number }[];
      return rows[0] ?? { tasks: 0, runs: 0, receipts: 0 };
    },
  };
}
