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
 * Current truth only: `diya` is a declared agent but belongs to no channel
 * yet — adding it to `permitted_agents` lists needs owner review of exactly
 * which channels it must orchestrate, so nothing here asserts its membership
 * and this file must not be read as requiring its absence either.
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

test("the loaded package keeps every channel ref on a known agent", async () => {
  // Loading itself exercises the loader's `channel references unknown agent`
  // refusal: an unknown entry never reaches the assertions below.
  const tenantPackage = await loadTenantPackage(packagePath);
  const agentIds = new Set(tenantPackage.agents.map((agent) => agent.id));

  for (const channel of tenantPackage.channels) {
    // A channel left with nobody — e.g. every agent it names dropped as an
    // unconfigured conditional row — would boot but serve nothing.
    expect(
      channel.permittedAgents.length,
      `channel "${channel.id}" permits no loaded agent`,
    ).toBeGreaterThan(0);
    for (const agentId of channel.permittedAgents) {
      expect(
        agentIds.has(agentId),
        `channel "${channel.id}" permits unknown agent "${agentId}"`,
      ).toBe(true);
    }
  }
});
