/**
 * Document pages (D2:A; 01 §5–§6).
 *
 * One row per page. Absorbs legacy `pages` (`spaceId`, `parentId`, `title`,
 * `content`, `revision`, `sourceThreadId`) per 01 §6; the legacy owner string
 * becomes `owner_user_id` on import — no raw owner strings are stored. A page
 * belongs to exactly one space; the agent↔page link never lives here (that is
 * `page_threads`, which lands with the review flow, not here).
 *
 * `parent_id` is self-referential and nullable: top-level pages have no parent,
 * and deleting a parent reparents its children in application code (the legacy
 * rule), so the foreign key is `set null` rather than `cascade` — the database
 * must never delete a subtree the application meant to keep. `source_thread_id`
 * is likewise `set null`: the thread that minted the page may go away while the
 * page stays. `page_threads` / `page_reviews` land with the review flow.
 *
 * Additive per 01 §7: a new empty table with a nullable-superset shape, so the
 * Spaces/Work importers can land without touching existing surfaces.
 */
import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { spaces } from "./spaces";
import { threads } from "./threads";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const pages = pgTable(
  "pages",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    /** Null for a top-level page. Set null (not cascade) on parent delete. */
    parentId: text("parent_id").references((): AnyPgColumn => pages.id, {
      onDelete: "set null",
    }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The document body. Legacy `content` (≤100k, enforced at the route). */
    content: text("content").notNull().default(""),
    /** Source or visual editor form. Defaults to markdown; routes validate. */
    format: text("format").notNull().default("markdown"),
    /** Optimistic-concurrency counter. Writers send `expectedRevision`. */
    revision: integer("revision").notNull().default(1),
    /** The thread that minted this page, if any. Survives the thread. */
    sourceThreadId: text("source_thread_id").references(
      () => threads.threadId,
      {
        onDelete: "set null",
      },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The space library listing: every page in one space, freshest first.
    index("pages_space_idx").on(table.spaceId, table.updatedAt),
    // Tree traversal: the children of one parent.
    index("pages_parent_idx").on(table.parentId),
    // One person's pages across spaces, newest first.
    index("pages_owner_idx").on(table.ownerUserId, table.createdAt),
  ],
);

export type Page = typeof pages.$inferSelect;
