/**
 * Remembering what a conversation taught, because a person will not write their own memory entries.
 *
 * Offer then claim, like `channels/summary.ts`. The offer is derived from the tables rather than
 * from an event, so a missed sweep costs ten seconds where a missed event would cost the memory.
 *
 * shortcut: covers channel conversations only — a direct /bot chat has no thread row to read back,
 * so there is nothing to mine until those gain a durable transcript.
 */
import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { readFiring } from "../../../shared/routine-firing";
import type { ThreadTranscript } from "../channels/summary";
import { oneLine, textOf } from "../channels/text";
import type { Database } from "../db/client";
import {
  channelAgents,
  channels,
  intelligenceChannelMappings,
  memoryMining,
  workItems,
} from "../db/schema";
import { DEFAULT_MAX_ATTEMPTS, type WorkQueue } from "../work/queue";
import type { MemoryMiner } from "./miner";
import type { MemoryStore } from "./store";
import { MemoryRefusedError } from "./types";

export const MEMORY_MINING_KIND = "memory.mine";

/** How much of the conversation the model is shown: the tail, where the conclusions are. */
const MAX_EXCERPT_GRAPHEMES = 6000;

/** One pass forms a handful of facts; a conversation that taught more is re-offered by its next message. */
const MAX_FACTS_PER_RUN = 5;

export type MemoryMiningOptions = {
  database: Database;
  queue: WorkQueue;
  memories: MemoryStore;
  transcript: ThreadTranscript;
  mine: MemoryMiner;
  /** Who this replica is, for the lease. */
  owner: string;
  leaseMs?: number;
  maxAttempts?: number;
  /** How many conversations one pass will offer, and how many it will claim. */
  limit?: number;
};

export type MiningReport = {
  considered: number;
  mined: string[];
  skipped: { threadId: string; reason: string }[];
};

/** The channel's first Bot, oldest first: the one that will read the memory it formed back. */
const firstAgentId = sql<
  string | null
>`(select ${channelAgents.agentId} from ${channelAgents} where ${channelAgents.channelId} = ${channels.id} order by ${channelAgents.createdAt} asc limit 1)`;

/**
 * Offer every conversation spoken in since it was last mined, with a Bot to remember it.
 *
 * Offering is idempotent on (kind, key), so every replica and every later pass collapse onto one
 * row; a settled row is forgotten by the purge before the same conversation is offered again.
 */
export async function offerConversationsToMine(
  options: Pick<MemoryMiningOptions, "database" | "queue" | "limit">,
): Promise<{ offered: string[] }> {
  const rows = await options.database
    .select({
      threadId: intelligenceChannelMappings.threadId,
      ownerId: intelligenceChannelMappings.userId,
      channelId: channels.id,
      channelName: channels.name,
      lastMessageAt: channels.lastMessageAt,
      agentId: firstAgentId.as("agent_id"),
    })
    .from(intelligenceChannelMappings)
    .innerJoin(channels, eq(channels.id, intelligenceChannelMappings.channelId))
    .leftJoin(
      memoryMining,
      eq(memoryMining.threadId, intelligenceChannelMappings.threadId),
    )
    .where(
      and(
        isNull(channels.deletedAt),
        sql`${channels.lastMessageAt} is not null`,
        sql`${firstAgentId} is not null`,
        // Nothing new since the last read, or the queue already holds it, pending or settled:
        // offering again changes nothing, but takes one of the `limit` places.
        sql`(${memoryMining.threadId} is null or ${channels.lastMessageAt} > ${memoryMining.minedAt})`,
        notExists(
          options.database
            .select({ key: workItems.key })
            .from(workItems)
            .where(
              and(
                eq(workItems.kind, MEMORY_MINING_KIND),
                eq(workItems.key, intelligenceChannelMappings.threadId),
              ),
            ),
        ),
      ),
    )
    .limit(options.limit ?? 20);

  const offered: string[] = [];
  for (const row of rows) {
    await options.queue.offer({
      kind: MEMORY_MINING_KIND,
      key: row.threadId,
      payload: {
        threadId: row.threadId,
        ownerId: row.ownerId,
        agentId: row.agentId,
        channelId: row.channelId,
        channelName: row.channelName,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      },
    });
    offered.push(row.threadId);
  }
  return { offered };
}

/** Mine what this replica can claim. The lease is renewed per item: a model call is not instant. */
export async function mineClaimedConversations(
  options: MemoryMiningOptions,
): Promise<MiningReport> {
  const leaseMs = options.leaseMs ?? 60_000;
  const claimed = await options.queue.claim({
    kind: MEMORY_MINING_KIND,
    owner: options.owner,
    leaseMs,
    limit: options.limit ?? 5,
    ...(options.maxAttempts === undefined
      ? {}
      : { maxAttempts: options.maxAttempts }),
  });

  const report: MiningReport = {
    considered: claimed.length,
    mined: [],
    skipped: [],
  };

  for (const item of claimed) {
    const threadId = String(item.payload.threadId ?? item.key);
    if (
      !(await options.queue.renew({
        kind: MEMORY_MINING_KIND,
        key: item.key,
        owner: options.owner,
        leaseMs,
      }))
    ) {
      report.skipped.push({
        threadId,
        reason: "the lease went to another replica",
      });
      continue;
    }

    try {
      const attempt = await mineOne(options, item);
      if (attempt === "not yet") {
        // Put back, not finished: Intelligence has not persisted the message yet.
        await options.queue.release({
          kind: MEMORY_MINING_KIND,
          key: item.key,
          owner: options.owner,
          delayMs: 15_000,
          reason: "the conversation is not readable yet",
        });
        report.skipped.push({ threadId, reason: "not readable yet" });
        continue;
      }
      await options.queue.finish({
        kind: MEMORY_MINING_KIND,
        key: item.key,
        owner: options.owner,
      });
      if (attempt === "mined") report.mined.push(threadId);
      else report.skipped.push({ threadId, reason: attempt });
    } catch (error) {
      // Released and pushed out: a model that just refused will refuse again, and nothing is broken meanwhile.
      const reason =
        error instanceof Error ? error.message : "could not be mined";
      await options.queue.release({
        kind: MEMORY_MINING_KIND,
        key: item.key,
        owner: options.owner,
        delayMs: 60_000,
        reason,
      });
      // Said out loud when it gives up, because at the cap this loop simply never sees the thread
      // again and every pass afterwards looks clean.
      if (item.attempts >= (options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)) {
        console.warn(
          JSON.stringify({
            type: "memory-mining-gave-up",
            threadId,
            attempts: item.attempts,
            reason,
          }),
        );
      }
      report.skipped.push({ threadId, reason });
    }
  }

  return report;
}

