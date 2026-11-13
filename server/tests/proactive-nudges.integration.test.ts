import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema/core";
import { proactiveSettings } from "../src/db/schema/proactive";
import {
  createProactiveEngine,
  PROACTIVE_RUN_KIND,
} from "../src/proactive/engine";
import { type NudgePolicy, nudgeVerdict } from "../src/proactive/nudges";
import { createProactiveStore } from "../src/proactive/store";
import type { WorkQueue } from "../src/work/queue";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The nudge cooldown against the real tables: counters written by one store instance are read by
 * another (that is the whole point — restarts and replicas inherit them), the unique-per-suggestion
 * rule makes a redelivery count once, and a run's delivery pass under a wired policy leaves a
 * refused suggestion undelivered instead of failing the run.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `nudges-${randomUUID()}`;
const owner = `${prefix}-owner`;
const bot = `${prefix}-bot`;
const policy: NudgePolicy = {
  maxPerDay: 2,
  spacingHours: 48,
  quietStartHour: 22,
  quietEndHour: 8,
  timeZone: "UTC",
};

const store = createProactiveStore(database);
const settingId = `${prefix}-setting`;

beforeAll(async () => {
  await database
    .insert(users)
    .values({ id: owner, email: `${owner}@example.test` });
  await database.insert(agents).values({
    id: bot,
    name: "Research Bot",
    type: "built_in",
    configuration: {},
  });
  // One setting, shared by both tests: the store refuses a second per person and Bot.
  await database.insert(proactiveSettings).values({
    id: settingId,
    ownerUserId: owner,
    agentId: bot,
    channelId: `${prefix}-c`,
    threadId: `${prefix}-thread`,
    intervalMinutes: 60,
  });
});

afterAll(async () => {
  await database.delete(users).where(eq(users.id, owner));
  await database.delete(agents).where(inArray(agents.id, [bot]));
  await database.$client.close();
});

test("a recorded nudge survives a fresh store instance and a redelivery counts once", async () => {
  const setting = await store.get(owner, settingId);
  const suggestion = await store.addSuggestion({
    ownerUserId: owner,
    agentId: bot,
    settingId: setting.id,
    runId: `${prefix}-run-1`,
    title: "Reply to Sam",
    detail: "Sam asked for the spec.",
    sourceApp: null,
    sourceRef: null,
    sourceLink: null,
  });
  const now = new Date("2026-06-03T12:00:00Z");
  await store.recordNudge({
    ownerUserId: owner,
    agentId: bot,
    suggestionId: suggestion.id,
    at: now,
  });
  // The same suggestion delivered again spends nothing further: the unique index is the cap
  // arithmetic's idempotence, not a convention the caller remembers.
  await store.recordNudge({
    ownerUserId: owner,
    agentId: bot,
    suggestionId: suggestion.id,
    at: now,
  });

  // A NEW instance, as a restarted process or a second replica would build one, sees the same
  // history and refuses on the spacing bound.
  const restarted = createProactiveStore(database);
  const recent = await restarted.recentNudges(
    owner,
    new Date(now.getTime() - 24 * 3_600_000),
  );
  expect(recent).toEqual([now]);
  expect(nudgeVerdict({ now, policy, recentNudges: recent })).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("48h"),
  });

  // Rows newer than the lookback are not handed over, so the query stays bounded by the policy's
  // own window rather than by the table.
  const narrow = await restarted.recentNudges(
    owner,
    new Date(now.getTime() + 3_600_000),
  );
  expect(narrow).toEqual([]);
  // Delivered, so the engine test below does not sweep this setting's run into its assertions.
  await restarted.markDelivered(suggestion.id);
});

test("a run's delivery pass defers a refused nudge and delivers an allowed one", async () => {
  const setting = await store.get(owner, settingId);
  const runId = `${prefix}-run-2`;
  for (const title of ["First", "Second"]) {
    await store.addSuggestion({
      ownerUserId: owner,
      agentId: bot,
      settingId: setting.id,
      runId,
      title,
      detail: `${title} next step.`,
      sourceApp: null,
      sourceRef: null,
      sourceLink: null,
    });
  }
  // An older nudge of its own, so the rows this test reads are not test one's. It sits outside the
  // shortened lookback below and plays no part in the verdict; what decides is the row the first
  // delivery records.
  const yesterday = await store.addSuggestion({
    ownerUserId: owner,
    agentId: bot,
    settingId: setting.id,
    runId: `${prefix}-run-0`,
    title: "Earlier",
    detail: "Nudged yesterday.",
    sourceApp: null,
    sourceRef: null,
    sourceLink: null,
  });
  await store.recordNudge({
    ownerUserId: owner,
    agentId: bot,
    suggestionId: yesterday.id,
    at: new Date("2026-06-02T06:00:00Z"),
  });

  const notified: string[] = [];
  // The drain takes its run id from the work item's payload. A real sweep mints a fresh run id and
  // the run's own tools create suggestions under it; here the suggestions exist already, so the
  // canned item carries the run id they were written with.
  const queue = {
    offer: async () => "queued",
    claim: async ({ kind }: { kind: string }) =>
      kind === PROACTIVE_RUN_KIND
        ? [
            {
              kind,
              key: `${setting.id}:${runId}`,
              payload: { settingId: setting.id, runId },
              attempts: 1,
            },
          ]
        : [],
    renew: async () => true,
    finish: async () => true,
    release: async () => true,
  } as unknown as WorkQueue;

  const deliveryMoment = new Date("2026-06-05T12:00:00Z");
  const engine = createProactiveEngine({
    store,
    memory: {
      formMemory: async () => ({ id: "m", duplicate: false, forgotten: false }),
    },
    queue,
    owner: "worker",
    // Pinned, so the delivery lands outside quiet hours on every machine this runs on.
    now: () => deliveryMoment,
    runTurn: async () => ({ replyText: "Summary." }),
    resolveScope: async (ownerUserId, channelId, agentId) => ({
      ownerUserId,
      channelId,
      agentId,
      threadId: "channel-thread",
    }),
    notify: async (_scope, input) => {
      notified.push(input.id);
    },
    startTask: async () => {},
    catalogue: { listServers: async () => [] },
    mintThreadId: () => "thread",
    nudges: {
      recent: (ownerUserId, since) => store.recentNudges(ownerUserId, since),
      record: (input) => store.recordNudge({ ...input, at: deliveryMoment }),
    },
    nudgePolicy: {
      ...policy,
      // Test one leaves a nudge 48 hours before the delivery moment, so 36h of spacing clears it;
      // delivering the FIRST suggestion spends the allowance (`record`), and the SECOND is then
      // refused — one nudge, not two, which is the discipline this module exists for.
      spacingHours: 36,
    },
  });

  // Make the sweep take this setting: due, whatever the default nextRunAt the create left.
  await database
    .update(proactiveSettings)
    .set({ nextRunAt: new Date("2026-06-05T00:00:00Z") })
    .where(eq(proactiveSettings.id, setting.id));

  await engine.sweep();

  // Exactly one suggestion was pushed; the other stayed undelivered — and open, on the person's
  // page — rather than the run failing or the spacing bound being walked past.
  expect(notified).toHaveLength(1);
  const undelivered = await store.undelivered(runId);
  expect(undelivered).toHaveLength(1);
  const recent = await store.recentNudges(
    owner,
    new Date("2026-06-05T00:00:00Z"),
  );
  // One new row, from this sweep: the deferred suggestion spent nothing.
  expect(recent).toEqual([deliveryMoment]);
});
