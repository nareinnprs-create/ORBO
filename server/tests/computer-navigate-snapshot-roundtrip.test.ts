import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import type { AuditEventInput, AuditStore } from "../src/audit";
import type { AppVariables, AuthenticatedActor } from "../src/auth/guards";
import {
  ActionRefusedError,
  createComputerGateway,
} from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import type { ComputerProvider } from "../src/computer/provider";
import { createComputerRoutes } from "../src/computer/routes";
import type { SnapshotResult } from "../src/computer/schema";

/**
 * WS-03 first slice (09 §4): one governed navigate+snapshot round-trip on one
 * container with one audit row; everything else 403-fail-closed.
 *
 * Proves the resolve → policy → audit row → act seam for the single proven
 * path (`computer_navigate`, framed by snapshots) and that no ungoverned
 * direct control reaches the browser: a refused navigation never leaves the
 * server, and the refusal itself is still a row on the trail.
 *
 * DB-free by design: the container/browser boundary is stubbed exactly the
 * established way (fake provider + injected fetchImpl + in-memory audit
 * store, cf. computer-gateway.test.ts) — no live browser, no Docker, no
 * Chromium, no mock.module.
 */

const ACTOR = { id: "slice-user" };
const PERMISSIVE: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };

function snapshotPage(generation: number): SnapshotResult {
  return {
    snapshotId: generation,
    url: "https://example.com/",
    title: "Example",
    truncated: false,
    elements: [{ ref: "e1", role: "link", name: "More information" }],
  };
}

/** The stubbed container: records which HTTP actions reached the browser. */
function fakeContainer() {
  const calls: string[] = [];
  let snapshotsTaken = 0;
  const provider: ComputerProvider = {
    name: "test",
    isolation: "per-bot",
    locate: async () => "http://agent-computer:4100",
    status: async (botId) => ({ botId, state: "ready" }),
    stop: async () => ({ wasRunning: false }),
    reset: async () => ({ cleared: false }),
    list: async () => [],
  };
  const fetchImpl = (async (url: string) => {
    const path = new URL(url).pathname;
    switch (path) {
      case "/snapshot":
        snapshotsTaken += 1;
        return Response.json(snapshotPage(7 + snapshotsTaken - 1));
      case "/navigate":
        calls.push("navigate");
        return Response.json({
          url: "https://example.com/",
          title: "Example",
          elapsedMs: 1,
        });
      default:
        return Response.json(
          { error: `Unknown endpoint: ${path}` },
          { status: 404 },
        );
    }
  }) as unknown as typeof fetch;
  return { provider, fetchImpl, calls };
}

function fakeAudit() {
  const rows: AuditEventInput[] = [];
  const store: AuditStore = { insert: async (event) => void rows.push(event) };
  return { store, rows };
}

async function gatewayFor(policy: ActionPolicy | undefined) {
  const { provider, fetchImpl, calls } = fakeContainer();
  const { store, rows } = fakeAudit();
  const gateway = createComputerGateway({
    provider,
    fetchImpl,
    auditStore: store,
    policy: () => policy,
  });
  return { gateway, calls, rows };
}

const member: AuthenticatedActor = {
  id: "user-1",
  email: "member@orbo.test",
  role: "user",
};

function routesFor(
  gateway: Parameters<typeof createComputerRoutes>[0],
  actor: AuthenticatedActor = member,
) {
  const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
    context,
    next,
  ) => {
    context.set("actor", actor);
    await next();
  };
  return createComputerRoutes(gateway, {}, requireUser, async () => true);
}

function postNavigate(url: string): Request {
  return new Request("http://orbo.test/bot-1/navigate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

describe("WS-03 first slice: governed navigate+snapshot round-trip", () => {
  test("allow-path: snapshot, navigate, snapshot is governed and audited", async () => {
    const { gateway, calls, rows } = await gatewayFor(PERMISSIVE);

    const before = await gateway.snapshot("bot-1");
    expect(before.snapshotId).toBe(7);

    const opened = await gateway.navigate(
      "bot-1",
      ACTOR,
      "https://example.com/",
    );
    expect(opened.url).toBe("https://example.com/");
    expect(calls).toEqual(["navigate"]);

    const after = await gateway.snapshot("bot-1");
    expect(after.snapshotId).toBe(8);
    expect(after.elements).toHaveLength(1);

    // One audit row for the governed action: the snapshots frame it, only
    // the navigation is decided and recorded.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("computer.action_allowed");
    expect(rows[0]?.targetId).toBe("bot-1");
    expect(rows[0]?.payload.action).toBe("computer_navigate");
    expect(rows[0]?.payload.page).toBe("https://example.com/");
  });

  test("deny-path: a refused navigation never reaches the computer, but is still recorded", async () => {
    const rule = 'page.host == "example.com"';
    const { gateway, calls, rows } = await gatewayFor({
      ...PERMISSIVE,
      deny: [rule],
    });
    await gateway.snapshot("bot-1");

    const refusal = await gateway
      .navigate("bot-1", ACTOR, "https://example.com/")
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ActionRefusedError);
    expect((refusal as ActionRefusedError).rule).toBe(rule);
    // Fail-closed: the decision happens before the effect.
    expect(calls).toEqual([]);
    // …and the attempt is still a row on the trail, naming the rule.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("computer.action_refused");
    expect(rows[0]?.payload.action).toBe("computer_navigate");
    expect(rows[0]?.payload.decision.rule).toBe(rule);
  });

  test("fail-closed: an absent policy refuses the navigation and records the refusal", async () => {
    const { gateway, calls, rows } = await gatewayFor(undefined);
    await gateway.snapshot("bot-1");

    await expect(
      gateway.navigate("bot-1", ACTOR, "https://example.com/"),
    ).rejects.toThrow(ActionRefusedError);

    expect(calls).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("computer.action_refused");
  });

  test("route-level allow: POST navigate goes through the gateway seam and answers 200", async () => {
    const { gateway, calls, rows } = await gatewayFor(PERMISSIVE);
    let gatewayNavigations = 0;
    const counting = {
      ...gateway,
      navigate: async (...args: Parameters<typeof gateway.navigate>) => {
        gatewayNavigations += 1;
        return gateway.navigate(...args);
      },
    };
    const routes = routesFor(counting);

    const response = await routes.request(postNavigate("https://example.com/"));

    expect(response.status).toBe(200);
    // The route drove the browser only through gateway.navigate — the
    // governed seam — never past it.
    expect(gatewayNavigations).toBe(1);
    expect(calls).toEqual(["navigate"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("computer.action_allowed");
  });

  test("route-level deny: ungoverned direct control is refused with 403 and the browser is untouched", async () => {
    const rule = 'page.host == "example.com"';
    const { gateway, calls, rows } = await gatewayFor({
      ...PERMISSIVE,
      deny: [rule],
    });
    const routes = routesFor(gateway);

    const response = await routes.request(postNavigate("https://example.com/"));

    // Everything but the governed allow-path is 403-fail-closed: without a
    // permitting policy there is no other way to drive this browser.
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: expect.any(String),
      rule,
    });
    expect(calls).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("computer.action_refused");
  });
});
