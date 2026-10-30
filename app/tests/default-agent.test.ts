import { describe, expect, test } from "bun:test";
import {
  DIYA_AGENT_ID,
  defaultAgentId,
  defaultAgentProfile,
  PICKED_HARNESS_AGENT_ID,
} from "@/lib/agents/default-agent";
import type { AgentProfile } from "@/lib/agents/queries";

function agent(id: string, name = id): AgentProfile {
  return {
    avatarSeed: id,
    builtIn: id === "general-assistant",
    canManage: true,
    endpoint: id === PICKED_HARNESS_AGENT_ID ? "http://127.0.0.1:4201" : null,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    id,
    mine: true,
    name,
    roleDescription: "Role",
    systemOwned: false,
    title: name,
    visibility: "private",
  };
}

describe("default agent selection", () => {
  test("prefers the picked harness over the first visible agent", () => {
    const chosen = defaultAgentProfile([
      agent("general-assistant", "General Assistant"),
      agent(PICKED_HARNESS_AGENT_ID, "LangGraph"),
    ]);

    expect(chosen?.id).toBe(PICKED_HARNESS_AGENT_ID);
    expect(
      defaultAgentId([
        agent("general-assistant"),
        agent(PICKED_HARNESS_AGENT_ID),
      ]),
    ).toBe(PICKED_HARNESS_AGENT_ID);
  });

  test("keeps the route-specific fallback when there is no picked harness", () => {
    const general = agent("general-assistant", "General Assistant");
    const shared = agent("shared-agent", "Shared Agent");

    expect(defaultAgentProfile([general, shared], shared)?.id).toBe(
      "shared-agent",
    );
  });

  test("falls back to the first agent when no picked harness or route fallback exists", () => {
    expect(
      defaultAgentId([agent("general-assistant"), agent("researcher")]),
    ).toBe("general-assistant");
  });

  test("returns undefined when the roster is still absent", () => {
    expect(defaultAgentId(undefined)).toBeUndefined();
  });

  test("prefers diya when present, even over the picked harness", () => {
    const chosen = defaultAgentProfile([
      agent("general-assistant", "General Assistant"),
      agent(PICKED_HARNESS_AGENT_ID, "LangGraph"),
      agent(DIYA_AGENT_ID, "DIYA"),
    ]);

    expect(chosen?.id).toBe(DIYA_AGENT_ID);
    expect(
      defaultAgentId([agent(PICKED_HARNESS_AGENT_ID), agent(DIYA_AGENT_ID)]),
    ).toBe(DIYA_AGENT_ID);
  });

  test("prefers diya over a route-specific fallback", () => {
    const shared = agent("shared-agent", "Shared Agent");

    expect(
      defaultAgentProfile(
        [agent("general-assistant"), agent(DIYA_AGENT_ID), shared],
        shared,
      )?.id,
    ).toBe(DIYA_AGENT_ID);
  });

  test("keeps the old chain unchanged when diya is absent", () => {
    const general = agent("general-assistant", "General Assistant");
    const harness = agent(PICKED_HARNESS_AGENT_ID, "LangGraph");
    const shared = agent("shared-agent", "Shared Agent");

    expect(defaultAgentProfile([general, harness])?.id).toBe(
      PICKED_HARNESS_AGENT_ID,
    );
    expect(defaultAgentProfile([general, shared], shared)?.id).toBe(
      "shared-agent",
    );
    expect(defaultAgentId([general, shared])).toBe("general-assistant");
  });
});
