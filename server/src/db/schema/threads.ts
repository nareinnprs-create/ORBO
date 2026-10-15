/**
 * Unified conversation identity (W0 D1:A; 01 §5).
 *
 * One row per conversation. `channels` stays the team surface; threads attach to it. Absorbs
 * legacy `thread_bindings` (`dotId`→`agent_id`, `ownerId`→`owner_user_id`) and legacy
 * `conversations` (owner string→`owner_user_id`) per 01 §6. `intelligence_channel_mappings`
 * remains the (user, channel, agent)→thread bridge for liveness; this row owns identity.
 *
 * Additive per 01 §7: new empty table, superset columns nullable so existing surfaces keep
 * working while importers land. A direct `/bot` chat deliberately keeps no channel, so
 * `channel_id` is nullable; `source` records which system minted the row.
 */
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { agents, channels, users } from "./core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const threads = pgTable(
  "threads",
  {
    /** The conversation identity. Minted by `POST /api/threads/mint`. */
    threadId: text("thread_id").primaryKey(),
    channelId: text("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Per-thread learning container, carried from legacy `thread_bindings`. Null is ordinary. */
    learningContainerId: text("learning_container_id"),
    /** Which system minted the row (`orbo`, `legacy`). Null for rows predating it. */
    source: text("source"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("threads_owner_idx").on(table.ownerUserId, table.createdAt),
    index("threads_channel_idx").on(table.channelId),
    index("threads_agent_idx").on(table.agentId),
  ],
);
