/**
 * The golden signals an operator needs to see this deployment's HTTP load, exposed at `/metrics` in
 * hand-rolled Prometheus text format — no dependency, no library, one string.
 *
 * A counter for every request (`http_requests_total`, by method, route template and status) and a
 * histogram for how long they take (`http_request_duration_seconds`). Scraping is allowed from the
 * deployment's own network (a loopback host on the request) or with a bearer secret
 * (`ORBO_METRICS_TOKEN`), and never by an unauthenticated caller from elsewhere, which is the same
 * stance the worker boundary takes: these numbers are a fact about deployments, not about persons,
 * but the endpoint answers anyone who can reach the port.
 */
import type { Context, MiddlewareHandler } from "hono";
import { sameToken } from "../agents/callback-token";

/** Duration buckets of the request histogram, in milliseconds. Rendered in seconds. */
const DURATION_BUCKETS_MS = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

export type MetricsRegistry = {
  /** One request answered: template route when known, else the concrete path. */
  recordRequest(input: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
  }): void;
  /** The full endpoint answer, exposition format including the `# HELP`/`# TYPE` lines. */
  render: () => string;
};

/** Prometheus label values escape backslash, quote and newline. Labels here are bounded already. */
function label(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", " ");
}

export function createMetricsRegistry(): MetricsRegistry {
  const requests = new Map<
    string,
    { method: string; route: string; status: number; count: number }
  >();
  /** Non-cumulative per-bucket counts, keyed by the bucket; rendered cumulatively. */
  const durations = new Map<number, number>();
  let durationCount = 0;
  let durationSumMs = 0;

  return {
    recordRequest({ method, route, status, durationMs }) {
      const key = `${method}\n${route}\n${status}`;
      const counter = requests.get(key);
      if (counter) counter.count += 1;
      else requests.set(key, { method, route, status, count: 1 });

      durationCount += 1;
      durationSumMs += durationMs;
      // Buckets are rendered cumulatively, so the observation goes into the smallest one that fits
      // and only that one.
      const fitting = DURATION_BUCKETS_MS.find(
        (bucket) => durationMs <= bucket,
      );
      if (fitting !== undefined) {
        durations.set(fitting, (durations.get(fitting) ?? 0) + 1);
      }
    },
    render() {
      const lines = [
        "# HELP http_requests_total Total HTTP requests the ORBO server answered.",
        "# TYPE http_requests_total counter",
      ];
      for (const { method, route, status, count } of [
        ...requests.values(),
      ].sort((a, b) =>
        `${a.route}\n${a.method}\n${a.status}`.localeCompare(
          `${b.route}\n${b.method}\n${b.status}`,
        ),
      )) {
        lines.push(
          `http_requests_total{method="${label(method)}",route="${label(route)}",status="${status}"} ${count}`,
        );
      }
      lines.push(
        "# HELP http_request_duration_seconds How long answering took, in seconds.",
        "# TYPE http_request_duration_seconds histogram",
      );
      let cumulative = 0;
      for (const bucket of DURATION_BUCKETS_MS) {
        cumulative += durations.get(bucket) ?? 0;
        lines.push(
          `http_request_duration_seconds_bucket{le="${bucket / 1_000}"} ${cumulative}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`,
        `http_request_duration_seconds_sum ${(durationSumMs / 1_000).toFixed(6)}`,
        `http_request_duration_seconds_count ${durationCount}`,
        "",
      );
      return lines.join("\n");
    },
  };
}

/**
 * Whether this request may read the numbers. Loopback only — the deployment asking about itself —
 * unless `ORBO_METRICS_TOKEN` was set, in which case that bearer is accepted from anywhere too. An
 * unset token means no keys: a remote caller is refused, not trusted.
 */
function mayReadMetrics(
  context: Context,
  options: { env?: Record<string, string | undefined> } = {},
): boolean {
  const env = options.env ?? process.env;
  try {
    const hostname = new URL(context.req.url).hostname;
    const loopback =
      hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
    if (loopback) return true;
  } catch {
    return false;
  }
  const expected = env.ORBO_METRICS_TOKEN?.trim();
  if (!expected) return false;
  const offered = context.req.header("authorization");
  return (
    typeof offered === "string" && sameToken(offered, `Bearer ${expected}`)
  );
}

export const METRICS_ROUTE = "/metrics";

export function createMetricsRoute(
  metrics: MetricsRegistry,
  options: { env?: Record<string, string | undefined> } = {},
): MiddlewareHandler {
  return async (context) => {
    if (!mayReadMetrics(context, options)) {
      return context.json({ error: "Not allowed to read the metrics." }, 403);
    }
    return new Response(metrics.render(), {
      status: 200,
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  };
}
