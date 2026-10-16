/**
 * Watched pages (W0 D4:A; 01 §5; 25 M4).
 *
 * One row per watch: a page (`url`) re-fetched every `intervalMinutes`, firing when its
 * `condition` matches the fresh snapshot. Absorbs the legacy `Monitor` kind
 * (`taskId`, `url`, `condition`, `value`, `intervalMinutes`, `status`, `nextCheckAt`) per
 * 01 §6; the legacy owner string becomes `owner_user_id` on import.
 *
 * FIRST SLICE ONLY. This table records watch state; deciding fired/not lives in the
 * pure executor (`src/monitors/check.ts`), and alert fan-out stays quiet — no
 * notification rows are written from a firing until the D9 route consumer exists
 * (25 R6). Failure backoff, the 5-strike auto-pause, the relative-time quiet rule and
 * the `monitor:<id>:<seq>:<hash>` dedup keys land with that slice, not here.
 *
 * `task_id` carries no foreign key yet: the unified `tasks` table lands in a later
 * slice, and a reference to a table that does not exist would refuse every watch
 * until it does (same reason as `notifications.task_id`).
 */
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./core";

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
    /** Unified-task link once `tasks` lands; plain text until then (see header). */
    taskId: text("task_id"),
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
