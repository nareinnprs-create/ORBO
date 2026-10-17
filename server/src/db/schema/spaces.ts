/**
 * Spaces + agent↔space membership (D2:A; 01 §5–§6).
 *
 * Spaces survive as the workspace container: one row per workspace, owned by one
 * person (`owner_user_id`), holding pages. Absorbs legacy `spaces` (`name`,
 * `description`) per 01 §6; the legacy single-owner string becomes `owner_user_id`
 * on import — no raw owner strings are stored.
 *
 * `agent_spaces` is the legacy `dot_spaces` ACL verbatim (`dotId`→`agent_id`):
 * which agents may work in which space. The default page destination previously kept
 * as a scalar (`dots.spaceId`) moves here as membership instead; the importer keeps
 * the `spaceId ∈ spaceIds` rule (`workspace.ts:175-181`).
 *
 * Additive per 01 §7: new empty tables, so existing surfaces keep working while
 * the importer lands. `page_threads` / `page_reviews` land with the review flow,
 * not here.
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { agents, users } from "./core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const spaces = pgTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("spaces_owner_idx").on(table.ownerUserId, table.createdAt)],
);

export const agentSpaces = pgTable(
  "agent_spaces",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.spaceId] }),
    // The reverse lookup: every agent that may work in one space. The primary
    // key serves the forward direction (every space one agent may enter).
    index("agent_spaces_space_idx").on(table.spaceId),
  ],
);

export type Space = typeof spaces.$inferSelect;
export type AgentSpace = typeof agentSpaces.$inferSelect;
