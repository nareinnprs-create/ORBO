import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { Database } from "../src/db/client";
import { testEnvironment } from "./support/environment";

/**
 * A stand-in Intelligence, for the tests that need /health to answer healthy.
 *
 * The probe is reachability, so any answer will do; nothing here reads the request's
 * credentials beyond recording that they arrived, which is one of the assertions.
 */
function intelligenceStub() {
  const seen: { authorization: string | null; paths: string[] } = {
    authorization: null,
    paths: [],
  };
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      seen.authorization = request.headers.get("authorization");
      seen.paths.push(new URL(request.url).pathname);
      return new Response("ok", { status: 200 });
    },
  });
  return {
    seen,
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}

const app = createApp(
  loadConfig({
    ...testEnvironment(),
  }),
);

describe("health endpoint", () => {
  test("reports a reachable database and Intelligence as healthy with the measure of the pings", async () => {
    // createApp takes positional stores; healthDatabase is the last parameter (36th). Build the
    // argument list by index so a future appended store cannot silently shift it.
    const intelligence = intelligenceStub();
    try {
      const args: unknown[] = Array.from({ length: 36 });
      args[0] = loadConfig(
        testEnvironment({ INTELLIGENCE_API_URL: intelligence.url }),
      );
      args[35] = { execute: async () => [] } as unknown as Database;
      const healthy = createApp(...(args as never[]));

      const response = await healthy.request("http://orbo.local/health");

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.db).toBe("ok");
      expect(body.intelligence).toBe("ok");
      expect(typeof body.latencyMs).toBe("number");
      // The probe presented the deployment's key, on the deployment's address, and read nothing.
      expect(intelligence.seen.authorization).toBe("Bearer tenant-api-key");
      expect(intelligence.seen.paths).toEqual(["/"]);
    } finally {
      intelligence.stop();
    }
  });

  test("answers degraded, without leaking the address, when the database cannot be reached", async () => {
    const intelligence = intelligenceStub();
    try {
      const degraded = createApp(
        loadConfig({
          ...testEnvironment({
            DATABASE_URL: "postgres://orbos-password@127.0.0.1:1/orbo",
            INTELLIGENCE_API_URL: intelligence.url,
          }),
        }),
      );

      const response = await degraded.request("http://orbo.local/health");

      expect(response.status).toBe(503);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(String(body.db)).toMatch(/^degraded: /);
      expect(String(body.db)).not.toContain("orbos-password");
      expect(String(body.db)).not.toContain("postgres://");
      // Intelligence answered fine the whole time; the two degradations never blur.
      expect(body.intelligence).toBe("ok");
      expect(typeof body.latencyMs).toBe("number");
    } finally {
      intelligence.stop();
    }
  });

  test("answers degraded under its own name when Intelligence cannot be reached", async () => {
    // A closed port: the one way to make the probe fail without a stub that lies.
    const dead = intelligenceStub();
    const deadUrl = dead.url;
    dead.stop();
    // The database is stubbed healthy, so the only degradation in play is Intelligence's.
    const args: unknown[] = Array.from({ length: 36 });
    args[0] = loadConfig(
      testEnvironment({
        INTELLIGENCE_API_URL: deadUrl,
        INTELLIGENCE_API_KEY: "a-very-secret-intelligence-key",
      }),
    );
    args[35] = { execute: async () => [] } as unknown as Database;
    const degraded = createApp(...(args as never[]));

    const response = await degraded.request("http://orbo.local/health");

    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    // Its own field, under its own name — a reader can tell which dependency fell.
    expect(String(body.intelligence)).toMatch(/^degraded: /);
    expect(String(body.intelligence)).not.toContain(deadUrl);
    expect(String(body.intelligence)).not.toContain(
      "a-very-secret-intelligence-key",
    );
    expect(String(body.intelligence)).not.toContain("localhost");
    // The database was never the problem.
    expect(body.db).toBe("ok");
  });

  test("answers degraded, naming the failure, and keeps the deployment answering", async () => {
    const intelligence = intelligenceStub();
    try {
      const args: unknown[] = Array.from({ length: 36 });
      args[0] = loadConfig(
        testEnvironment({ INTELLIGENCE_API_URL: intelligence.url }),
      );
      args[35] = {
        execute: async () => {
          throw new Error("The connection was refused.");
        },
      } as unknown as Database;
      const degraded = createApp(...(args as never[]));

      const response = await degraded.request("http://orbo.local/health");

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        status: "ok",
        db: "degraded: The connection was refused.",
        intelligence: "ok",
      });
    } finally {
      intelligence.stop();
    }
  });

  test("one cached answer short of a hammering, re-using it inside the TTL", async () => {
    const intelligence = intelligenceStub();
    try {
      const args: unknown[] = Array.from({ length: 36 });
      args[0] = loadConfig(
        testEnvironment({ INTELLIGENCE_API_URL: intelligence.url }),
      );
      args[35] = {
        execute: async () => [],
      } as unknown as Database;
      const healthy = createApp(...(args as never[]));

      await healthy.request("http://orbo.local/health");
      await healthy.request("http://orbo.local/health");

      // One database ping AND one Intelligence probe: the whole report is cached together.
      expect(intelligence.seen.paths).toHaveLength(1);
    } finally {
      intelligence.stop();
    }
  });
});

