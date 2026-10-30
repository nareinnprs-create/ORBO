import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { tasks } from "../src/db/schema";
import { createProactiveEngine } from "../src/proactive/engine";
import type { ProactiveStore } from "../src/proactive/store";
import {
  ProactiveRefusedError,
  type ProactiveSetting,
  type ProactiveSuggestion,
} from "../src/proactive/types";
import type { WorkQueue } from "../src/work/queue";
import { createTaskLedger, type TaskLedger } from "../src/work/tasks";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Accepting a suggestion mints a unified task (25 §3.3: the small transform
 * mapping Ideas onto `proactive_suggestions`).
 *
 * In-memory fakes for the store and the queue; the ledger is the real one over
 * its tables, so what is under test is the link — offer idempotence, one run
 * row, one receipt, and all of it durable — not a reimplementation of it. The
 * suggestion id is suite-scoped because the ledger's key namespace is the
 * database's now: a second run of this suite must be a different suggestion.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

/**
 * The per-test ceiling. Generous, because these tests run on the shared test database
 * alongside every other suite in the same process, and the five-second default is
 * contention food: a busy moment stalls a statement, not a property under test.
 */
const DB_TIMEOUT = 30_000;

const suite = randomUUID().slice(0, 8);
const AT = new Date("2026-10-16T12:00:00.000Z");
const SETTING_ID = `setting-${suite}`;
const SUGGESTION_ID = `suggestion-${suite}`;

const setting: ProactiveSetting = {
  id: SETTING_ID,
  ownerUserId: "owner",
  agentId: "bot",
  channelId: "channel",
  threadId: "thread",
  focus: "",
  enabled: true,
  intervalMinutes: 240,
  nextRunAt: AT,
  lastRunAt: null,
  lastStatus: "idle",
  lastError: null,
  createdAt: AT,
  updatedAt: AT,
};

function suggestionRow(): ProactiveSuggestion {
  return {
    id: SUGGESTION_ID,
    ownerUserId: "owner",
    agentId: "bot",
    settingId: setting.id,
    runId: "run-1",
    title: "Reply to Sam",
    detail: "Sam asked for the spec.",
    sourceApp: "Issue tracker",
    sourceRef: "issues/list",
    sourceLink: null,
    status: "open",
    deliveredAt: null,
    resolvedAt: null,
    createdAt: AT,
  };
}

function harness(ledger: TaskLedger) {
  const rows = new Map<string, ProactiveSuggestion>([
    [SUGGESTION_ID, suggestionRow()],
  ]);
  const store = {
    get: async (_owner: string, _id: string) => setting,
    suggestion: async (_owner: string, id: string) => {
      const row = rows.get(id);
      if (!row) throw new Error("suggestion missing");
      return row;
    },
    resolveSuggestion: async (
      _owner: string,
      id: string,
      status: "dismissed" | "started",
    ) => {
      const row = rows.get(id);
      if (row?.status !== "open")
        throw new ProactiveRefusedError(
          "This suggestion was already started or dismissed.",
        );
      const next = { ...row, status, resolvedAt: AT };
      rows.set(id, next);
      return next;
    },
  } as unknown as ProactiveStore;
  const offered: { kind: string; key: string }[] = [];
  const queue = {
    offer: async (item: { kind: string; key: string }) => {
      offered.push(item);
      return "queued";
    },
  } as unknown as WorkQueue;
  const engine = createProactiveEngine({
    store,
    memory: {
      formMemory: async () => ({ id: "m", duplicate: false, forgotten: false }),
    },
    queue,
    owner: "worker",
    runTurn: (async () => ({ replyText: "done" })) as never,
    resolveScope: async (ownerUserId, channelId, agentId) => ({
      ownerUserId,
      channelId,
      agentId,
      threadId: "channel-thread",
    }),
    notify: async () => undefined,
    startTask: async () => undefined,
    catalogue: { listServers: async () => [] },
    mintThreadId: () => "thread",
    now: () => new Date(AT),
    tasks: ledger,
  });
  return { engine, offered, rows };
}

/** The one task key an acceptance mints, read back through the idempotence probe. */
async function minted(ledger: TaskLedger) {
  const offer = await ledger.offer({
    key: `suggestion:${SUGGESTION_ID}`,
    producer: { kind: "proactive", id: `proactive:${SETTING_ID}` },
    scheduledFor: AT,
  });
  return offer;
}