/**
 * Three answers, so `"not yet"` is told apart from the rest: a conversation offered the instant
 * somebody speaks may have no message in Intelligence yet, and finishing it never remembers anything.
 */
type Attempt = "mined" | "not yet" | "nothing to mine";

async function mineOne(
  options: MemoryMiningOptions,
  item: { key: string; payload: Record<string, unknown> },
): Promise<Attempt> {
  const threadId = String(item.payload.threadId ?? item.key);
  const ownerId = item.payload.ownerId;
  const agentId = item.payload.agentId;
  const channelName = oneLine(String(item.payload.channelName ?? ""), 160);
  const lastMessageAt =
    typeof item.payload.lastMessageAt === "string"
      ? new Date(item.payload.lastMessageAt)
      : null;

  /* A queue key is not a foreign key, so work outlives its channel. Gone is final, not not-yet. */
  const [existing] = await options.database
    .select({ deletedAt: channels.deletedAt })
    .from(channels)
    .where(eq(channels.id, String(item.payload.channelId ?? "")));
  if (!existing || existing.deletedAt !== null) return "nothing to mine";

  // Without an owner or a Bot to remember for, there is nothing to do — a final answer, because
  // the payload was written by the offer above and does not mend itself.
  if (typeof ownerId !== "string" || typeof agentId !== "string")
    return "nothing to mine";

  const excerpt = await tailOf(options.transcript, {
    threadId,
    userId: ownerId,
  });
  if (!excerpt) return "not yet";

  // Final, unlike the two above: no key or an unusable answer does not change a minute later.
  const facts = await options.mine(excerpt);
  if (facts === null) return "nothing to mine";

  for (const fact of facts.slice(0, MAX_FACTS_PER_RUN)) {
    const content = oneLine(fact, 500);
    if (!content) continue;
    try {
      await options.memories.formMemory(ownerId, {
        agentId,
        content,
        sourceApp: channelName,
        ...(lastMessageAt ? { observedAt: lastMessageAt } : {}),
      });
    } catch (error) {
      // One fact the model phrased too long or too strangely is skipped, not the whole attempt:
      // the other facts stand, and the cursor moves so the model is not asked the same thing twice.
      if (!(error instanceof MemoryRefusedError)) throw error;
    }
  }

  if (lastMessageAt) {
    await options.database
      .insert(memoryMining)
      .values({
        threadId,
        ownerUserId: ownerId,
        agentId,
        minedAt: lastMessageAt,
      })
      .onConflictDoUpdate({
        target: memoryMining.threadId,
        set: { minedAt: lastMessageAt, updatedAt: new Date() },
        setWhere: sql`${memoryMining.minedAt} < ${lastMessageAt}`,
      });
  }
  return "mined";
}

/*
 * The tail of the conversation, not the opening: what it ended on is what to remember, and a
 * conversation that wandered long ago is not where today's facts are.
 */
async function tailOf(
  transcript: ThreadTranscript,
  owner: { threadId: string; userId: string },
): Promise<string | null> {
  const history = await transcript.getThreadMessages({
    threadId: owner.threadId,
    userId: owner.userId,
  });
  const lines: string[] = [];
  for (const message of history.messages) {
    // The system role carries a routine's firing frame, scaffolding and not facts. The person's
    // own frame is unwrapped first, the same as a transcript unwraps it before they read it.
    if (message.role === "system") continue;
    const raw = textOf(message.content);
    if (!raw) continue;
    const said = message.role === "user" ? (readFiring(raw) ?? raw) : raw;
    lines.push(`${message.role === "assistant" ? "bot" : "person"}: ${said}`);
  }
  if (lines.length === 0) return null;
  return tailCap(lines.join("\n"), MAX_EXCERPT_GRAPHEMES);
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/* Keep the last `limit` graphemes, cut between characters, never within one. */
function tailCap(text: string, limit: number): string {
  const graphemes = Array.from(GRAPHEMES.segment(text), (each) => each.segment);
  if (graphemes.length <= limit) return text;
  return graphemes.slice(-limit).join("");
}

/* Finished rows kept an hour, given-up rows a day. That day IS the backoff before a fresh offer. */
export async function forgetSettledMining(
  options: Pick<MemoryMiningOptions, "queue" | "maxAttempts">,
): Promise<number> {
  return await options.queue.purge({
    kind: MEMORY_MINING_KIND,
    olderThanMs: 24 * 60 * 60 * 1_000,
    finishedOlderThanMs: 60 * 60 * 1_000,
    ...(options.maxAttempts === undefined
      ? {}
      : { maxAttempts: options.maxAttempts }),
  });
}
