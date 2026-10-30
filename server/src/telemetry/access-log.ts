/**
 * One JSON line per request on the server log: the golden signal of what came in, which it was for,
 * what it cost, and who it served.
 *
 * Mounted ahead of the route registrations, it runs after the handler answered, so it reads the
 * status off the final response and the matched route template off `req.routePath`. The person is
 * whoever `createRequireUser` already put in context — no second auth check, and nothing recorded
 * when none was resolved. `/health` and `/metrics` record at debug only: monitors scrape them every
 * few seconds and they would be all the log ever said.
 *
 * Enabled by default at info. `ORBO_ACCESS_LOG=off` silences the lines entirely;
 * `ORBO_ACCESS_LOG=debug` adds the quiet routes back. Metrics are recorded in either case: the flag
 * governs the log line, not the numbers.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { MetricsRegistry } from "./metrics";

/** Routes recorded at debug only, so the log is not hammering-period over hammering-period. */
const QUIET_ROUTES = new Set(["/health", "/metrics"]);

export function accessLogLevel(
  env: Record<string, string | undefined> = process.env,
): "off" | "debug" | "info" {
  const value = env.ORBO_ACCESS_LOG?.trim().toLowerCase();
  if (value === "off") return "off";
  if (value === "debug") return "debug";
  return "info";
}

type AccessOptions = {
  metrics: MetricsRegistry;
  env?: Record<string, string | undefined>;
};

export function createAccessLog(options: AccessOptions): MiddlewareHandler {
  return async (context, next) => {
    const startedAt = performance.now();
    try {
      await next();
    } catch (error) {
      // The result Hono will answer by itself; record it as the failure it already is.
      emit(context, startedAt, 500, options);
      throw error;
    }
    emit(context, startedAt, context.res?.status ?? 0, options);
  };
}

function emit(
  context: Context,
  startedAt: number,
  status: number,
  options: AccessOptions,
) {
  let route = new URL(context.req.url).pathname;
  // The template the request matched ("/api/things/:id"), known once routing has happened. A
  // request answered outside this app's routing may have no match recorded; the concrete path is a
  // fine label for those.
  try {
    route = context.req.routePath || route;
  } catch {
    // Keep the path.
  }
  options.metrics.recordRequest({
    method: context.req.method,
    route,
    status,
    durationMs: Math.round(performance.now() - startedAt),
  });

  const level = accessLogLevel(options.env);
  if (level === "off") return;
  if (level === "info" && QUIET_ROUTES.has(route)) return;

  // Whoever requireUser resolved for this request, read back afterwards — no second auth check.
  const actor = context.get("actor") as { id?: string } | undefined;
  console.info(
    JSON.stringify({
      type: "http-access",
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      route,
      status,
      durationMs: Math.round(performance.now() - startedAt),
      ...(actor?.id ? { userId: actor.id } : {}),
    }),
  );
}
