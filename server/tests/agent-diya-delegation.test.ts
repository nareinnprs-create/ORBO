import { describe, expect, test } from "bun:test";
import { Hono, type MiddlewareHandler } from "hono";
import {
  GROUP_TURN_KIND,
  createGroupConversations,
  type GroupMessage,
  type GroupStore,
  type GroupTurn,
} from "../src/channels/group";
import {
  collectDiyaResult,
  DIYA_AGENT_ID,
  DIYA_FIRST_SPECIALIST_ID,
  sendDiyaCannedHandoff,
} from "../src/agents/diya-delegation";
import { createHandoffDesk } from "../src/agents/handoff";
import {
  createHandoffRunner,
  type HandoffWork,
} from "../src/agents/handoff-runner";
import { signHandoffDeliveryRun } from "../src/agents/handoff-signing";
import {
  AgentNotFoundError,
  AgentNotManageableError,
  type AgentProfileStore,
} from "../src/agents/profile-store";
import type {
  AgentActor,
  AgentProfile,
  CreateAgentInput,
} from "../src/agents/profile-types";
import { createAgentRoutes } from "../src/agents/routes";
import type { AppVariables } from "../src/auth/guards";
import type { AuditStore } from "../src/audit";
import type { TurnRunner } from "../src/routines/runner";
import type { WorkItem, WorkQueue } from "../src/work/queue";

/**
 * WS-02 first slice: single agent CRUD + a DIYA seed that answers in Home and
 * delegates one canned task to one specialist.
 *
 * Doc 20 §5 acceptance, adapted to what is unit-provable without a database
 * or a model: every boundary the slice crosses — the agent API, the handoff
 * desk and queue, the group transcript — runs against the same in-memory
 * fakes the neighbouring suites already use, and the model itself never runs.
 * The DIYA seed row (`examples/orbo/agents.yaml`) and the diya-first Home
 * rule (`app/src/lib/agents/default-agent.ts`) already shipped; this file pins
 * the behaviour they exist to serve.
 */

const actor = {
  id: "user-1",
  email: "member@orbo.test",
  role: "user",
} as const;

const CANNED_SPECIALIST_ANSWER =
  "Sources I can reach: Policies (Drive), Changelog (Drive). Both cited above.";

function agentRow(
  id: string,
  name: string,
  ownerUserId: string | null = actor.id,
): AgentProfile {
  return {
    id,
    name,
    title: `${name} title`,
    roleDescription: `${name} role`,
    avatarSeed: id,
    visibility: "private",
    ownerUserId,
    systemOwned: false,
    hidden: false,
    pinned: false,
    deletedAt: null,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
  };
}

/** The agent API backed by a map, so create/read/update genuinely round-trip. */
function memoryAgentStore(): AgentProfileStore {
  const rows = new Map<string, AgentProfile>();
  let sequence = 1;
  const visible = (received: AgentActor, row: AgentProfile) =>
    row.deletedAt === null &&
    (row.visibility === "public" || row.ownerUserId === received.id);
  const get = async (received: AgentActor, id: string) => {
    const row = rows.get(id) ?? null;
    return row && visible(received, row) ? row : null;
  };
  return {
    async list(received, hidden) {
      return [...rows.values()].filter(
        (row) => row.hidden === hidden && visible(received, row),
      );
    },
    get,
    async getWithin(_executor, received, id) {
      return get(received, id);
    },
    async create(received, input: CreateAgentInput) {
      const id = `agent-${sequence++}`;
      const row = agentRow(id, input.name, received.id);
      row.title = input.title;
      row.roleDescription = input.roleDescription;
      row.visibility = input.visibility;
      if (input.endpoint) row.endpoint = input.endpoint;
      if (input.auth) row.hasAuth = true;
      rows.set(id, row);
      return row;
    },
    async update(received, id, input: CreateAgentInput) {
      const existing = await get(received, id);
      if (!existing) throw new AgentNotFoundError(id);
      if (existing.ownerUserId !== received.id)
        throw new AgentNotManageableError(id);
      const row: AgentProfile = {
        ...existing,
        name: input.name,
        title: input.title,
        roleDescription: input.roleDescription,
        visibility: input.visibility,
        ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      };
      rows.set(id, row);
      return row;
    },
    async duplicate(received, id) {
      const existing = await get(received, id);
      if (!existing) throw new AgentNotFoundError(id);
      const row: AgentProfile = {
        ...existing,
        id: `${id}-copy`,
        visibility: "private",
      };
      rows.set(row.id, row);
      return row;
    },
    async setHidden(received, id, hidden) {
      const existing = await get(received, id);
      if (!existing) throw new AgentNotFoundError(id);
      rows.set(id, { ...existing, hidden });
    },
    async setPinned(received, id, pinned) {
      const existing = await get(received, id);
      if (!existing) throw new AgentNotFoundError(id);
      rows.set(id, { ...existing, pinned });
    },
    async softDelete(_received, id) {
      const existing = rows.get(id);
      if (!existing) throw new AgentNotFoundError(id);
      rows.set(id, { ...existing, deletedAt: new Date() });
    },
  };
}

