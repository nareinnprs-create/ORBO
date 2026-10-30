import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";

/**
 * The tokens the install scripts mint when a deployment leaves the secrets blank, refused at boot.
 *
 * These three values are printed in this repository, so a deployment running on them is running on
 * passwords anybody can read — the same property that makes the example encryption key worth
 * refusing, and the gate here borrows that gate's exact shape: refused in production, refused
 * wherever the deployment answers beyond its own machine, and merely warned about on a loopback
 * laptop, where they are the convenience the install scripts intend.
 */

/** A real 32-byte vault key, so the example-key gate is not the refusal these tests are about. */
const REAL_KEY = Buffer.alloc(32, 1).toString("base64");

/** The minimum environment, plus the reachability of a real deployment, in one place. */
function deployed(overrides: Record<string, string | undefined>) {
  return {
    DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo",
    KEY_ENCRYPTION_KEY: REAL_KEY,
    // A real sign-in provider, so the gates under test are the only ones firing: a public URL
    // with no provider is refused by the single-user gate, which is a different audit item.
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    BETTER_AUTH_SECRET: "a-long-enough-local-development-auth-secret",
    BETTER_AUTH_URL: "http://localhost:3001",
    INITIAL_ADMIN_EMAILS: "admin@orbo.test",
    INTELLIGENCE_API_URL: "http://localhost:7100",
    INTELLIGENCE_GATEWAY_WS_URL: "ws://localhost:7103",
    INTELLIGENCE_API_KEY: "tenant-api-key",
    COPILOTKIT_LICENSE_TOKEN: "license-token",
    // A URL the public internet reaches: the "somebody else could arrive here" half of the gate,
    // without which every refusal below would have to wait for NODE_ENV.
    ORBO_PUBLIC_URL: "https://orbo.example.com",
    ...overrides,
  };
}

describe("the development tokens are refused where somebody else could be listening", () => {
  test("the computer token is refused in production", () => {
    expect(() =>
      loadConfig(
        deployed({
          NODE_ENV: "production",
          ORBO_AGENT_COMPUTER_URL: "http://127.0.0.1:4100",
          ORBO_COMPUTER_TOKEN: "orbo-dev-computer-token",
        }),
      ),
    ).toThrow(/orbo-dev-computer-token|development token/);
  });

  test("the supervisor token is refused when a supervisor is configured beyond loopback", () => {
    expect(() =>
      loadConfig(
        deployed({
          ORBO_COMPUTER_SUPERVISOR_URL: "http://supervisor:4300",
          SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
          ORBO_COMPUTER_TOKEN: "a-real-computer-token",
        }),
      ),
    ).toThrow(/orbo-dev-supervisor-token|development token/);
  });

  test("the worker secret is refused in production", () => {
    expect(() =>
      loadConfig(
        deployed({
          NODE_ENV: "production",
          WORKER_SHARED_SECRET: "orbo-dev-worker-shared-secret",
        }),
      ),
    ).toThrow(/orbo-dev-worker-shared-secret|development token/);
  });

  test("a token this deployment would not use is nobody's business", () => {
    // A stray SUPERVISOR_TOKEN with no supervisor configured authenticates nothing here. Refusing
    // it would punish an environment for carrying a variable it does not consume — and the
    // refusal below names the WORKER secret, proving the supervisor token passed the gate rather
    // than being declined for the same reason.
    expect(() =>
      loadConfig(
        deployed({
          SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
          WORKER_SHARED_SECRET: "orbo-dev-worker-shared-secret",
        }),
      ),
    ).toThrow(/WORKER_SHARED_SECRET/);
  });

  test("real values load under the same conditions", () => {
    const config = loadConfig(
      deployed({
        NODE_ENV: "production",
        ORBO_AGENT_COMPUTER_URL: "http://127.0.0.1:4100",
        ORBO_COMPUTER_TOKEN: "a-real-computer-token",
        WORKER_SHARED_SECRET: "a-real-worker-secret",
      }),
    );
    expect(config.computer?.token).toBe("a-real-computer-token");
  });
});

describe("the development tokens are only a warning on a loopback laptop", () => {
  /** Loopback-only, no sign-in provider: the install scripts' own shape. */
  const laptop = {
    DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo",
    KEY_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    INTELLIGENCE_API_URL: "http://localhost:7100",
    INTELLIGENCE_GATEWAY_WS_URL: "ws://localhost:7103",
    INTELLIGENCE_API_KEY: "tenant-api-key",
    COPILOTKIT_LICENSE_TOKEN: "license-token",
    ORBO_SINGLE_USER: "true",
  };

  test("a loopback deployment with the defaults still boots", () => {
    // The warnings are console noise by design; the assertion is that loadConfig returns rather
    // than throwing.
    const config = loadConfig({
      ...laptop,
      ORBO_AGENT_COMPUTER_URL: "http://127.0.0.1:4100",
      ORBO_COMPUTER_TOKEN: "orbo-dev-computer-token",
      SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
      WORKER_SHARED_SECRET: "orbo-dev-worker-shared-secret",
    });
    expect(config.computer?.token).toBe("orbo-dev-computer-token");
  });
});

describe("the rate limit settings", () => {
  const base = {
    DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo",
    KEY_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    INTELLIGENCE_API_URL: "http://localhost:7100",
    INTELLIGENCE_GATEWAY_WS_URL: "ws://localhost:7103",
    INTELLIGENCE_API_KEY: "tenant-api-key",
    COPILOTKIT_LICENSE_TOKEN: "license-token",
    ORBO_SINGLE_USER: "true",
  };

  test("default to three hundred a minute, thirty on the sign-in routes", () => {
    const config = loadConfig(base);
    expect(config.rateLimit).toEqual({
      max: 300,
      windowMs: 60_000,
      authMax: 30,
    });
  });

  test("a deployment's own numbers are read, and the window is a duration", () => {
    const config = loadConfig({
      ...base,
      ORBO_RATE_LIMIT_MAX: "120",
      ORBO_RATE_LIMIT_WINDOW: "30s",
      ORBO_RATE_LIMIT_AUTH_MAX: "10",
    });
    expect(config.rateLimit).toEqual({
      max: 120,
      windowMs: 30_000,
      authMax: 10,
    });
  });

  test("`off` means off, and a malformed number refuses to boot", () => {
    expect(loadConfig({ ...base, ORBO_RATE_LIMIT: "off" }).rateLimit).toBe(
      undefined,
    );
    expect(() => loadConfig({ ...base, ORBO_RATE_LIMIT_MAX: "3OO" })).toThrow(
      /ORBO_RATE_LIMIT_MAX/,
    );
    expect(() =>
      loadConfig({ ...base, ORBO_RATE_LIMIT_WINDOW: "100ms" }),
    ).toThrow(/ORBO_RATE_LIMIT_WINDOW/);
  });
});
