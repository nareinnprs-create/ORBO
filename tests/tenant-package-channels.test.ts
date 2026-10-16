import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { loadTenantPackage } from "../server/src/tenant-package";

/*
 * Tenant-package channel/agent referential integrity
 * (docs/planning/20-phase5-diya-seeding.md §4.2, §6 R5).
 *
 * The loader refuses to boot on a dangling ref: `validateTenantPackage` in
 * `server/src/tenant-package.ts` throws `channel references unknown agent`
 * for any `permitted_agents` entry with no matching agent id. These tests pin
 * that contract against the shipped `examples/orbo` package at both levels:
 * the raw YAML files (env-independent, covers conditional rows whose blank
 * endpoints make the loader drop them) and the loaded package (exercises the
 * real loader check).
 *
 * Current truth: `diya` is a declared agent and orchestrates every channel
 * (docs/planning/20-phase5-diya-seeding.md §4.2) — it is listed in each
 * channel's `permitted_agents` in `examples/orbo/channels.yaml`, and the
 * tests below pin that membership at both levels.
 */

const packagePath = join(import.meta.dir, "..", "examples", "orbo");

function declaredAgentIds(): Set<string> {
  const document = parse(
    readFileSync(join(packagePath, "agents.yaml"), "utf8"),
  ) as { agents?: { id?: unknown }[] };
  if (!Array.isArray(document.agents)) {
    throw new Error("agents.yaml agents must be a list");
  }
  const ids = new Set<string>();
  for (const agent of document.agents) {
    if (typeof agent?.id !== "string" || !agent.id.trim()) {
      throw new Error("agents.yaml agent.id must be a non-empty string");
    }
    ids.add(agent.id);
  }
  return ids;
}

function channelRefs(): { id: string; permittedAgents: string[] }[] {
  const document = parse(
    readFileSync(join(packagePath, "channels.yaml"), "utf8"),
  ) as { channels?: { id?: unknown; permitted_agents?: unknown }[] };
  if (!Array.isArray(document.channels)) {
    throw new Error("channels.yaml channels must be a list");
  }
  return document.channels.map((channel) => {
    if (typeof channel?.id !== "string" || !channel.id.trim()) {
      throw new Error("channels.yaml channel.id must be a non-empty string");
    }
    if (
      !Array.isArray(channel.permitted_agents) ||
      channel.permitted_agents.some((entry) => typeof entry !== "string")
    ) {
      throw new Error(
        `channel "${channel.id}" permitted_agents must be an array of strings`,
      );
    }
    return {
      id: channel.id,
      permittedAgents: channel.permitted_agents as string[],
    };
  });
}

test("every channels.yaml permitted_agents entry matches a declared agent id", () => {
  const agentIds = declaredAgentIds();
  expect(agentIds.size).toBeGreaterThan(0);
  expect(agentIds).toContain("diya");

  for (const channel of channelRefs()) {
    for (const agentId of channel.permittedAgents) {
      expect(
        agentIds.has(agentId),
        `channel "${channel.id}" permits unknown agent "${agentId}"`,
      ).toBe(true);
    }
  }
});

test("diya orchestrates every channel (doc 20 §4.2)", () => {
  const channels = new Map(
    channelRefs().map((channel) => [channel.id, channel.permittedAgents]),
  );
  expect([...channels.keys()].sort()).toEqual([
    "company-knowledge",
    "general-assistant",
    "risk-and-compliance",
  ]);

  // DIYA orchestrates specialists wherever it must address the channel's
  // needs: everyday work directly + routing, risk specialists as a group,
  // and the knowledge specialist for document answers.
  expect(channels.get("general-assistant")?.slice().sort()).toEqual([
    "diya",
    "general-assistant",
  ]);
  expect(channels.get("risk-and-compliance")?.slice().sort()).toEqual([
    "diya",
    "knowledge",
    "risk-analyst",
  ]);
  expect(channels.get("company-knowledge")?.slice().sort()).toEqual([
    "diya",
    "knowledge",
  ]);
});

test("the loaded package serves diya in every channel with nobody left empty", async () => {
  const tenantPackage = await loadTenantPackage(packagePath);
  const agentIds = new Set(tenantPackage.agents.map((agent) => agent.id));
  expect(agentIds.has("diya")).toBe(true);

  expect(tenantPackage.channels.length).toBeGreaterThan(0);
  for (const channel of tenantPackage.channels) {
    expect(
      channel.permittedAgents.length,
      `channel "${channel.id}" permits no loaded agent`,
    ).toBeGreaterThan(0);
    expect(
      channel.permittedAgents,
      `channel "${channel.id}" does not serve diya`,
    ).toContain("diya");
    for (const agentId of channel.permittedAgents) {
      expect(
        agentIds.has(agentId),
        `channel "${channel.id}" permits unknown agent "${agentId}"`,
      ).toBe(true);
    }
  }
});