beforeEach(async () => {
  // Each test owns the suggestion's whole key namespace: an acceptance is durable
  // now, so the previous test's mint would otherwise be this test's replay.
  await database
    .delete(tasks)
    .where(like(tasks.key, `suggestion:${SUGGESTION_ID}%`));
});

afterAll(async () => {
  await database
    .delete(tasks)
    .where(like(tasks.key, `suggestion:${SUGGESTION_ID}%`));
  await database.$client.close();
});

describe("accepting a suggestion mints a task", () => {
  test(
    "accept mints one task with a linked receipt, in its own producer kind",
    async () => {
      const ledger = createTaskLedger(database, { now: () => new Date(AT) });
      const { engine } = harness(ledger);

      const started = await engine.start("owner", SUGGESTION_ID);

      expect(started.status).toBe("started");
      // The key names the suggestion; the producer names the setting. Neither rides
      // the other, and both are rows now rather than conventions.
      const offer = await minted(ledger);
      expect(offer.offered).toBe(false);
      expect(offer.task.producer).toEqual({
        kind: "proactive",
        id: `proactive:${SETTING_ID}`,
      });
      expect(await ledger.runForTask(offer.task.id)).not.toBeNull();
    },
    DB_TIMEOUT,
  );

  test(
    "the receipt names the suggestion and the run it answered",
    async () => {
      const ledger = createTaskLedger(database, { now: () => new Date(AT) });
      const { engine } = harness(ledger);

      await engine.start("owner", SUGGESTION_ID);

      const offer = await minted(ledger);
      const run = await ledger.runForTask(offer.task.id);
      expect(run).not.toBeNull();
      const receipt = run ? await ledger.receiptForRun(run.id) : null;
      expect(receipt).not.toBeNull();
      expect(receipt?.taskId).toBe(offer.task.id);
      expect(receipt?.runId).toBe(run?.id);
      expect(receipt?.detail).toContain("Reply to Sam");
    },
    DB_TIMEOUT,
  );

  test(
    "a second ledger — a restart — sees the acceptance the first minted",
    async () => {
      const ledger = createTaskLedger(database, { now: () => new Date(AT) });
      const { engine } = harness(ledger);
      await engine.start("owner", SUGGESTION_ID);

      const afterRestart = createTaskLedger(database, {
        now: () => new Date(AT),
      });
      const offer = await minted(afterRestart);
      expect(offer.offered).toBe(false);
      const run = await afterRestart.runForTask(offer.task.id);
      const receipt = run ? await afterRestart.receiptForRun(run.id) : null;
      expect(receipt?.detail).toContain("Reply to Sam");
    },
    DB_TIMEOUT,
  );

  test(
    "dismiss resolves the suggestion and mints no task",
    async () => {
      const ledger = createTaskLedger(database, { now: () => new Date(AT) });
      const { engine, offered } = harness(ledger);

      const dismissed = await engine.dismiss("owner", SUGGESTION_ID);

      expect(dismissed.status).toBe("dismissed");
      const probe = await ledger.offer({
        key: `suggestion:${SUGGESTION_ID}-unused-probe`,
        producer: { kind: "proactive", id: `proactive:${SETTING_ID}` },
        scheduledFor: AT,
      });
      // The probe is the first row under its key: acceptance was the only minter.
      expect(probe.offered).toBe(true);
      // Dismissal is store-only: nothing reaches the task queue either.
      expect(offered).toEqual([]);
    },
    DB_TIMEOUT,
  );

  test(
    "a second accept is refused and mints no second task",
    async () => {
      const ledger = createTaskLedger(database, { now: () => new Date(AT) });
      const { engine } = harness(ledger);

      await engine.start("owner", SUGGESTION_ID);
      await expect(engine.start("owner", SUGGESTION_ID)).rejects.toBeInstanceOf(
        ProactiveRefusedError,
      );

      const offer = await minted(ledger);
      expect(offer.offered).toBe(false);
      const runs = await ledger.runForTask(offer.task.id);
      expect(runs).not.toBeNull();
    },
    DB_TIMEOUT,
  );
});