const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  context.set("actor", actor);
  await next();
};

function agentApp(store: AgentProfileStore) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/", createAgentRoutes(store, requireUser));
  return app;
}

const VALID_INPUT = {
  name: "Helper",
  title: "Everyday Work",
  roleDescription: "Helps with everyday work.",
  visibility: "private",
};

describe("WS-02 first slice: single agent CRUD via the API", () => {
  test("create, read, and update round-trip; a missing id is a 404", async () => {
    const app = agentApp(memoryAgentStore());

    const created = await app.request("http://orbo.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_INPUT),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      agent: { id: string; name: string };
    };
    expect(createdBody.agent.name).toBe("Helper");

    const read = await app.request(`http://orbo.test/${createdBody.agent.id}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { agent: { id: string } }).agent.id).toBe(
      createdBody.agent.id,
    );

    const updated = await app.request(
      `http://orbo.test/${createdBody.agent.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...VALID_INPUT, title: "Deep Work" }),
      },
    );
    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { agent: { title: string } }).agent.title,
    ).toBe("Deep Work");

    const missing = await app.request("http://orbo.test/no-such-agent");
    expect(missing.status).toBe(404);
  });
});

/** One queue in memory, shared by the desk that offers and the runner that delivers. */
function memoryWorkQueue() {
  const pending = new Map<
    string,
    { kind: string; key: string; payload: Record<string, unknown> }
  >();
  const offered: Array<{
    kind: string;
    key: string;
    payload: Record<string, unknown>;
  }> = [];
  const queue: WorkQueue = {
    offer: async (item) => {
      if (pending.has(item.key)) return "already";
      if (item.atMost) {
        const count = [...pending.keys()].filter((key) =>
          key.startsWith(item.atMost?.keyPrefix ?? ""),
        ).length;
        if (count >= (item.atMost?.max ?? 0)) return "refused";
      }
      const row = {
        kind: item.kind,
        key: item.key,
        payload: item.payload ?? {},
      };
      pending.set(item.key, row);
      offered.push(row);
      return "queued";
    },
    claim: async (input) => {
      const taken: WorkItem[] = [];
      for (const [key, row] of pending) {
        if (row.kind !== input.kind) continue;
        pending.delete(key);
        taken.push({
          kind: row.kind,
          key,
          payload: row.payload,
          attempts: 1,
        });
        if (taken.length === (input.limit ?? taken.length + 1)) break;
      }
      return taken;
    },
    renew: async () => true,
    finish: async () => true,
    release: async (input) => {
      pending.set(input.key, {
        kind: input.kind,
        key: input.key,
        payload: {},
      });
      return true;
    },
    purge: async () => 0,
  };
  return { queue, offered };
}

function auditCapture() {
  const events: Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }> = [];
  const auditStore: AuditStore = {
    insert: async (event) => {
      events.push({
        eventType: event.eventType,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });
    },
  };
  return { events, auditStore };
}

