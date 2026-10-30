import { describe, expect, test } from "bun:test";
import {
  type DotsDotInput,
  DotsImportRefusedError,
  importDots,
} from "../src/agents/dots-import";

const OWNER = "bootstrap-user-1";

function dot(overrides: Partial<DotsDotInput> = {}): DotsDotInput {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    spaceId: "space-a",
    spaceIds: ["space-b", "space-a", "space-b"],
    name: "Researcher",
    instructions: "Summarize what you find.",
    researchAllowed: 1,
    memoryAllowed: 0,
    createdAt: 1723600000000,
    learningContainerId: "learn-box",
    skillDeliveryEnabled: 0,
    ...overrides,
  };
}

describe("dots-import", () => {
  test("maps a valid dot onto agents, profile, and agent_spaces rows", () => {
    const result = importDots({ dots: [dot()] }, { ownerUserId: OWNER });

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.agents).toHaveLength(1);
    expect(result.agentProfiles).toHaveLength(1);

    const agent = result.agents[0]!;
    expect(agent.id).toBe("dot-11111111-2222-4333-8444-555555555555");
    expect(agent.name).toBe("Researcher");
    expect(agent.type).toBe("built_in");
    expect(agent.configuration).toEqual({
      systemPrompt: "Summarize what you find.",
    });
    expect(agent.researchAllowed).toBe(true);
    expect(agent.memoryAllowed).toBe(false);
    expect(agent.defaultSpaceId).toBe("space-a");
    expect(agent.createdAt).toEqual(new Date(1723600000000));
    expect(agent.updatedAt).toEqual(new Date(1723600000000));

    const profile = result.agentProfiles[0]!;
    expect(profile.agentId).toBe(agent.id);
    expect(profile.ownerUserId).toBe(OWNER);
    expect(profile.title).toBe("Researcher");
    expect(profile.roleDescription).toBe("Summarize what you find.");
    expect(profile.avatarSeed).toBe(agent.id);
    expect(profile.visibility).toBe("private");
    expect(profile.deletedAt).toBeNull();

    // spaceIds sorted + deduped into the join.
    expect(result.agentSpaces).toEqual([
      { agentId: agent.id, spaceId: "space-a" },
      { agentId: agent.id, spaceId: "space-b" },
    ]);
  });

  test("accepts bool-int and boolean forms; unset flags stay null, delivery defaults false", () => {
    const result = importDots(
      {
        dots: [
          dot({
            id: "bool-1",
            researchAllowed: true,
            memoryAllowed: false,
            skillDeliveryEnabled: true,
          }),
          dot({
            id: "bool-2",
            researchAllowed: undefined,
            memoryAllowed: undefined,
            skillDeliveryEnabled: undefined,
            learningContainerId: null,
          }),
        ],
      },
      { ownerUserId: OWNER },
    );

    expect(result.report.skipped).toEqual([]);
    const [bools, unset] = [result.agents[0]!, result.agents[1]!];
    expect(bools.researchAllowed).toBe(true);
    expect(bools.memoryAllowed).toBe(false);
    expect(bools.skillDeliveryEnabled).toBe(true);
    expect(unset.researchAllowed ?? null).toBeNull();
    expect(unset.memoryAllowed ?? null).toBeNull();
    expect(unset.skillDeliveryEnabled ?? false).toBe(false);
  });

  test("falls back to [spaceId] when spaceIds are absent", () => {
    const { id: _dropped, spaceIds: _alsoDropped, ...rest } = dot();
    void _dropped;
    void _alsoDropped;
    const result = importDots(
      { dots: [{ ...rest, id: "no-acl" }] },
      { ownerUserId: OWNER },
    );

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.agentSpaces).toEqual([
      { agentId: "dot-no-acl", spaceId: "space-a" },
    ]);
  });

  test("skips overlong instructions without truncating", () => {
    const result = importDots(
      { dots: [dot({ id: "long-1", instructions: "x".repeat(2001) })] },
      { ownerUserId: OWNER },
    );

    expect(result.agents).toEqual([]);
    expect(result.agentProfiles).toEqual([]);
    expect(result.agentSpaces).toEqual([]);
    expect(result.report.imported).toBe(0);
    expect(result.report.skipped).toHaveLength(1);
    expect(result.report.skipped[0]!.dotId).toBe("long-1");
    expect(result.report.skipped[0]!.reason).toMatch(/2000/);
  });

  test("accepts instructions at exactly 2000 characters", () => {
    const result = importDots(
      { dots: [dot({ id: "edge-1", instructions: "y".repeat(2000) })] },
      { ownerUserId: OWNER },
    );

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.agentProfiles[0]!.roleDescription).toHaveLength(2000);
  });

  test("skips bad learning slugs and delivery-without-container", () => {
    const result = importDots(
      {
        dots: [
          dot({ id: "slug-1", learningContainerId: "Not_A_Slug!" }),
          dot({
            id: "slug-2",
            learningContainerId: null,
            skillDeliveryEnabled: 1,
          }),
          dot({
            id: "slug-3",
            learningContainerId: "ok",
            skillDeliveryEnabled: 2,
          }),
        ],
      },
      { ownerUserId: OWNER },
    );

    expect(result.report.imported).toBe(0);
    expect(result.report.skipped.map((s) => s.dotId)).toEqual([
      "slug-1",
      "slug-2",
      "slug-3",
    ]);
    expect(result.report.skipped[0]!.reason).toMatch(/learningContainerId/);
    expect(result.report.skipped[1]!.reason).toMatch(
      /requires a learningContainerId/,
    );
  });

  test("skips dots whose default space is not a member of spaceIds", () => {
    const result = importDots(
      {
        dots: [
          dot({ id: "space-1", spaceId: "space-zzz", spaceIds: ["space-a"] }),
        ],
      },
      { ownerUserId: OWNER },
    );

    expect(result.report.imported).toBe(0);
    expect(result.report.skipped[0]!.reason).toMatch(
      /not a member of spaceIds/,
    );
  });

  test("skips non 0/1 flags and non epoch-ms timestamps", () => {
    const result = importDots(
      {
        dots: [
          dot({ id: "flag-1", researchAllowed: 2 }),
          dot({ id: "time-1", createdAt: "yesterday" }),
        ],
      },
      { ownerUserId: OWNER },
    );

    expect(result.report.imported).toBe(0);
    expect(result.report.skipped.map((s) => s.dotId)).toEqual([
      "flag-1",
      "time-1",
    ]);
  });

  test("refuses token-bearing records with an explicit error and imports nothing", () => {
    const withToken = dot({
      id: "token-1",
      mcpConnections: [
        { name: "gh", url: "https://mcp.example", token: "sekret" },
      ],
    });

    let caught: unknown;
    try {
      importDots(
        { dots: [dot({ id: "good-1" }), withToken] },
        { ownerUserId: OWNER },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DotsImportRefusedError);
    expect(String((caught as Error).message)).toMatch(/token-1/);
    expect(String((caught as Error).message)).toMatch(/never be imported/i);
  });

  test("refuses top-level and hasToken records too", () => {
    expect(() =>
      importDots(
        { dots: [dot({ id: "token-2", token: "sekret" })] },
        { ownerUserId: OWNER },
      ),
    ).toThrow(DotsImportRefusedError);
    expect(() =>
      importDots(
        {
          dots: [dot({ id: "token-3", connections: [{ hasToken: true }] })],
        },
        { ownerUserId: OWNER },
      ),
    ).toThrow(/never be imported/i);
  });

  test("rejects a malformed envelope and a missing owner", () => {
    expect(() =>
      importDots({ dots: "nope" } as never, { ownerUserId: OWNER }),
    ).toThrow(/dots/);
    expect(() => importDots({ dots: [] }, { ownerUserId: "  " })).toThrow(
      /ownerUserId/,
    );
  });

  test("imports an empty roster to empty rows", () => {
    expect(importDots({ dots: [] }, { ownerUserId: OWNER })).toEqual({
      agents: [],
      agentProfiles: [],
      agentSpaces: [],
      report: { imported: 0, skipped: [] },
    });
  });
});
