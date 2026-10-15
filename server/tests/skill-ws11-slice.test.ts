import { describe, expect, spyOn, test } from "bun:test";
import {
  createWs11Slice,
  parseSkillInvocation,
  Ws11RefusedError,
  type Ws11Model,
} from "../src/plugins/ws11-slice";

/**
 * WS-11 first slice (09 §4): one `/`-invoked personal skill end to end.
 *
 * No network and no database: the model is a recording stub installed by
 * injection (the established `ws10-slice` seam shape), the registry is
 * per-test so nothing leaks between files under Bun's single-process run,
 * and the model boundary is asserted with a restorable `spyOn` rather than
 * `mock.module`. Learning containers and delivery are deferred to later
 * slices and appear here only as the things nothing imports.
 */

const SKILL = {
  slug: "standup",
  title: "Standup",
  summary: "Summarise yesterday.",
  instructions: "Summarise what shipped yesterday in three bullets.",
  ownerUserId: "alice",
};

function recording(answer = "stubbed answer"): {
  model: Ws11Model;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    model: {
      run: async (input) => {
        // Snapshotted rather than held by reference, so a model that kept
        // the object and edited it later would not rewrite what was recorded.
        calls.push(structuredClone(input));
        return answer;
      },
    },
  };
}

function ready(options: { agentId?: string; answer?: string } = {}) {
  const { model } = recording(options.answer);
  const slice = createWs11Slice({ model });
  slice.installSkill({ ...SKILL });
  if (options.agentId) slice.grant(options.agentId);
  return slice;
}

describe("parsing the `/` invocation", () => {
  test("a slash plus words parses to the slug and the rest", () => {
    expect(parseSkillInvocation("/standup shipped auth")).toEqual({
      slug: "standup",
      args: "shipped auth",
    });
  });

  test("a bare invocation parses with empty args", () => {
    expect(parseSkillInvocation("/standup")).toEqual({
      slug: "standup",
      args: "",
    });
  });

  test("plain chat, a bare slash and a path are not invocations", () => {
    expect(parseSkillInvocation("hello")).toBeNull();
    expect(parseSkillInvocation("/")).toBeNull();
    expect(parseSkillInvocation("//standup")).toBeNull();
  });

  test("an uppercase name is not a skill invocation", () => {
    expect(parseSkillInvocation("/Standup shipped")).toBeNull();
  });
});

describe("one personal skill invoked by `/`", () => {
  test("parse, resolve, execute and result round-trip through the stub", async () => {
    const { model, calls } = recording("three bullets");
    const slice = createWs11Slice({ model });
    slice.installSkill({ ...SKILL });
    slice.grant("agent-1");

    const execute = spyOn(model, "run");
    try {
      const result = await slice.invoke({
        text: "/standup shipped auth",
        agentId: "agent-1",
        actorId: "alice",
      });

      expect(result).toEqual({
        slug: "standup",
        instructions: SKILL.instructions,
        userText: "shipped auth",
        output: "three bullets",
      });
      // The model boundary was crossed exactly once, carrying the skill.
      expect(execute).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([
        {
          skill: { ...SKILL },
          agentId: "agent-1",
          actorId: "alice",
          userText: "shipped auth",
        },
      ]);
      expect(slice.auditTrail).toEqual([
        {
          eventType: "skill.invoked",
          targetType: "skill",
          targetId: "standup",
          payload: {
            actor: "alice",
            bot: "agent-1",
            skill: "standup",
            userText: "shipped auth",
          },
        },
      ]);
    } finally {
      execute.mockRestore();
    }
  });

  test("somebody else's skill is refused before the model is reached", async () => {
    const { model, calls } = recording();
    const slice = createWs11Slice({ model });
    slice.installSkill({ ...SKILL });
    slice.grant("agent-1");

    const execute = spyOn(model, "run");
    try {
      const refused = slice.invoke({
        text: "/standup shipped auth",
        agentId: "agent-1",
        actorId: "bob",
      });

      await expect(refused).rejects.toBeInstanceOf(Ws11RefusedError);
      await expect(refused).rejects.toThrow("somebody else's skill");
      expect(execute).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(slice.auditTrail).toEqual([
        {
          eventType: "skill.invoke_rejected",
          targetType: "skill",
          targetId: "standup",
          payload: {
            actor: "bob",
            bot: "agent-1",
            skill: "standup",
            refusal: "not_visible",
            reason: "standup is somebody else's skill.",
          },
        },
      ]);
    } finally {
      execute.mockRestore();
    }
  });

  test("an agent that was never given the skill is refused", async () => {
    const slice = ready({ agentId: "agent-allowed" });

    await expect(
      slice.invoke({
        text: "/standup shipped auth",
        agentId: "agent-stranger",
        actorId: "alice",
      }),
    ).rejects.toThrow("has not been given the skill standup");
    expect(slice.auditTrail).toEqual([
      {
        eventType: "skill.invoke_rejected",
        targetType: "skill",
        targetId: "standup",
        payload: {
          actor: "alice",
          bot: "agent-stranger",
          skill: "standup",
          refusal: "not_granted",
          reason: "This Bot has not been given the skill standup.",
        },
      },
    ]);
  });

  test("a name nobody installed is not a skill, and records nothing", async () => {
    const { model, calls } = recording();
    const slice = createWs11Slice({ model });
    slice.installSkill({ ...SKILL });
    slice.grant("agent-1");

    const execute = spyOn(model, "run");
    try {
      await expect(
        slice.invoke({
          text: "/nothing here",
          agentId: "agent-1",
          actorId: "alice",
        }),
      ).rejects.toThrow("There is no skill called nothing.");
      expect(execute).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      // A name nothing answers to is refused without an audit row claiming
      // a grant decision about it: there is no skill to decide on.
      expect(slice.auditTrail).toEqual([]);
    } finally {
      execute.mockRestore();
    }
  });

  test("plain chat reaches no skill and records nothing", async () => {
    const slice = ready({ agentId: "agent-1" });

    await expect(
      slice.invoke({
        text: "hello",
        agentId: "agent-1",
        actorId: "alice",
      }),
    ).rejects.toThrow("not a skill invocation");
    expect(slice.auditTrail).toEqual([]);
  });

  test("without a model the invocation fails closed", async () => {
    const slice = createWs11Slice();
    slice.installSkill({ ...SKILL });
    slice.grant("agent-1");

    await expect(
      slice.invoke({
        text: "/standup shipped auth",
        agentId: "agent-1",
        actorId: "alice",
      }),
    ).rejects.toThrow("No model is installed");
    expect(slice.auditTrail).toEqual([]);
  });
});
