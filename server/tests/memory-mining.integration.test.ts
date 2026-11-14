import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createAgentProfileStore } from "../src/agents/profile-store";
import type { AgentActor } from "../src/agents/profile-types";
import { createChannelStore } from "../src/channels/routes";
import type { ThreadTranscript } from "../src/channels/summary";
import { createThreadIdentity } from "../src/channels/thread-identity";
import { createDatabase } from "../src/db/client";
import {
  agents,
  channelAgents,
  channels,
  intelligenceChannelMappings,
  memoryMining,
  personalMemories,
  users,
  workItems,
} from "../src/db/schema";
import type { MemoryMiner } from "../src/memory/miner";
import {
  MEMORY_MINING_KIND,
  type MemoryMiningOptions,
  mineClaimedConversations,
  offerConversationsToMine,
} from "../src/memory/mining";
import { createMemoryStore } from "../src/memory/store";
import { createWorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

const databaseUrl = testDatabaseUrl();
const database = createDatabase(databaseUrl, TEST_POOL);
const profileStore = createAgentProfileStore(
  database,
  new URL("https://managed.example.test/ag-ui"),
);
const store = createChannelStore(
  database,
  profileStore,
  createThreadIdentity("test-deployment"),
);
const queue = createWorkQueue(database);
const memories = createMemoryStore(database);

const testPrefix = `memory-mining-${randomUUID()}`;
const createdUserIds: string[] = [];
const createdAgentIds: string[] = [];
const createdChannelIds: string[] = [];

afterEach(async () => {
  for (const channelId of createdChannelIds.splice(0)) {
    await database.delete(workItems).where(eq(workItems.key, channelId));
    const [mapping] = await database
      .select({ threadId: intelligenceChannelMappings.threadId })
      .from(intelligenceChannelMappings)
      .where(eq(intelligenceChannelMappings.channelId, channelId));
    if (mapping) {
      await database
        .delete(memoryMining)
        .where(eq(memoryMining.threadId, mapping.threadId));
      await database
        .delete(intelligenceChannelMappings)
        .where(eq(intelligenceChannelMappings.channelId, channelId));
    }
    await database.delete(channels).where(eq(channels.id, channelId));
  }
  for (const agentId of createdAgentIds.splice(0)) {
    await database.delete(agents).where(eq(agents.id, agentId));
  }
  for (const userId of createdUserIds.splice(0)) {
    await database.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => {
  await database.$client.close();
});

async function createUser(): Promise<AgentActor> {
  const id = `${testPrefix}-user-${randomUUID()}`;
  await database.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: "Memory Mining Test User",
  });
  createdUserIds.push(id);
  return { id, role: "user" };
}

async function createAgent(owner: AgentActor) {
  const profile = await profileStore.create(owner, {
    name: "Expense Manager",
    title: "Finance Operations",
    roleDescription: "Review receipts.",
    visibility: "private",
  });
  createdAgentIds.push(profile.id);
  return profile.id;
}

/** A channel somebody has actually said something in, which is the only kind worth mining. */
async function createUsedChannel(owner: AgentActor) {
  const agentId = await createAgent(owner);
  const channel = await store.create(owner, [agentId]);
  createdChannelIds.push(channel.id);
  await store.recordActivity(owner, channel.id, {
    text: "I file my expenses on Fridays, and I need the Berlin office receipts kept.",
    agentId: null,
    at: new Date(),
  });
  return channel;
}

async function threadOf(channelId: string) {
  const [mapping] = await database
    .select({ threadId: intelligenceChannelMappings.threadId })
    .from(intelligenceChannelMappings)
    .where(eq(intelligenceChannelMappings.channelId, channelId));
  if (!mapping) throw new Error(`No thread mapped for channel ${channelId}.`);
  return mapping.threadId;
}

/**
 * Queue one conversation, by name, with the payload the offer writes.
 *
 * Deliberately not `offerConversationsToMine`, which offers every minable conversation in the
 * database: a claim takes whatever is queued, so a test that offers the whole table and then claims
 * would mine somebody's real conversation when the suite is pointed at a development database.
 * Tests that exercise the offer query itself assert on what it returns and never claim.
 */
async function queueOne(channelId: string) {
  const threadId = await threadOf(channelId);
  const [channel] = await database
    .select({ name: channels.name, lastMessageAt: channels.lastMessageAt })
    .from(channels)
    .where(eq(channels.id, channelId));
  if (!channel?.lastMessageAt)
    throw new Error(`Channel ${channelId} has nothing said in it.`);
  const [agent] = await database
    .select({ agentId: channelAgents.agentId })
    .from(channelAgents)
    .where(eq(channelAgents.channelId, channelId))
    .orderBy(channelAgents.createdAt);
  if (!agent) throw new Error(`Channel ${channelId} has no bot in it.`);
  await queue.offer({
    kind: MEMORY_MINING_KIND,
    key: threadId,
    payload: {
      threadId,
      ownerId: (await firstMember(channelId)) ?? "",
      agentId: agent.agentId,
      channelId,
      channelName: channel.name,
      lastMessageAt: channel.lastMessageAt.toISOString(),
    },
  });
  return threadId;
}

async function firstMember(channelId: string) {
  const [mapping] = await database
    .select({ userId: intelligenceChannelMappings.userId })
    .from(intelligenceChannelMappings)
    .where(eq(intelligenceChannelMappings.channelId, channelId));
  return mapping?.userId ?? null;
}

function transcriptOf(messages: { role: string; content: unknown }[]) {
  const transcript: ThreadTranscript = {
    getThreadMessages: async () => ({ messages }),
  };
  return transcript;
}

function miner(facts: string[] | null): MemoryMiner {
  return async () => facts;
}

function options(overrides: {
  transcript?: ThreadTranscript;
  mine?: MemoryMiner;
}) {
  return {
    database,
    queue,
    memories,
    transcript:
      overrides.transcript ??
      transcriptOf([
        {
          role: "user",
          content: "I file my expenses on Fridays. Remember that.",
        },
      ]),
    mine: overrides.mine ?? miner(["The person files expenses on Fridays"]),
    owner: `test-${randomUUID()}`,
  } satisfies MemoryMiningOptions;
}

async function memoriesOf(ownerId: string) {
  return database
    .select()
    .from(personalMemories)
    .where(eq(personalMemories.ownerUserId, ownerId));
}

async function itemOf(threadId: string) {
  const [item] = await database
    .select({
      finishedAt: workItems.finishedAt,
      attempts: workItems.attempts,
      runAt: workItems.runAt,
    })
    .from(workItems)
    .where(eq(workItems.key, threadId));
  return item;
}

describe("offering conversations to be mined", () => {
  test("offers a conversation spoken in, with the bot that will remember it", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);

    const { offered } = await offerConversationsToMine({
      database,
      queue,
      limit: 200,
    });
    const threadId = await threadOf(channel.id);

    expect(offered).toContain(threadId);
    const [item] = await database
      .select({ payload: workItems.payload })
      .from(workItems)
      .where(eq(workItems.key, threadId));
    expect(item?.payload.ownerId).toBe(owner.id);
    expect(item?.payload.channelId).toBe(channel.id);
    expect(typeof item?.payload.agentId).toBe("string");
    expect(item?.payload.lastMessageAt).toBeString();
  });

  test("does not offer a channel nobody has said anything in", async () => {
    const owner = await createUser();
    const agentId = await createAgent(owner);
    const channel = await store.create(owner, [agentId]);
    createdChannelIds.push(channel.id);

    const { offered } = await offerConversationsToMine({
      database,
      queue,
      limit: 200,
    });

    // There is nothing for a model to read, and asking it to mine an empty thread spends money to
    // produce a guess.
    expect(offered).not.toContain(await threadOf(channel.id));
  });

  test("offering the same conversation twice leaves one piece of work", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);

    await offerConversationsToMine({ database, queue, limit: 200 });
    await offerConversationsToMine({ database, queue, limit: 200 });

    const rows = await database
      .select({ key: workItems.key })
      .from(workItems)
      .where(eq(workItems.key, await threadOf(channel.id)));
    expect(rows).toHaveLength(1);
  });

  test("does not offer a conversation until something new is said in it", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await threadOf(channel.id);

    await offerConversationsToMine({ database, queue, limit: 200 });
    const report = await mineClaimedConversations(options({}));
    expect(report.mined).toContain(threadId);

    // The cursor now stands at the last message, so a quiet conversation is not asked about again.
    const { offered } = await offerConversationsToMine({
      database,
      queue,
      limit: 200,
    });
    expect(offered).not.toContain(threadId);

    // ...and one new message re-opens it — once the settled work row has been forgotten, which is
    // what `forgetSettledMining` does to a finished row an hour old. The row IS the backoff: a
    // chatty conversation is re-read at most once an hour, not once a message.
    await store.recordActivity(owner, channel.id, {
      text: "Also, the Berlin receipts go in a separate folder.",
      agentId: null,
      at: new Date(Date.now() + 10_000),
    });
    await database.delete(workItems).where(eq(workItems.key, threadId));
    const reopened = await offerConversationsToMine({
      database,
      queue,
      limit: 200,
    });
    expect(reopened.offered).toContain(threadId);
  });
});

