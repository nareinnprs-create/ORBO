import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { Database } from "../src/db/client";
import { testEnvironment } from "./support/environment";

/**
 * The metrics endpoint, and the log line beside it. Both come from the access middleware mounted in
 * createApp, so they are tested through one app built the way every other test here builds one:
 * config and fakes, no live database — the health route is injected the same way its client always
 * is, so no test here depends on what this machine's Postgres happens to be doing.
 */

const HEALTHY_DATABASE = {
  execute: async () => [],
} as unknown as Database;

// /health now probes Intelligence and answers 503 degraded when it cannot be reached, so the
// apps under test here need a live stand-in for the counters and quiet-route assertions.
function intelligenceStub() {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("ok", { status: 200 }),
  });
  return `http://localhost:${server.port}`;
}
const intelligenceUrl = intelligenceStub();

function appFor(options: { health?: Database } = {}) {
  // createApp takes positional stores; healthDatabase is the last parameter (36th). Build the
  // argument list by index so a future appended store cannot silently shift it.
  const args: unknown[] = Array.from({ length: 36 });
  args[0] = loadConfig(
    testEnvironment({ INTELLIGENCE_API_URL: intelligenceUrl }),
  );
  args[1] = {
    handler: () => new Response(null, { status: 204 }),
    api: {
      getSession: async () => ({
        user: { id: "admin", email: "admin@orbo.test" },
      }),
    },
  };
  args[2] = { rolesForUser: async () => ["admin"] };
  args[35] = options.health;
  return createApp(...(args as never[]));
}

function counterLine(
  body: string,
  route: string,
  status: string,
): string | undefined {
  return body
    .split("\n")
    .find(
      (line) =>
        line.startsWith("http_requests_total{") &&
        line.includes(`route="${route}"`) &&
        line.includes(`status="${status}"`),
    );
}

function counterValue(line: string | undefined): number {
  return Number(line?.split("} ")[1]);
}

function counterLabels(line: string): string[] {
  return [...line.matchAll(/(\w+="(?:[^"\\]|\\.)*")/g)].map(
    (match) => match[1],
  );
}

// The access log is written with console.info: hand back what was written with it swapped in.
async function withConsoleCaptured(
  run: (app: ReturnType<typeof appFor>) => Promise<void>,
): Promise<string[]> {
  const lines: string[] = [];
  const original = console.info;
  console.info = ((message: unknown) => {
    lines.push(String(message));
  }) as typeof console.info;
  try {
    await run(appFor({ health: HEALTHY_DATABASE }));
  } finally {
    console.info = original;
  }
  return lines;
}

describe("GET /metrics", () => {
  test("answers a loopback scrape with Prometheus exposition", async () => {
    const app = appFor({ health: HEALTHY_DATABASE });
    // Real counted traffic: one covered by the same counter from two hosts, one of them loopback.
    await app.request("http://127.0.0.1:3000/api/me");
    await app.request("http://orbo.test/api/me");

    const response = await app.request("http://127.0.0.1:3000/metrics");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
    const body = await response.text();

    expect(body).toContain("# HELP http_requests_total");
    expect(body).toContain("# TYPE http_requests_total counter");
    expect(body).toContain("# HELP http_request_duration_seconds");
    expect(body).toContain("# TYPE http_request_duration_seconds histogram");

    // The counted template route, in the exposition format, with its labels.
    const counted = counterLine(body, "/api/me", "200");
    expect(counted).toBeDefined();
    expect(counterLabels(counted!)).toContain('method="GET"');

    // The histogram is rendered every time, quiet deployment or not.
    expect(body).toContain('http_request_duration_seconds_bucket{le="0.05"}');
    expect(body).toContain('http_request_duration_seconds_bucket{le="10"}');
    expect(body).toContain('http_request_duration_seconds_bucket{le="+Inf"}');
    expect(body).toMatch(/http_request_duration_seconds_sum 0\.\d+/);
    expect(body).toMatch(/http_request_duration_seconds_count \d+/);

    // Counting, not snapshotting: one more request, one more in the counter.
    const before = counterValue(counterLine(body, "/api/me", "200"));
    await app.request("http://orbo.test/api/me");
    const after = await app.request("http://127.0.0.1:3000/metrics");
    const afterBody = await after.text();
    expect(counterValue(counterLine(afterBody, "/api/me", "200"))).toBe(
      before + 1,
    );
  });

  test("refuses a scrape that is neither loopback nor holding the secret", async () => {
    const app = appFor();
    const response = await app.request("http://orbo.test/metrics");
    expect(response.status).toBe(403);
  });

  describe("with ORBO_METRICS_TOKEN set", () => {
    beforeAll(() => {
      process.env.ORBO_METRICS_TOKEN = "a-metrics-secret";
    });
    afterAll(() => {
      delete process.env.ORBO_METRICS_TOKEN;
    });

    test("accepts the bearer from a non-loopback host, and only from someone holding it", async () => {
      const app = appFor();
      const allowed = await app.request("http://orbo.test/metrics", {
        headers: { authorization: "Bearer a-metrics-secret" },
      });
      expect(allowed.status).toBe(200);

      const wrong = await app.request("http://orbo.test/metrics", {
        headers: { authorization: "Bearer not-the-secret" },
      });
      expect(wrong.status).toBe(403);
    });
  });
});

describe("the access log line", () => {
  test("records the route template, status, duration and the signed-in person", async () => {
    const lines = await withConsoleCaptured(async (app) => {
      const response = await app.request("http://orbo.test/api/me");
      expect(response.status).toBe(200);
    });

    const written = lines
      .filter((line) => line.startsWith('{"type":"http-access"'))
      .map((line) => JSON.parse(line));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      method: "GET",
      path: "/api/me",
      route: "/api/me",
      status: 200,
      userId: "admin",
    });
    expect(typeof written[0].durationMs).toBe("number");
  });

  test("records the matched route template, not the concrete path", async () => {
    const lines = await withConsoleCaptured(async (app) => {
      await app.request("http://orbo.test/api/admin/people/visible-id/role", {
        method: "POST",
      });
    });

    const written = lines
      .filter((line) => line.startsWith('{"type":"http-access"'))
      .map((line) => JSON.parse(line));
    expect(written).toHaveLength(1);
    expect(written[0].path).toBe("/api/admin/people/visible-id/role");
    expect(written[0].route).toBe("/api/admin/people/:userId/role");
  });

  test("at info, the quiet routes are not written", async () => {
    const lines = await withConsoleCaptured(async (app) => {
      await app.request("http://orbo.test/health");
      const metrics = await app.request("http://127.0.0.1:3000/metrics");
      expect(metrics.status).toBe(200);
    });

    expect(lines).toEqual([]);
  });

  test("`ORBO_ACCESS_LOG=debug` writes the quiet routes too", async () => {
    const previous = process.env.ORBO_ACCESS_LOG;
    process.env.ORBO_ACCESS_LOG = "debug";
    try {
      const lines = await withConsoleCaptured(async (app) => {
        const health = await app.request("http://orbo.test/health");
        expect(health.status).toBe(200);
      });
      const written = lines
        .filter((line) => line.startsWith('{"type":"http-access"'))
        .map((line) => JSON.parse(line));
      expect(written).toHaveLength(1);
      expect(written[0].path).toBe("/health");
    } finally {
      if (previous === undefined) delete process.env.ORBO_ACCESS_LOG;
      else process.env.ORBO_ACCESS_LOG = previous;
    }
  });
});
