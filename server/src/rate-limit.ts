/**
 * A ceiling on how fast one caller may ask this deployment for things, and the floor under every
 * route that has no ceiling of its own.
 *
 * WHY THERE IS ONE AT ALL. A signed-in person (or a curl with no person behind it at all) could
 * previously ask the API for as much as the machine could answer. Every handler is cheap until it
 * is not: the transcript reads, the audit queries, the people list — each is one query, and a
 * client that pipelines ten thousand of them holds the database pool and the event loop for as long
 * as it keeps asking. The per-route body limits and the auth guards decide WHAT a request may
 * carry; nothing decided HOW MANY. This is that number.
 *
 * Fixed-window, in memory, one process. That is a deliberate smallness: it needs no store and no
 * coordination, which is what keeps it true on the laptop where the deployment is one process on
 * loopback. A cluster of replicas each keeps its own count, so the real ceiling is this number
 * times the replica count — coarse, but the ceiling this replaces was infinity, and a deployment
 * large enough to care about the difference is large enough to put a real limiter at its ingress.
 *
 * WHO THE BUCKET IS NAMED AFTER. One bucket per client address, read off `X-Forwarded-For` first
 * and `X-Real-IP` second, because every deployment that runs behind a proxy — the chart's ingress,
 * a home server in front of nginx — would otherwise be one bucket shared by every visitor, and a
 * limit shared by everybody is a self-inflicted outage. The first hop is used, not the last, for
 * the same reason. The trust question this cannot answer: a client that arrives DIRECTLY can write
 * either header itself and spread its requests across as many buckets as it cares to invent. A
 * deployment exposed without a proxy should set the ceiling with that in mind — the variable exists
 * (`ORBO_RATE_LIMIT_MAX`) — and nothing stronger is available to a middleware that never sees the
 * socket. No header at all is the direct, unproxied case, and everything lands in one loopback
 * bucket, which is correct for the laptop this default is sized for.
 */
import type { Context, MiddlewareHandler } from "hono";

export type RateLimitSettings = {
  /** Requests one identity may make across the API in one window. */
  max: number;
  /** How long a window stays open, in milliseconds. */
  windowMs: number;
  /** The tighter ceiling for the routes where somebody may be guessing. */
  authMax: number;
};

/** The two buckets a request can fall into, named for what makes their ceilings differ. */
type Scope = "api" | "auth";

/**
 * When the map has grown to this many entries, expired ones are dropped on the spot.
 *
 * The number is not a tune. Each entry is a caller seen within the last window, so a map this full
 * means this many distinct identities inside a minute, which on any deployment that is not under
 * attack is a size the map never reaches. An attacker who reaches it has already paid for the
 * sweep, which is the point: the cost of their requests stays theirs.
 */
const SWEEP_AT = 4_096;

/**
 * The routes that answer to a bearer secret rather than a person, and are therefore not counted.
 *
 * `/health` and `/metrics` are a monitor's traffic, scraped every few seconds forever; counting
 * them would eventually 429 the one client whose silence means the deployment is down.
 *
 * `/api/agent-tools/call` is how the shipped Bots spend the deployment-owned tools: one call per
 * tool use, from every container on the compose network, which on Docker Desktop all arrive from
 * the same host-gateway address. Counting them would put a busy Bot loop's tool calls in the same
 * bucket as the browser's and cut off real work mid-run. The route refuses anything without the
 * token before it does anything expensive, so an unauthenticated flood there costs a string
 * comparison either way — the limit would add nothing and the ceiling would take real work away.
 */
const UNCOUNTED = new Set(["/health", "/metrics", "/api/agent-tools/call"]);

/** The identity a request is counted under, and the header that decided it. */
function identityOf(context: Context): string {
  const forwarded = context.req.header("x-forwarded-for");
  if (forwarded) {
    // The first entry is the client as the nearest proxy saw it; the rest are the proxies.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return context.req.header("x-real-ip")?.trim() || "local";
}

export function createRateLimit(
  settings: RateLimitSettings,
): MiddlewareHandler {
  /*
   * Every counter this limiter is holding, keyed `scope\0identity`.
   *
   * One map rather than one per scope, so the sweep has one thing to walk. Living in the factory
   * rather than at module scope, because the state is the app's, not the process's: the tests build
   * many apps in one process, and a module-level map would make one test's traffic argue with
   * another's. In production the two are the same thing — the server builds the app once.
   *
   * Entries are written on every request and removed lazily, so the map is as large as the distinct
   * callers of the last window — bounded in practice, and swept hard when it is not.
   */
  const counters = new Map<string, { windowStart: number; count: number }>();

  return async (context, next) => {
    const path = new URL(context.req.url).pathname;
    if (UNCOUNTED.has(path)) return next();

    /*
     * The sign-in routes are where a request can be worth more than the work it costs: each one is
     * an attempt at somebody's account. Their ceiling is the tighter one, and it is decided by the
     * path alone rather than by which verb the SPA happens to use today — a route family, so a
     * client cannot step around the smaller number by finding a sibling spelling.
     */
    const scope: Scope = path.startsWith("/api/auth/") ? "auth" : "api";
    const max = scope === "auth" ? settings.authMax : settings.max;

    const now = Date.now();
    if (counters.size >= SWEEP_AT) {
      for (const [key, bucket] of counters) {
        if (now - bucket.windowStart >= settings.windowMs) counters.delete(key);
      }
    }

    const key = `${scope}\0${identityOf(context)}`;
    const bucket = counters.get(key);
    if (!bucket || now - bucket.windowStart >= settings.windowMs) {
      counters.set(key, { windowStart: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count <= max) return next();

    /*
     * The seconds until the window turns over, so a well-behaved client can back off rather than
     * poll the ceiling. Rounded up, because a Retry-After of 0 says "go now", which is the opposite
     * of what is being said.
     */
    const retryAfter = Math.ceil(
      (bucket.windowStart + settings.windowMs - now) / 1_000,
    );
    return context.json(
      { error: "Too many requests. Slow down and try again shortly." },
      429,
      { "retry-after": String(Math.max(retryAfter, 1)) },
    );
  };
}