describe("runtime capabilities", () => {
  test("reports transcription without exposing its endpoint, model, or key", async () => {
    const configured = createApp(
      loadConfig(
        testEnvironment({
          TRANSCRIPTION_PROVIDER: "openai-compatible",
          TRANSCRIPTION_BASE_URL: "https://speech.private.example/v1",
          TRANSCRIPTION_MODEL: "private-speech-model",
          TRANSCRIPTION_API_KEY: "private-speech-key",
        }),
      ),
    );
    const response = await configured.request("/api/capabilities");
    const body = await response.text();
    expect(JSON.parse(body).transcription).toBe(true);
    expect(body).not.toContain("private");
  });
  test("reports the Intelligence runtime without exposing configuration secrets", async () => {
    const response = await app.request("http://orbo.local/api/capabilities");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: "intelligence",
      durableHistory: true,
      // Default-on. The browser reads this to decide whether to offer the tool that generates an
      // interface, so it has to be here and not only in the runtime.
      generativeUi: true,
      transcription: false,
      voice: false,
      // Names only. The sign-in screen reads this to know which buttons to draw.
      authProviders: ["google"],
      // A boolean, not a list: naming the registered providers would tell anybody who loads the
      // sign-in page which companies use this deployment.
      ssoConfigured: false,
      ssoRequired: false,
    });
  });

  // The runtime object holds the Intelligence API key and licence token. This endpoint has no
  // authentication, so a projection bug here publishes deployment secrets to anyone who asks.
  test("never serves the Intelligence credentials", async () => {
    const response = await app.request("http://orbo.local/api/capabilities");
    const body = await response.text();
    const parsed = (await new Response(body).json()) as Record<string, unknown>;

    expect(body).not.toContain("tenant-api-key");
    expect(body).not.toContain("license-token");
    // The settings object itself must not be projected, whatever it happens to hold today.
    expect(Object.keys(parsed)).toEqual([
      "mode",
      "durableHistory",
      "generativeUi",
      "transcription",
      "voice",
      "authProviders",
      "ssoConfigured",
      "ssoRequired",
    ]);
    // The provider list is names, never the clients and secrets behind them.
    expect(body).not.toContain("google-client-secret");
  });

  /*
   * The answer has to reach the browser, not just the runtime.
   *
   * The app offers the model the tool that generates an interface, and it decides whether to from
   * this field. The two halves disagreeing is the one configuration this capability must not be able
   * to end up in: runtime-only means the tool is never offered, browser-only means a Bot writes a
   * whole interface that nothing renders.
   */
  test("reports generated interfaces as off when the deployment opts out", async () => {
    const disabled = createApp(
      loadConfig(testEnvironment({ ORBO_GENERATIVE_UI: "false" })),
    );

    const response = await disabled.request(
      "http://orbo.local/api/capabilities",
    );

    expect(response.status).toBe(200);
    expect((await response.json()).generativeUi).toBe(false);
  });
});

describe("authentication availability", () => {
  test("fails loudly when no identity provider has been configured", async () => {
    const response = await app.request(
      "http://orbo.local/api/auth/sign-in/social",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "No identity provider is configured.",
    });
  });

  test("forwards auth requests to the configured Better Auth handler", async () => {
    const authenticatedApp = createApp(
      loadConfig({
        ...testEnvironment(),
      }),
      {
        handler: () => new Response("mounted", { status: 204 }),
      },
    );

    const response = await authenticatedApp.request(
      "http://orbo.local/api/auth/callback/google",
    );

    expect(response.status).toBe(204);
  });

  test("forwards logout requests to Better Auth", async () => {
    const authenticatedApp = createApp(
      loadConfig({
        ...testEnvironment(),
      }),
      {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => null,
        },
      },
    );

    const response = await authenticatedApp.request(
      "http://orbo.local/api/auth/sign-out",
      { method: "POST" },
    );

    expect(response.status).toBe(204);
  });
});

/**
 * Who may register an identity provider.
 *
 * Better Auth's SSO plugin guards these with a session, which asks only that somebody is signed in.
 * That is the wrong bar: registering an IdP for a domain means anybody it vouches for can sign in,
 * so a plain user reaching it could mint themselves colleagues. These pin the gate in front of it.
 */
describe("identity provider registration", () => {
  function appFor(roles: ("admin" | "user")[], signedIn = true) {
    let reachedHandler = false;
    const app = createApp(
      loadConfig(testEnvironment()),
      {
        handler: () => {
          reachedHandler = true;
          return new Response(null, { status: 200 });
        },
        api: {
          getSession: async () =>
            signedIn ? { user: { id: "u1", email: "u1@orbo.test" } } : null,
        },
      } as never,
      { rolesForUser: async () => roles },
    );
    return { app, reached: () => reachedHandler };
  }

  const routes = [
    "/api/auth/sso/register",
    "/api/auth/sso/update-provider",
    "/api/auth/sso/delete-provider",
  ];

  test.each(routes)("refuses %s to a plain user", async (route) => {
    const { app, reached } = appFor(["user"]);

    const response = await app.request(`http://orbo.test${route}`, {
      method: "POST",
    });

    expect(response.status).toBe(403);
    // Refused in front of Better Auth, not by it: the plugin would have allowed this.
    expect(reached()).toBe(false);
  });

  test.each(routes)("refuses %s to somebody signed out", async (route) => {
    const { app, reached } = appFor([], false);

    const response = await app.request(`http://orbo.test${route}`, {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(reached()).toBe(false);
  });

  test.each(routes)("lets an administrator through to %s", async (route) => {
    const { app, reached } = appFor(["admin"]);

    await app.request(`http://orbo.test${route}`, { method: "POST" });

    expect(reached()).toBe(true);
  });

  // Everything else under /api/auth is Better Auth's own business, including sign-in itself, which
  // by definition happens before anybody has a role.
  test("leaves the rest of the auth routes alone", async () => {
    const { app, reached } = appFor([], false);

    await app.request("http://orbo.test/api/auth/sign-in/social", {
      method: "POST",
    });

    expect(reached()).toBe(true);
  });
});
