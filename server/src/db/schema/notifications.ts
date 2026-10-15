/**
 * Standalone notifications (W0 D9:A; 01 §5).
 *
 * Watch/monitor firings and task-done fan-out land here, absorbing legacy
 * `AgentNotification` (`taskId`, `title`, `body`, `read`) per 01 §6. Deliberately separate
 * from `proactive_suggestions`: suggestions answer "what should I consider", notifications
 * answer "what happened". Owner-scoped like every other person-visible row; the legacy
 * owner string becomes `owner_user_id` on import.
 *
 * `task_id` carries no foreign key yet: the unified `tasks` table lands in a later slice, and
 * a reference to a table that does not exist would refuse every alert until it does.
 */
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notifications_owner_idx").on(table.ownerUserId, table.createdAt),
    index("notifications_task_idx").on(table.taskId),
  ],
);
