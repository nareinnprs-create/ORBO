import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { agents, users } from "../src/db/schema/core";
import { botSends } from "../src/db/schema/sends";
import { createSendsStore } from "../src/sends/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * The send ledger against the real tables: the daily cap is counted from rows a previous instance
 * wrote (that is what makes it survive a restart), it is scoped to the person and the kind, and
 * another person's sends are invisible to it.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `sends-${randomUUID()}`;
const owner = `${prefix}-owner`;
const other = `${prefix}-other`;
const bot = `${prefix}-bot`;

const store = createSendsStore(database);

beforeAll(async () => {
  await database.insert(users).values([
    { id: owner, email: `${owner}@example.test` },
    { id: other, email: `${other}@example.test` },
  ]);
  await database.insert(agents).values({
    id: bot,
    name: "Send Bot",
    type: "built_in",
    configuration: {},
  });
});

afterAll(async () => {
  await database.delete(users).where(inArray(users.id, [owner, other]));
  await database.delete(agents).where(inArray(agents.id, [bot]));
  await database.$client.close();
});

test("the cap counts today's sends per person and kind, across store instances", async () => {
  // The real clock: `record` stamps the moment it writes, so "today" is whatever day this run of
  // the suite happens on, and the boundary row is derived from it rather than fixed.
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3_600_000);
  for (let index = 0; index < 3; index += 1) {
    await store.record({
      ownerUserId: owner,
      agentId: bot,
      kind: "email",
      target: `person-${index}@example.com`,
      providerId: `ses-${index}`,
    });
  }
  await store.record({
    ownerUserId: owner,
    agentId: bot,
    kind: "slack",
    target: "slack-webhook",
    providerId: "slack-webhook",
  });
  await store.record({
    ownerUserId: other,
    agentId: bot,
    kind: "email",
    target: "someone-else@example.com",
    providerId: "ses-other",
  });

  // A NEW instance — the restarted process, the second replica — counts the same rows.
  const restarted = createSendsStore(database);
  expect(await restarted.countToday(owner, "email", now)).toBe(3);
  // The kind and the person each bound their own count: Slack's send and the other person's
  // email do not reach into this number.
  expect(await restarted.countToday(owner, "slack", now)).toBe(1);
  expect(await restarted.countToday(other, "email", now)).toBe(1);

  // Yesterday's sends are not today's, on the UTC day the cap counts. The store always records
  // at the current moment, so the yesterday row is written directly, as a row that arrived then.
  await database.insert(botSends).values({
    id: randomUUID(),
    ownerUserId: owner,
    agentId: bot,
    kind: "email",
    target: "late@example.com",
    providerId: "ses-late",
    createdAt: yesterday,
  });
  expect(await restarted.countToday(owner, "email", now)).toBe(3);
  // A different day — here, the day after tomorrow — counts none of them: the window is one
  // person's UTC day, not "everything so far".
  const laterDay = new Date(now.getTime() + 48 * 3_600_000);
  expect(await restarted.countToday(owner, "email", laterDay)).toBe(0);
});
