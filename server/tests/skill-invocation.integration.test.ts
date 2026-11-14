import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import type { ActionPolicy } from "../src/computer/policy";
import { createDatabase } from "../src/db/client";
import {
  agents,
  auditEvents,
  pluginGrants,
  skills,
  users,
} from "../src/db/schema";
import {
  createPluginStore,
  PluginRefusedError,
  parseSkillInvocation,
} from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Invoking a skill with `/` through the canonical store (TD-02).
 *
 * What the WS-11 slice proved in memory is proven against its tables now: the
 * parser, the visibility rule and the grant are one path, shared with the skill
 * registry the routes write, and every refusal is an audit row in the same
 * vocabulary the store already writes. The runner is a recording stub — the
 * execution seam is the turn runner in production, and what is under test is
 * everything that happens before and after it.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

/**
 * The per-test ceiling. Generous, because these tests run on the shared test database
 * alongside every other suite in the same process, and the five-second default is
 * contention food: a busy moment stalls a statement, not a property under test.
 */
const DB_TIMEOUT = 30_000;
const auditStore = createAuditStore(database);
const policy: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

const store = createPluginStore({
  database,
  auditStore,
  credentials: { readSecret: async () => null },
  encryptionKey: "x".repeat(44),
  policy: () => policy,
});

const suite = randomUUID().slice(0, 8);
const alice = `user_alice_${suite}`;
const bob = `user_bob_${suite}`;
const bot = `agent_bot_${suite}`;
const otherBot = `agent_other_${suite}`;
const aliceSkill = `alice-skill-${suite}`;
const deploymentSkill = `deployment-skill-${suite}`;

const skillFixture = (slug: string, ownerUserId: string | null) => ({
  id: slug,
  slug,
  ownerUserId,
  title: slug,
  summary: "",
  instructions: `Do ${slug} carefully.`,
  origin: "yours",
  installedBy: ownerUserId,
});

async function auditRowsFor(slug: string) {
  return database
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.targetType, "skill"), eq(auditEvents.targetId, slug)),
    );
}

beforeAll(async () => {
  for (const [id, email] of [
    [alice, `${alice}@example.test`],
    [bob, `${bob}@example.test`],
  ] as const) {
    await database
      .insert(users)
      .values({ id, email, name: id })
      .onConflictDoNothing();
  }
  for (const id of [bot, otherBot]) {
    await database
      .insert(agents)
      .values({ id, name: id, type: "remote_ag_ui", configuration: {} })
      .onConflictDoNothing();
  }
  await database.insert(skills).values(skillFixture(aliceSkill, alice));
  await database.insert(skills).values(skillFixture(deploymentSkill, null));
  await store.grant("skill", aliceSkill, bot, alice);
  await store.grant("skill", deploymentSkill, bot, alice);
});

afterAll(async () => {
  // `audit_events` is append-only (a trigger refuses every delete and update), so
  // the invocation rows this suite wrote stay. Their target ids are suite-scoped,
  // which is what keeps them from reading as anybody else's fixtures.
  await database
    .delete(pluginGrants)
    .where(inArray(pluginGrants.ref, [aliceSkill, deploymentSkill]));
  await database
    .delete(skills)
    .where(inArray(skills.slug, [aliceSkill, deploymentSkill]));
  await database.delete(agents).where(inArray(agents.id, [bot, otherBot]));
  await database.delete(users).where(inArray(users.id, [alice, bob]));
  await database.$client.close();
});

describe("parsing the `/` invocation", () => {
  test(
    "a slash plus words parses to the slug and the rest",
    () => {
      expect(parseSkillInvocation("/standup shipped auth")).toEqual({
        slug: "standup",
        args: "shipped auth",
      });
      expect(parseSkillInvocation("/standup")).toEqual({
        slug: "standup",
        args: "",
      });
    },
    DB_TIMEOUT,
  );

  test(
    "anything that is not a `/slug` is not an invocation",
    () => {
      expect(parseSkillInvocation("hello")).toBeNull();
      expect(parseSkillInvocation("/")).toBeNull();
      expect(parseSkillInvocation("//standup")).toBeNull();
      expect(parseSkillInvocation("/Standup shipped")).toBeNull();
      expect(parseSkillInvocation("/has_underscore")).toBeNull();
    },
    DB_TIMEOUT,
  );
});

