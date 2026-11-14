/**
 * Watched pages (W0 D4:A; 01 §5; 25 M4).
 *
 * One row per watch: a page (`url`) re-fetched every `intervalMinutes`, firing when its
 * `condition` matches the fresh snapshot. Absorbs the legacy `Monitor` kind
 * (`taskId`, `url`, `condition`, `value`, `intervalMinutes`, `status`, `nextCheckAt`) per
 * 01 §6; the legacy owner string becomes `owner_user_id` on import.
 *
 * FIRST SLICE PLUS THE FAN-OUT SLICE. This table records watch state; deciding fired/not
 * lives in the pure executor (`src/monitors/check.ts`), and a firing fans out exactly one
 * deduplicated notification row through `src/monitors/fanout.ts` (25 M6), persisted by
 * `src/monitors/store.ts`. Failure backoff and the 5-strike auto-pause columns
 * (`consecutive_failures`), the firing sequence behind the `monitor:<id>:<seq>:<hash>`
 * dedup keys (`alert_sequence`) and the relative-time quiet baseline (`last_timeless_hash`)
 * travel with that slice — they are here because a real scheduler cannot persist fan-out
 * state without them.
 *
 * `task_id` references the unified `tasks` table (TD-03), which now exists: the check
 * that runs a watch is recorded as a task like any other. It stays nullable and lets the
 * task go with `set null`, because a watch outlives the individual firings that ran it.
 * The legacy import (01 §6) that would backfill the legacy `Monitor` kind's ids is a
 * later slice; nothing here reads a legacy row.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { tasks } from "./work";

export type MonitorCondition = "change" | "contains" | "price_below";
export type MonitorStatus = "active" | "paused" | "stopped";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Unified-task link (TD-03). The firing that ran this check, when it ran as a
     * task; null keeps meaning "this check did not ride a task row".
     */
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    /** The watched page. Only http(s) targets are checkable. */
    url: text("url").notNull(),
    condition: text("condition")
      .$type<MonitorCondition>()
      .notNull()
      .default("change"),
    /** Match value: substring for `contains`, positive price for `price_below`, unused for `change`. */
    value: text("value").notNull().default(""),
    intervalMinutes: integer("interval_minutes").notNull().default(15),
    status: text("status").$type<MonitorStatus>().notNull().default("active"),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** Hash of the last normalized snapshot; null until the first check saves a baseline. */
    lastHash: text("last_hash"),
    /** Excerpt of the last snapshot (≤1000 chars), for review without re-fetching. */
    lastValue: text("last_value"),
    checks: integer("checks").notNull().default(0),
    /** Why the last check failed; null when the last check succeeded. */
    error: text("error"),
    /**
     * Consecutive fetch failures. Reset to zero by any successful check; the fifth
     * strike in a row pauses the monitor instead of scheduling a sixth (25 M6).
     */
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /**
     * How many notification-worthy firings this monitor has had. The next firing
     * notifies as `alert_sequence + 1`, which is what makes a replay of the same
     * firing compute the same `monitor:<id>:<seq>:<hash>` dedup key.
     */
    alertSequence: integer("alert_sequence").notNull().default(0),
    /**
     * Fingerprint of the last snapshot with relative times blanked out. Equal on the
     * next check means only those times changed, and a `change` firing stays quiet.
     */
    lastTimelessHash: text("last_timeless_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("monitors_owner_idx").on(table.ownerUserId, table.status),
    // The due sweep's own query: active watches whose next check has come due, oldest first.
    index("monitors_due_idx").on(table.status, table.nextCheckAt),
    check(
      "monitors_interval_check",
      sql`${table.intervalMinutes} >= 1 AND ${table.intervalMinutes} <= 10080`,
    ),
    check(
      "monitors_condition_check",
      sql`${table.condition} IN ('change', 'contains', 'price_below')`,
    ),
    check(
      "monitors_status_check",
      sql`${table.status} IN ('active', 'paused', 'stopped')`,
    ),
  ],
);

export type Monitor = typeof monitors.$inferSelect;
