import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { agents, users } from "./core";

/**
 * Schema owned by Sends: the ledger of what Bots have actually sent out of this deployment.
 *
 * One row per send, written when the send was handed to its provider. The table answers two
 * questions and nothing else: how many sends one person's Bots have made today (the per-user
 * per-day cap reads it), and what went out (the audit trail names the decision, this names the
 * send). Message bodies are deliberately absent — the audit trail's redaction rules and the
 * approval preview already govern where content is allowed to be copied, and a second copy of
 * every message body in a ledger nobody reads is a retention liability, not a record.
 */
export const botSends = pgTable(
  "bot_sends",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** `email` (SES) or `slack` (incoming webhook). */
    kind: text("kind").notNull(),
    /**
     * Who the send reached: the email address, or the credential key of the Slack webhook.
     * Never the message itself — see the table comment.
     */
    target: text("target").notNull(),
    /** The provider's own id for the send, when it gave one (SES's MessageId). */
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bot_sends_owner_kind_idx").on(
      table.ownerUserId,
      table.kind,
      table.createdAt,
    ),
    check(
      "bot_sends_kind_check",
      sql`${table.kind} IN ('email', 'slack')`,
    ),
  ],
);