describe("invoking a skill through the store", () => {
  test(
    "a granted skill owned by the asker runs and is audited",
    async () => {
      const ran: unknown[] = [];
      const result = await store.invokeSkill({
        text: `/${aliceSkill} the login flow`,
        botId: bot,
        actorId: alice,
        run: async (context) => {
          ran.push(context);
          return "did it";
        },
      });

      expect(result.slug).toBe(aliceSkill);
      expect(result.userText).toBe("the login flow");
      expect(result.instructions).toBe(`Do ${aliceSkill} carefully.`);
      expect(result.output).toBe("did it");
      expect(ran).toHaveLength(1);

      const rows = await auditRowsFor(aliceSkill);
      const invoked = rows.filter((row) => row.eventType === "skill.invoked");
      expect(invoked).toHaveLength(1);
      expect(invoked[0]?.payload).toMatchObject({
        actor: alice,
        bot,
        skill: aliceSkill,
        userText: "the login flow",
      });
    },
    DB_TIMEOUT,
  );

  test(
    "somebody else's skill is refused before the runner, and audited",
    async () => {
      const outcome = await store
        .invokeSkill({
          text: `/${aliceSkill}`,
          botId: bot,
          actorId: bob,
          run: async () => {
            throw new Error("the runner must never be reached");
          },
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as Error).message).toMatch(/somebody else's skill/);
      const rows = await auditRowsFor(aliceSkill);
      const rejected = rows.filter(
        (row) => row.eventType === "skill.invoke_rejected",
      );
      expect(
        rejected.filter(
          (row) =>
            (row.payload as { refusal?: string }).refusal === "not_visible",
        ),
      ).toHaveLength(1);
    },
    DB_TIMEOUT,
  );

  test(
    "an administrator may invoke what they do not own; the grant still applies",
    async () => {
      const result = await store.invokeSkill({
        text: `/${aliceSkill}`,
        botId: bot,
        actorId: bob,
        isAdmin: true,
        run: async () => "admin ran it",
      });
      expect(result.output).toBe("admin ran it");

      const outcome = await store
        .invokeSkill({
          text: `/${aliceSkill}`,
          botId: otherBot,
          actorId: bob,
          isAdmin: true,
          run: async () => "never",
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as Error).message).toMatch(
        /has not been given the skill/,
      );
    },
    DB_TIMEOUT,
  );

  test(
    "a Bot that was never given the skill is refused before the runner, and audited",
    async () => {
      const outcome = await store
        .invokeSkill({
          text: `/${deploymentSkill}`,
          botId: otherBot,
          actorId: alice,
          run: async () => {
            throw new Error("the runner must never be reached");
          },
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as Error).message).toBe(
        `This Bot has not been given the skill ${deploymentSkill}.`,
      );
      const rows = await auditRowsFor(deploymentSkill);
      const rejected = rows.filter(
        (row) => row.eventType === "skill.invoke_rejected",
      );
      expect(rejected).toHaveLength(1);
      expect((rejected[0]!.payload as { refusal?: string }).refusal).toBe(
        "not_granted",
      );
    },
    DB_TIMEOUT,
  );

  test(
    "a name nobody installed is refused without an audit row",
    async () => {
      const before = await auditRowsFor(`ghost-${suite}`);
      const outcome = await store
        .invokeSkill({
          text: `/ghost-${suite}`,
          botId: bot,
          actorId: alice,
          run: async () => "never",
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as Error).message).toMatch(/no skill called/);
      expect(await auditRowsFor(`ghost-${suite}`)).toEqual(before);
      expect(before).toHaveLength(0);
    },
    DB_TIMEOUT,
  );

  test(
    "plain chat is not an invocation, and costs no skill lookup",
    async () => {
      const before = await auditRowsFor(aliceSkill);
      const outcome = await store
        .invokeSkill({
          text: "just a message",
          botId: bot,
          actorId: alice,
          run: async () => "never",
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as Error).message).toMatch(/not a skill invocation/);
      expect(await auditRowsFor(aliceSkill)).toHaveLength(before.length);
    },
    DB_TIMEOUT,
  );
});
