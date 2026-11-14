import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { testEnvironment } from "./support/environment";

/**
 * The headers every answer carries, tested as the security surface they are.
 *
 * A header middleware is only interesting at its boundaries: the responses a handler planned and
 * the refusals nothing planned for. Both come through the same mount here, which is the property
 * being pinned — a lock that only reaches the happy path is not a lock.
 */

const config = loadConfig(testEnvironment());

const auth = {
  handler: () => new Response(null, { status: 204 }),
  api: {
    getSession: async () => null,
  },
};

describe("the headers every answer carries", () => {
  test("a browser-facing refusal is marked as nothing else to be", async () => {
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    // A 401, not a handler anyone styled: the interesting case is the response nobody planned.
    const response = await app.request("http://orbo.local/api/me");

    expect(response.status).toBe(401);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  test("an api answer may never be framed, in both spellings", async () => {
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    const response = await app.request("http://orbo.local/api/capabilities");

    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'",
    );
  });

  test("the api answers also carry the common floor", async () => {
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    const response = await app.request("http://orbo.local/api/capabilities");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  test("the app's pages report against the document policy without being bound by it", async () => {
    // The SPA is served when the deployment was given a built app. Stand-ins are how the other
    // tests reach /api; this one needs the real shape, so it mounts a directory of one.
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "orbo-headers-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "index.html"),
        `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`,
      );
      const app = createApp(
        loadConfig(testEnvironment({ APP_DIST_DIR: dir })),
        auth,
        { rolesForUser: async () => [] },
      );

      const response = await app.request("http://orbo.local/");

      expect(response.headers.get("content-type")).toContain("text/html");
      // Report-only, not enforcing: the enforcing document policy has two known debts — the
      // inline theme bootstrap and the sandboxed interface frames that would inherit the policy —
      // and switching it on before both are solved would break the app. See security-headers.ts.
      expect(
        response.headers.get("content-security-policy-report-only"),
      ).toContain("default-src 'self'");
      expect(response.headers.get("content-security-policy")).toBeNull();
      // And nothing legitimately frames the app.
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    } finally {
      await import("node:fs").then((fs) =>
        fs.rmSync(dir, { recursive: true, force: true }),
      );
    }
  });

  test("a static answer is not treated as a document", async () => {
    // The document policy is signal for pages; a stylesheet or a bundle carrying one is noise. The
    // index route above already pins the HTML case; this pins the other half of the split.
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    const response = await app.request("http://orbo.local/api/capabilities");

    expect(response.headers.get("content-security-policy-report-only")).toBe(
      null,
    );
  });
});
