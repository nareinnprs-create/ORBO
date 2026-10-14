import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { ComputerGateway } from "../src/computer/gateway";
import {
  createPolicyStore,
  DEFAULT_ACTION_POLICY,
} from "../src/computer/policy-store";
import { testEnvironment } from "./support/environment";

/**
 * Phase 7 R3: route every browser/desktop action through the gateway; delete raw
 * control, never alias.
 *
 * The canonical governed path is `/api/computers`, mounted in app.ts only when
 * both a ComputerGateway and its PolicyStore are present, via
 * createComputerRoutes (server/src/computer/routes.ts). Every acting route in
 * that router passes through a policy decision and an audit row before reaching
 * the computer — that seam is the governance, so any other route that drives a
 * browser/computer is an ungoverned duplicate by definition.
 *
 * DB-free by design: pure route-table introspection (`app.routes`), no
 * requests, no stores that touch Postgres. The policy store below is the
 * memory-only shape (no database argument), and the gateway is an uncalled
 * stub — nothing here acts, so nothing needs Docker.
 */

// Paths that match this but are not served through the gateway fail the test.
const UNGOVERNED_PATTERN = /computer|browser/i;

// The one governed mount. Every acting route under it goes through the gateway
// (policy decision + audit row) in server/src/computer/routes.ts.
const GOVERNED_PREFIXES = ["/api/computers"];

// Explicit allowlist for mounted computer/browser paths that are deliberately
// NOT gateway actions (none today). Add an exact path here with a comment
// explaining why it drives no browser/desktop action — never to grandfather a
// raw control route.
const ALLOWLIST: string[] = [
  // Admin lifecycle stops, not browser control: both call provider.stop() via
  // enterprise controls and write an audit row; neither clicks, types,
  // navigates, reads, or screenshots, so there is no action for the gateway
  // policy to decide. Matched only because "computers" is in the path.
  "POST /api/admin/enterprise/people/:userId/terminate-computers",
  "POST /api/admin/enterprise/computers/terminate-inactive",
];

function routePaths(app: ReturnType<typeof createApp>): string[] {
  return app.routes.map((route) => `${route.method} ${route.path}`);
}

function ungoverned(paths: string[]): string[] {
  return paths.filter(
    (entry) =>
      UNGOVERNED_PATTERN.test(entry) &&
      !GOVERNED_PREFIXES.some((prefix) => entry.includes(` ${prefix}/`)) &&
      !GOVERNED_PREFIXES.some((entry2) => entry === entry2) &&
      !ALLOWLIST.includes(entry),
  );
}

function assertGoverned(app: ReturnType<typeof createApp>) {
  const offending = ungoverned(routePaths(app));
  if (offending.length > 0) {
    throw new Error(
      `Ungoverned browser/computer control route(s) mounted: ${offending.join(", ")}. ` +
        `Every browser/desktop action must go through the gateway at ${GOVERNED_PREFIXES.join(", ")} ` +
        `(createComputerRoutes); delete raw control routes, never alias them.`,
    );
  }
}

describe("computer route governance", () => {
  test("mounts no ungoverned browser/computer control routes", () => {
    // Lightweight construction, following health.test.ts: config only, no
    // stores, so no database is needed.
    const app = createApp(loadConfig(testEnvironment()));
    assertGoverned(app);
  });

  test("the gateway mount itself counts as governed, not as a violation", () => {
    const gateway = {} as unknown as ComputerGateway;
    const policy = createPolicyStore(DEFAULT_ACTION_POLICY);
    const app = createApp(
      loadConfig(testEnvironment()),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      gateway,
      policy,
    );
    const paths = routePaths(app);
    // Guards against a vacuous pass: the governed app must actually mount
    // computer routes, and all of them must satisfy the same predicate.
    expect(paths.some((entry) => entry.includes(" /api/computers"))).toBe(true);
    assertGoverned(app);
  });
});