describe("mining a claimed conversation", () => {
  test("forms unreviewed bot memories and moves the cursor", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    const ownerId = (await firstMember(channel.id)) as string;
    const lastMessageAt = (
      await database
        .select({ at: channels.lastMessageAt })
        .from(channels)
        .where(eq(channels.id, channel.id))
    )[0]?.at;

    const report = await mineClaimedConversations(
      options({
        mine: miner([
          "The person files expenses on Fridays",
          "The person is in Berlin",
        ]),
      }),
    );

    expect(report.mined).toEqual([threadId]);
    const rows = await memoriesOf(ownerId);
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) =>
          row.formedBy === "bot" &&
          row.reviewState === "unreviewed" &&
          row.formedByAgentId !== null &&
          row.sourceApp === channel.name &&
          row.sourceRef === null &&
          row.observedAt?.getTime() === lastMessageAt?.getTime(),
      ),
    ).toBe(true);
    const [cursor] = await database
      .select({ minedAt: memoryMining.minedAt })
      .from(memoryMining)
      .where(eq(memoryMining.threadId, threadId));
    expect(cursor?.minedAt.getTime()).toBe(lastMessageAt?.getTime());
    expect((await itemOf(threadId))?.finishedAt).not.toBeNull();
  });

  test("the same fact said twice in one answer is stored once", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    const ownerId = (await firstMember(channel.id)) as string;

    await mineClaimedConversations(
      options({
        mine: miner([
          "The person files expenses on Fridays",
          "the person files expenses on fridays",
        ]),
      }),
    );

    expect(await memoriesOf(ownerId)).toHaveLength(1);
    expect((await itemOf(threadId))?.finishedAt).not.toBeNull();
  });

  test("comes back later when the conversation is not readable yet", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);

    // What a conversation looks like in the seconds between somebody sending a message and
    // Intelligence holding it. Finishing the work here is how an ordinary conversation ends up
    // never remembered at all.
    const report = await mineClaimedConversations(
      options({ transcript: transcriptOf([]) }),
    );

    expect(report.skipped).toContainEqual({
      threadId,
      reason: "not readable yet",
    });
    const item = await itemOf(threadId);
    expect(item?.finishedAt).toBeNull();
    expect(item?.runAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("a deployment with no model is a final answer, and no cursor", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    const ownerId = (await firstMember(channel.id)) as string;

    const report = await mineClaimedConversations(
      options({ mine: miner(null) }),
    );

    expect(report.skipped).toContainEqual({
      threadId,
      reason: "nothing to mine",
    });
    expect((await itemOf(threadId))?.finishedAt).not.toBeNull();
    expect(await memoriesOf(ownerId)).toHaveLength(0);
    // No cursor: the conversation stays minable for when a model is configured, which is the
    // whole of the backlog a fresh deployment would otherwise never read.
    const cursors = await database
      .select()
      .from(memoryMining)
      .where(eq(memoryMining.threadId, threadId));
    expect(cursors).toHaveLength(0);
  });

  test("a conversation that no longer exists is dropped, not retried", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    // The channel goes while its mining is still queued. A queue key is not a foreign key, so the
    // work outlives the thing it was about — which happens for real on a delete, and happens on
    // every integration test that seeds a channel and tears it down.
    await database.delete(channels).where(eq(channels.id, channel.id));

    const report = await mineClaimedConversations(options({}));

    expect(report.skipped).toContainEqual({
      threadId,
      reason: "nothing to mine",
    });
    const item = await itemOf(threadId);
    expect(item?.finishedAt).not.toBeNull();
    expect(item?.attempts).toBe(1);
  });

  test("a soft-deleted conversation is dropped the same way", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    const ownerId = (await firstMember(channel.id)) as string;
    await database
      .update(channels)
      .set({ deletedAt: new Date() })
      .where(eq(channels.id, channel.id));

    const report = await mineClaimedConversations(options({}));

    expect(report.skipped).toContainEqual({
      threadId,
      reason: "nothing to mine",
    });
    expect((await itemOf(threadId))?.finishedAt).not.toBeNull();
    expect(await memoriesOf(ownerId)).toHaveLength(0);
  });

  test("an answer with no facts still moves the cursor", async () => {
    const owner = await createUser();
    const channel = await createUsedChannel(owner);
    const threadId = await queueOne(channel.id);
    const lastMessageAt = (
      await database
        .select({ at: channels.lastMessageAt })
        .from(channels)
        .where(eq(channels.id, channel.id))
    )[0]?.at;

    const report = await mineClaimedConversations(options({ mine: miner([]) }));

    expect(report.mined).toContain(threadId);
    const [cursor] = await database
      .select({ minedAt: memoryMining.minedAt })
      .from(memoryMining)
      .where(eq(memoryMining.threadId, threadId));
    expect(cursor?.minedAt.getTime()).toBe(lastMessageAt?.getTime());
  });
});
