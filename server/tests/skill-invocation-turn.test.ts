import { describe, expect, test } from "bun:test";
import { runTurnOrSkill } from "../src/plugins/invocation-turn";
import { PluginRefusedError } from "../src/plugins/store";

/**
 * The `/`-text → turn-runner seam (TD-02), the composition `index.ts` hands a person's channel
 * message to. `invokeSkill`'s own decisions — visibility, grant, audit — are proven against real
 * Postgres in `skill-invocation.integration.test.ts`; what is pinned here is the wiring around it:
 * what runs when, what instruction the runner is given, and what comes back.
 */

describe("a person's channel text against the turn runner", () => {
  test("text that is not an invocation runs the ordinary turn, untouched", async () => {
    const turnInstructions: string[] = [];
    const result = await runTurnOrSkill({
      text: "what is on my plate today",
      botId: "bot",
      actorId: "person",
      invokeSkill: () => {
        throw new Error("the store must never be reached");
      },
      runTurn: async (instruction) => {
        turnInstructions.push(instruction);
        return { replyText: "your tasks", components: [{ kind: "chart" }] };
      },
    });

    expect(turnInstructions).toEqual(["what is on my plate today"]);
    expect(result.replyText).toBe("your tasks");
    expect(result.skill).toBeNull();
    // The turn's own answer travels whole, not just its text.
    expect((result as { components?: unknown[] }).components).toEqual([
      { kind: "chart" },
    ]);
  });

  test("a `/slug` invocation runs through the store, whose run is the turn", async () => {
    const turnInstructions: string[] = [];
    const result = await runTurnOrSkill({
      text: "/standup shipped the auth flow",
      botId: "bot",
      actorId: "person",
      invokeSkill: (call) =>
        Promise.resolve(call.text).then(async () => {
          expect(call.botId).toBe("bot");
          expect(call.actorId).toBe("person");
          const output = await call.run({
            skill: { instructions: "Be careful." },
            userText: "shipped the auth flow",
          });
          return { slug: "standup", output };
        }),
      runTurn: async (instruction) => {
        turnInstructions.push(instruction);
        return { replyText: "done" };
      },
    });

    // The instructions are the skill's; what the person typed after the slug rides with them.
    expect(turnInstructions).toEqual(["Be careful.\n\nshipped the auth flow"]);
    expect(result.replyText).toBe("done");
    expect(result.skill).toBe("standup");
  });

  test("an invocation with nothing after the slug runs on the instructions alone", async () => {
    const turnInstructions: string[] = [];
    await runTurnOrSkill({
      text: "/standup",
      botId: "bot",
      actorId: "person",
      invokeSkill: async (call) => ({
        slug: "standup",
        output: await call.run({
          skill: { instructions: "Be careful." },
          userText: "",
        }),
      }),
      runTurn: async (instruction) => {
        turnInstructions.push(instruction);
        return { replyText: "done" };
      },
    });

    expect(turnInstructions).toEqual(["Be careful."]);
  });

  test("a refusal from the store is the reply, not a failed turn", async () => {
    const result = await runTurnOrSkill({
      text: "/ungranted",
      botId: "bot",
      actorId: "person",
      invokeSkill: async () => {
        throw new PluginRefusedError(
          "This Bot has not been given the skill ungranted.",
          null,
        );
      },
      runTurn: async () => {
        throw new Error("the runner must never be reached");
      },
    });

    expect(result.replyText).toBe(
      "This Bot has not been given the skill ungranted.",
    );
    expect(result.skill).toBeNull();
  });

  test("any other failure of the skill turn still fails the turn", async () => {
    const outcome = await runTurnOrSkill({
      text: "/standup",
      botId: "bot",
      actorId: "person",
      invokeSkill: async (call) => ({
        slug: "standup",
        output: await call.run({
          skill: { instructions: "Be careful." },
          userText: "",
        }),
      }),
      runTurn: async () => {
        throw new Error("the model was unreachable");
      },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("the model was unreachable");
  });
});
