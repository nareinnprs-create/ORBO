/**
 * The send ledger (see `../db/schema/sends.ts`): what this deployment's Bots have actually sent.
 *
 * Two questions are answered here and nowhere else. The per-user per-day cap is counted from these
 * rows, so a restart or a second replica counts the same sends rather than starting fresh; and a
 * row is written for every send that left the deployment, so "what did that Bot email" has an
 * answer that does not depend on a provider's own history.
 *
 * CAPS COUNT UTC DAYS, on purpose. A quiet-hours window needs the person's local clock, because it
 * is about waking somebody; a send cap is about volume, and the deployment already reports its
 * numbers in one clock. Two clocks for one table would be a bug generator, not flexibility.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { botSends } from "../db/schema/sends";

/** The kind of a send, the same vocabulary the table's check constraint holds. */
export type SendKind = "email" | "slack";

export function createSendsStore(database: Database) {
  return {
    /** How many sends of one kind this person's Bots have made today (UTC day). */
    async countToday(
      ownerUserId: string,
      kind: SendKind,
      now: Date,
    ): Promise<number> {
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const [row] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(botSends)
        .where(
          and(
            eq(botSends.ownerUserId, ownerUserId),
            eq(botSends.kind, kind),
            gte(botSends.createdAt, dayStart),
          ),
        );
      return row?.count ?? 0;
    },
    /** One send that left the deployment. Written after the provider accepted it. */
    async record(input: {
      ownerUserId: string;
      agentId: string;
      kind: SendKind;
      target: string;
      providerId: string | null;
    }): Promise<void> {
      await database.insert(botSends).values({
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        agentId: input.agentId,
        kind: input.kind,
        target: input.target.slice(0, 500),
        providerId: input.providerId?.slice(0, 500) ?? null,
      });
    },
  };
}

export type SendsStore = ReturnType<typeof createSendsStore>;
