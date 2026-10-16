import { describe, expect, test } from "bun:test";
import { createProactiveEngine } from "../src/proactive/engine";
import type { ProactiveStore } from "../src/proactive/store";
import {
  ProactiveRefusedError,
  type ProactiveSetting,
  type ProactiveSuggestion,
} from "../src/proactive/types";
import type { WorkQueue } from "../src/work/queue";
import { createTaskLedger } from "../src/work/tasks";

/**
 * Accepting a suggestion mints a unified task (25 §3.3: the small transform
 * mapping Ideas onto `proactive_suggestions`).
 *
 * In-memory fakes only: no database (Docker is down), no model, no clock
 * beyond the injected `now`. The ledger is the real `createTaskLedger`, so
 * what is under test is the link — offer idempotence plus the receipt —
 * not a reimplementation of it.
 */

const AT = new Date("2026-10-16T12:00:00.000Z");

const setting: ProactiveSetting = {
  id: "setting-1",
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
    id: "suggestion-1",
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

function harness() {
  const rows = new Map<string, ProactiveSuggestion>([
    ["suggestion-1", suggestionRow()],
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
  const ledger = createTaskLedger({ now: () => new Date(AT) });
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
  return { engine, ledger, offered, rows };
}

describe("accepting a suggestion mints a task", () => {
  test("accept mints one task with a linked receipt", async () => {
    const { engine, ledger } = harness();

    const started = await engine.start("owner", "suggestion-1");

    expect(started.status).toBe("started");
    expect(ledger.counts()).toEqual({ tasks: 1, runs: 1, receipts: 1 });
  });

  test("the receipt is visible for the minted run and names the suggestion", async () => {
    const { engine, ledger } = harness();

    await engine.start("owner", "suggestion-1");

    // The one task the ledger holds is the suggestion's, keyed on its id.
    const offer = ledger.offer({
      key: "suggestion:suggestion-1",
      routineId: "proactive:setting-1",
      scheduledFor: AT,
    });
    expect(offer.offered).toBe(false);
    const run = ledger.runForTask(offer.task.id);
    expect(run).not.toBeNull();
    const receipt = run ? ledger.receiptForRun(run.id) : null;
    expect(receipt).not.toBeNull();
    expect(receipt?.taskId).toBe(offer.task.id);
    expect(receipt?.runId).toBe(run?.id);
    expect(receipt?.detail).toContain("Reply to Sam");
  });

  test("dismiss resolves the suggestion and mints no task", async () => {
    const { engine, ledger, offered } = harness();

    const dismissed = await engine.dismiss("owner", "suggestion-1");

    expect(dismissed.status).toBe("dismissed");
    expect(ledger.counts()).toEqual({ tasks: 0, runs: 0, receipts: 0 });
    // Dismissal is store-only: nothing reaches the task queue either.
    expect(offered).toEqual([]);
  });

  test("a second accept is refused and mints no second task", async () => {
    const { engine, ledger } = harness();

    await engine.start("owner", "suggestion-1");
    await expect(engine.start("owner", "suggestion-1")).rejects.toBeInstanceOf(
      ProactiveRefusedError,
    );
    expect(ledger.counts()).toEqual({ tasks: 1, runs: 1, receipts: 1 });
  });
});
