import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { jsonb } from "./json";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Durable work, claimed by whichever replica gets there first, leased so a dead one's work comes
 * back.
 *
 * ONE MECHANISM, THREE FEATURES. Suspending idle computers needs it, scheduled routines need it, and
 * a hop from one Bot to another needs it. Written once with all three in view rather than three
 * times slightly differently, because the parts that are easy to get wrong are the same every time:
 * who owns an item, what happens when the owner dies, and whether a recovery can run something
 * twice.
 *
 * POSTGRES, NOT A QUEUE. It is already the thing every replica shares, and `for update skip locked`
 * is exactly this problem: each replica takes rows nobody else holds, no coordinator, no leader
 * election, no single point of failure, and adding a replica adds throughput rather than contention.
 *
 * NOT `setInterval`. The audit-retention sweep uses one and is safe only because deleting old rows
 * twice is the same as deleting them once. Anything that spends money, calls a tool or posts a
 * message is not that: fired by every replica it happens N times, and on a cluster that is Tuesday.
 */
export const workItems = pgTable(
  "work_items",
  {
    /** What kind of work. `computer.suspend` today; routines and bot-to-bot hops later. */
    kind: text("kind").notNull(),
    /**
     * What the work is about, unique within its kind.
     *
     * The Bot id for a computer to suspend, and for a routine the routine and the minute it was due,
     * because IDEMPOTENCE LIVES HERE. A routine due at 07:00 must run once even if three replicas
     * wake together and a lease is reclaimed mid-flight; making the key carry the scheduled time is
     * what turns "fire it again" into "insert that already exists" rather than a second run. Without
     * it every recovery path is also a duplicate-run path.
     */
    key: text("key").notNull(),
    /** When this becomes eligible. A claim never sees an item before its time. */
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Which replica holds it, and until when.
     *
     * Null owner means nobody has it. A lease in the past means whoever had it stopped renewing, and
     * the row is free again: that is the whole recovery story, and it needs no process to notice a
     * death, only the next claim to look at the clock.
     */
    claimedBy: text("claimed_by"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    /**
     * How many times this has been handed out.
     *
     * A RECLAIMED ITEM IS NOT A FRESH ONE, and the difference matters enough to count rather than
     * infer. An item on its first attempt has certainly not run; one on its second may already have
     * called a tool and spent money before its owner died. Whatever picks it up has to be able to
     * tell those apart, so it is a number here rather than a state folded into failure.
     */
    attempts: integer("attempts").notNull().default(0),
    /**
     * When it was done, or null while it still wants doing.
     *
     * KEPT RATHER THAN DELETED, because the idempotence this table promises has to survive
     * completion. Finishing used to remove the row, so a routine due at 07:00 that ran and finished
     * was re-offered cleanly by the next replica to wake late and ran a second time: the insert that
     * was supposed to collide had nothing left to collide with. A finished row is the collision.
     *
     * Swept on a retention window rather than kept forever, because a queue is not an archive.
     */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /**
     * Why the last attempt gave up.
     *
     * An item that has run out of attempts stops being handed out and stays here with its count and
     * its reason. That is the terminal state: visible in the table somebody can query rather than a
     * row that quietly retries until the end of time.
     */
    lastError: text("last_error"),
    /** Anything the work needs that is not in the key. */
    payload: jsonb("payload").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.key] }),
    // The claim's own query: due, unclaimed or expired, not yet finished, oldest first.
    index("work_items_claimable_idx").on(table.kind, table.runAt),
  ],
);

/**
 * The unified task ledger (01 §5; TD-03), made durable.
 *
 * One row per piece of work any scheduler offers: a routine's due minute, an accepted
 * suggestion, a spending import. The queue above owns leases and attempts — whether
 * something is being handed out right now, and to whom; this table owns WHAT HAPPENED —
 * the task, its one run, and the receipt a person reads. The two are kept apart on
 * purpose: the queue is what still wants doing and is swept away on retention windows,
 * the ledger is the record and is kept.
 *
 * IDEMPOTENCE LIVES IN THE KEY, the same place it lives in the queue. `key` is unique
 * across the whole table and the value is the same string the queue's `(kind, key)`
 * idempotence uses — `routine_standup:2026-08-26T09:00Z`, `suggestion:<id>` — so a
 * replayed offer (a lease reclaimed mid-flight, a restart republishing, three replicas
 * waking at 07:00) collides here exactly as it collides there, and one firing produces
 * one task whether it is replayed by the queue or by a caller.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    /** The identity of the work, unique across every producer. See the header. */
    key: text("key").notNull(),
    /** What offered it: a cron routine, a proactive setting, a spending import. */
    producerKind: text("producer_kind")
      .$type<"routine" | "proactive" | "finance">()
      .notNull(),
    /** The producer's own id: the routine id, `proactive:<settingId>`, the importer. */
    producerId: text("producer_id").notNull(),
    /** The minute the work was due, as the producer named it. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"open" | "running" | "succeeded" | "failed">()
      .notNull()
      .default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("tasks_key_key").on(table.key),
    index("tasks_producer_idx").on(table.producerKind, table.producerId),
    check(
      "tasks_status_check",
      sql`${table.status} IN ('open', 'running', 'succeeded', 'failed')`,
    ),
    check(
      "tasks_producer_kind_check",
      sql`${table.producerKind} IN ('routine', 'proactive', 'finance')`,
    ),
  ],
);

/**
 * One run of one task.
 *
 * A task runs once: `task_id` is unique, so a second `startRun` is an insert that
 * collides rather than a second execution. The full error text lives here, where
 * the run's own reader looks; the receipt beside it carries one line, never the
 * transcript (see `task_events.detail`).
 */
export const taskRuns = pgTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<"running" | "succeeded" | "failed">()
      .notNull()
      .default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (table) => [
    // One run per task, which is what makes startRun finish-once at the storage layer.
    uniqueIndex("task_runs_task_id_key").on(table.taskId),
    check(
      "task_runs_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'failed')`,
    ),
  ],
);

/**
 * What a finished run left behind, readable by pages and feeds the turn never saw.
 *
 * `kind` exists because the ledger will one day record more than receipts (01 §5's
 * `task_events`); slice one records one thing, so the check pins the one kind and the
 * column carries the name it will keep. One event per run: `run_id` is unique, so a
 * replayed receipt lands on the row that is already there.
 */
export const taskEvents = pgTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => taskRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("receipt"),
    title: text("title").notNull(),
    /**
     * The outcome in one sentence — never the turn's content. Receipts are read by
     * pages and feeds the turn never saw, so anything secret that reaches the reply
     * must stop before this field.
     */
    detail: text("detail").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("task_events_run_id_key").on(table.runId),
    index("task_events_task_idx").on(table.taskId),
    check("task_events_kind_check", sql`${table.kind} IN ('receipt')`),
  ],
);
