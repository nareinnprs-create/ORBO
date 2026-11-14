import { describe, expect, test } from "bun:test";
import { Hono, type MiddlewareHandler } from "hono";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createRateLimit } from "../src/rate-limit";
import { testEnvironment } from "./support/environment";

/**
 * The API's speed limit, tested as what it is for: a client that asks too fast is refused before
 * its questions cost anything, and everybody else is never slowed down enough to notice.
 *
 * The buckets are keyed on `X-Forwarded-For` (the deployment behind a proxy) and fall back to one
 * shared identity when no header names a client (the laptop), so both shapes are driven here.
 * Time is not mocked: the windows in these tests are the deployment's own configured ones, and
 * every test builds its own app so no two tests share counters.
 */

const auth = {
  handler: () => new Response(null, { status: 204 }),
  api: {
    getSession: async () => null,
  },
};

function appWithLimits(
  overrides: Record<string, string | undefined>,
  options: { authorization?: string } = {},
) {
  const config = loadConfig(testEnvironment(overrides));
  const app = createApp(config, auth, { rolesForUser: async () => [] });
  const headers = options.authorization
    ? { authorization: options.authorization }
    : undefined;
  return {
    app,
    get: (path: string, init?: RequestInit) =>
      app.request(`http://orbo.local${path}`, {
        ...init,
        headers: { ...headers, ...init?.headers },
      }),
  };
}

describe("the api speed limit", () => {
  test("a caller at the ceiling is refused, with how long to wait", async () => {
    const { get } = appWithLimits({
      ORBO_RATE_LIMIT_MAX: "3",
      // Wide enough that none of these requests straddles a window boundary and resets the count.
      ORBO_RATE_LIMIT_WINDOW: "1h",
    });

    expect((await get("/api/capabilities")).status).toBe(200);
    expect((await get("/api/capabilities")).status).toBe(200);
    expect((await get("/api/capabilities")).status).toBe(200);

    const fourth = await get("/api/capabilities");
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({
      error: "Too many requests. Slow down and try again shortly.",
    });
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("a different caller is not refused for the first one's traffic", async () => {
    const { get } = appWithLimits({
      ORBO_RATE_LIMIT_MAX: "2",
      ORBO_RATE_LIMIT_WINDOW: "1h",
    });

    // The buckets are per client address, so a proxy naming two different clients gets two
    // budgets. This is the deployment-behind-an-ingress shape.
    expect(
      (
        await get("/api/capabilities", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await get("/api/capabilities", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await get("/api/capabilities", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await get("/api/capabilities", {
          headers: { "x-forwarded-for": "203.0.113.8" },
        })
      ).status,
    ).toBe(200);
  });

  test("the headerless caller shares one bucket, and the window eventually opens again", async () => {
    // The laptop shape: no proxy, no header, one identity. The window here is the minimum the
    // configuration accepts, so the test proves recycling without waiting on anything real.
    const { get } = appWithLimits({
      ORBO_RATE_LIMIT_MAX: "1",
      ORBO_RATE_LIMIT_WINDOW: "1s",
    });

    expect((await get("/api/capabilities")).status).toBe(200);
    expect((await get("/api/capabilities")).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await get("/api/capabilities")).status).toBe(200);
  });

  test("the sign-in routes are tightened harder than the rest", async () => {
    const { get } = appWithLimits({
      ORBO_RATE_LIMIT_MAX: "300",
      ORBO_RATE_LIMIT_AUTH_MAX: "2",
      ORBO_RATE_LIMIT_WINDOW: "1h",
    });

    // Two sign-in attempts are a person mistyping; the third within the window is a script, and
    // the general ceiling nowhere near reached would have let it keep guessing. The stub auth
    // handler answers 204 to everything it is handed, which is what a non-refused attempt reads
    // as here.
    await get("/api/auth/get-session");
    expect((await get("/api/auth/get-session")).status).toBe(204);
    expect((await get("/api/auth/get-session")).status).toBe(429);
    // While the API around it, on the same caller, has its whole budget still.
    expect((await get("/api/capabilities")).status).toBe(200);
  });

  test("the routes that answer to their own bearer are not counted", async () => {
    const { get } = appWithLimits(
      { ORBO_RATE_LIMIT_MAX: "1", ORBO_RATE_LIMIT_WINDOW: "1h" },
      // The token is checked downstream; reaching the route at all is what proves the limiter
      // let it through. `/api/agent-tools/call` without one is refused by the route, but the
      // refusal itself is the assertion here: a 401 is not a 429.
      { authorization: "Bearer whatever" },
    );

    expect((await get("/api/capabilities")).status).toBe(200);
    // The one uncounted path, asked as fast as the test can ask it.
    for (let i = 0; i < 5; i += 1) {
      const response = await get("/api/agent-tools/call", { method: "POST" });
      expect(response.status).not.toBe(429);
    }
  });

  test("a refusal is still answered, so an empty body is not the failure mode", async () => {
    // The limiter runs before the routes; the point of this mount is that its answer is shaped
    // like the rest of the API's, and that the security headers reached it through the same
    // chain.
    const { get } = appWithLimits({
      ORBO_RATE_LIMIT_MAX: "1",
      ORBO_RATE_LIMIT_WINDOW: "1h",
    });

    await get("/api/capabilities");
    const refused = await get("/api/capabilities");
    expect(refused.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("the limiter is not mounted when the deployment switched it off", async () => {
    const { get } = appWithLimits({ ORBO_RATE_LIMIT: "off" });

    for (let i = 0; i < 5; i += 1) {
      expect((await get("/api/capabilities")).status).toBe(200);
    }
  });
});

/**
 * The limiter on its own, for the cases the app cannot reach without mocking time.
 *
 * The middleware is a closure over its settings and its counters, so one instance mounted on a
 * one-route app is the same thing the server mounts, driven faster than a real window.
 */
describe("the window arithmetic", () => {
  function drive(limit: MiddlewareHandler, forwardedFor?: string) {
    const app = new Hono();
    app.use("*", limit);
    app.get("*", (context) => context.text("ok"));
    return (path = "/x") =>
      app.request(`http://orbo.local${path}`, {
        headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      });
  }

  test("the count restarts when the window turns over", async () => {
    const ask = drive(createRateLimit({ max: 1, windowMs: 50, authMax: 1 }));
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await ask()).status).toBe(200);
  });
});