describe("WS-02 first slice: DIYA delegates one canned task to one specialist", () => {
  test("desk offers, runner delivers, relay attributes, result collects", async () => {
    const { queue, offered } = memoryWorkQueue();
    const { events, auditStore } = auditCapture();
    const desk = createHandoffDesk({
      queue,
      profiles: {
        list: async () => [
          agentRow(DIYA_AGENT_ID, "DIYA"),
          agentRow(DIYA_FIRST_SPECIALIST_ID, "Knowledge"),
        ],
      } as unknown as AgentProfileStore,
      mayAddress: async (from, to) =>
        from === DIYA_AGENT_ID && to === DIYA_FIRST_SPECIALIST_ID,
      actorFor: async (id) => ({ id, role: "user" }),
      auditStore,
      caps: { maxDepth: 1, maxPerRun: 3 },
    });

    // The Home run: default-agent resolution already picked diya, so the run
    // asserts diya and the canned path hands to Knowledge with no model call.
    const outcome = await sendDiyaCannedHandoff(desk, {
      botId: DIYA_AGENT_ID,
      actorId: actor.id,
      runId: "home-run-1",
      threadId: "home-thread-1",
      depth: 0,
    });

    expect(outcome).toEqual({
      ok: true,
      to: DIYA_FIRST_SPECIALIST_ID,
      toName: "Knowledge",
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "agent.handoff_offered",
    ]);
    expect(events[0]?.payload).toMatchObject({
      bot: DIYA_AGENT_ID,
      from: DIYA_AGENT_ID,
      to: DIYA_FIRST_SPECIALIST_ID,
    });

    // The delivery: stubbed at the model boundary — the specialist's answer
    // is canned, the attribution around it is what is under test.
    const delivered: Array<{
      work: HandoffWork;
      message: string;
      shown?: string;
    }> = [];
    const runner = createHandoffRunner({
      queue,
      delivery: {
        deliver: async ({ work, message, shown }) => {
          delivered.push({
            work,
            message,
            ...(shown ? { shown } : {}),
          });
          return { answer: CANNED_SPECIALIST_ANSWER };
        },
      },
      owner: "replica-a",
      sign: (work, claim) =>
        signHandoffDeliveryRun(
          work,
          "test-encryption-key-not-a-real-one",
          "delivery-run",
          claim,
        ),
      auditStore,
    });

    const report = await runner.sweep();

    expect(report.delivered).toEqual([DIYA_FIRST_SPECIALIST_ID]);
    // The addressed specialist reads a deployment-attributed ask, never a
    // model-decided one: the ask names diya as the asker.
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.work.fromBotId).toBe(DIYA_AGENT_ID);
    expect(delivered[0]?.message).toContain(DIYA_AGENT_ID);
    expect(delivered[0]?.shown).toContain("Knowledge");
    // The hop is delivered on the trail under diya's name.
    expect(events.map((event) => event.eventType)).toEqual([
      "agent.handoff_offered",
      "agent.handoff_delivered",
    ]);
    expect(events[1]?.payload).toMatchObject({
      bot: DIYA_AGENT_ID,
      to: DIYA_FIRST_SPECIALIST_ID,
    });
    // The answer rides home through the queue, instructing the asking run to
    // say where it came from: the receipt is attributed before any model
    // paraphrases it.
    const relay = offered.find((row) => row.key.startsWith("relay:"));
    expect(relay).toBeDefined();
    expect(String(relay?.payload.task)).toContain("Knowledge");
    expect(String(relay?.payload.task)).toContain("say it came from");
    // And the main thread collects the canned answer under the
    // specialist's name, not DIYA's.
    expect(collectDiyaResult("Knowledge", CANNED_SPECIALIST_ANSWER)).toBe(
      `Knowledge answered: ${CANNED_SPECIALIST_ANSWER}`,
    );
  });
});

/** The shared transcript in memory: one row per person message and per Bot reply. */
function memoryGroupStore(queue: WorkQueue) {
  const rows: GroupMessage[] = [];
  let order: string[] = [];
  const store: GroupStore = {
    async list(channelId) {
      return rows.filter((row) => row.channelId === channelId);
    },
    async thread(_ownerUserId, channelId, agentId) {
      return `thread-${channelId}-${agentId}`;
    },
    async submit(turn: GroupTurn) {
      rows.push({
        id: turn.messageId,
        channelId: turn.channelId,
        ownerUserId: turn.ownerUserId,
        agentId: null,
        threadId: null,
        text: turn.text,
        status: "completed",
        details: { agentIds: turn.agentIds },
        createdAt: new Date(),
      });
      await queue.offer({
        kind: GROUP_TURN_KIND,
        key: turn.messageId,
        payload: { ...turn },
      });
    },
    async start(turn, agentId, threadId) {
      const id = `${turn.messageId}:${agentId}`;
      const existing = rows.find((row) => row.id === id);
      if (existing) return existing.status === "running" ? "unknown" : "done";
      rows.push({
        id,
        channelId: turn.channelId,
        ownerUserId: turn.ownerUserId,
        agentId,
        threadId,
        text: "",
        status: "running",
        details: {},
        createdAt: new Date(),
      });
      return "run";
    },
    async finish(id, text, status, details = {}) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) {
        row.text = text;
        row.status = status;
        row.details = details;
      }
    },
    async progress(id, text) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row && row.status === "running") row.text = text;
    },
    async seedOrder(_ownerUserId, _channelId, agentIds) {
      order = [...agentIds];
    },
    async order(_channelId) {
      return order;
    },
    async waitingFor(_approvalId) {
      return null;
    },
    async threadRow(_threadId) {
      return null;
    },
    async append(row) {
      rows.push({
        status: "completed",
        ...row,
        createdAt: new Date(),
      });
      return true;
    },
    async addMember(_channelId, email) {
      return { userId: email };
    },
    async members(_channelId) {
      return [actor.id];
    },
    async people(_channelId) {
      return [{ userId: actor.id, email: actor.email, name: "ORBO Member" }];
    },
    async removeMember(_channelId, _userId) {},
  };
  return store;
}

describe("WS-02 first slice: group-thread receipt attribution", () => {
  test("DIYA opens the group, the specialist reply lands attributed", async () => {
    const { queue } = memoryWorkQueue();
    const { events, auditStore } = auditCapture();
    const turns: Array<{ agentId: string; content: unknown }> = [];
    // The model boundary, stubbed: DIYA answers by delegating with an
    // @-mention, Knowledge answers the canned task. Nothing here dials out.
    const runTurn: TurnRunner = async (input) => {
      turns.push({
        agentId: input.agentId,
        content: input.userMessage?.content,
      });
      if (input.agentId === DIYA_AGENT_ID) {
        return {
          replyText:
            "On it — @Knowledge please list the sources you can reach, citing what you used.",
        };
      }
      if (input.agentId === DIYA_FIRST_SPECIALIST_ID) {
        return { replyText: CANNED_SPECIALIST_ANSWER };
      }
      throw new Error(`unexpected Bot ${input.agentId}`);
    };
    const conversations = createGroupConversations({
      store: memoryGroupStore(queue),
      queue,
      owner: "replica-a",
      roster: async () => [
        { id: DIYA_AGENT_ID, name: "DIYA" },
        { id: DIYA_FIRST_SPECIALIST_ID, name: "Knowledge" },
      ],
      runTurn,
      caps: { maxDepth: 1, maxPerRun: 2 },
      mayAddress: async (from, to) =>
        from === DIYA_AGENT_ID && to === DIYA_FIRST_SPECIALIST_ID,
      auditStore,
      createChannel: async () => ({ id: "group-1" }),
      progressEveryMs: 0,
    });

    // POST /api/groups (201): DIYA plus its one specialist, in that order.
    const channel = await conversations.create(actor.id, {
      agentIds: [DIYA_AGENT_ID, DIYA_FIRST_SPECIALIST_ID],
    });
    expect(channel.id).toBe("group-1");

    // The person asks DIYA; DIYA's reply hands to @Knowledge within the caps.
    await conversations.send(actor.id, channel.id, {
      id: "m1",
      text: "What sources can we search?",
      agentId: DIYA_AGENT_ID,
    });
    for (let i = 0; i < 10 && (await conversations.sweep()); i++) {}

    const { messages } = await conversations.list(actor.id, channel.id);
    const receipts = messages.map((message) => ({
      speaker: message.agentId ?? null,
      text: message.text,
      status: message.status,
    }));
    // The shared transcript: the person's line, DIYA's delegation, and the
    // specialist's answer — each attributed to its speaker.
    expect(receipts).toEqual([
      {
        speaker: null,
        text: "What sources can we search?",
        status: "completed",
      },
      {
        speaker: DIYA_AGENT_ID,
        text: expect.stringContaining("@Knowledge"),
        status: "completed",
      },
      {
        speaker: DIYA_FIRST_SPECIALIST_ID,
        text: CANNED_SPECIALIST_ANSWER,
        status: "completed",
      },
    ]);
    // The specialist is addressed by name in its instruction, and reads the
    // shared transcript with speakers labelled — a peer turn quotes the
    // person's words and carries the peer's reply inline (group.ts leaves the
    // quoted row out of the transcript under it), so the answer stays
    // grounded in who said what rather than in an unattributed blob.
    const specialistTurn = turns.find(
      (turn) => turn.agentId === DIYA_FIRST_SPECIALIST_ID,
    );
    expect(String(specialistTurn?.content)).toContain(
      "DIYA addressed you in this group conversation",
    );
    expect(String(specialistTurn?.content)).toContain('"speaker":"person"');
    // And the Bot-to-Bot handoff is on the trail under DIYA's name, in this
    // group's channel.
    const offered = events.filter(
      (event) => event.eventType === "agent.handoff_offered",
    );
    expect(offered).toHaveLength(1);
    expect(offered[0]?.payload).toMatchObject({
      bot: DIYA_AGENT_ID,
      from: DIYA_AGENT_ID,
      to: DIYA_FIRST_SPECIALIST_ID,
      group: "group-1",
    });
  });
});
