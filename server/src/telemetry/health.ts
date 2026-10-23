/**
 * `/health`: the little yes an orchestrator and an operator both read.
 *
 * `status: "ok"` says the process is up; `db` says the one thing the rest of this server cannot work
 * without says it works too. Degraded is not crashed: the database being unreachable answers
 * `"degraded: <reason>"` with a 503 and the reason named, never the connection string — the health
 * endpoint answers anyone who can reach the port and must not be the one way credentials leak.
 *
 * One tiny `SELECT 1`, racy against a short timeout, and cached in memory for a few seconds so
 * hammering this endpoint hammers nothing else. The client of the deployment's own database is
 * shared where a caller has one; otherwise a dedicated pooled-to-one connection is built lazily from
 * the address, so a deployment with no database answers degraded rather than dying at boot.
 */
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { createDatabase, type Database } from "../db/client";

export type HealthState = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type HealthCheck = () => Promise<HealthState>;

export type HealthOptions = {
  /** A client of the deployment's database, when the caller already holds one. */
  database?: Database;
  /** The address to build a dedicated pooled-to-one client of our own from, when it does not. */
  databaseUrl?: string;
  /** How long one ping may take before losing the race. Short, so scrapes are never held hostage. */
  timeoutMs?: number;
  /** How long one answer may be reused. Short enough to stay honest, long enough to stop hammering. */
  cacheMs?: number;
};

/** The reason without the address: whatever error text carries the `databaseUrl`, rewritten out. */
function describe(error: unknown, databaseUrl?: string): string {
  let message = error instanceof Error ? error.message : String(error);
  if (databaseUrl) message = message.replaceAll(databaseUrl, "<DATABASE_URL>");
  return message;
}

export function createHealthCheck(options: HealthOptions): HealthCheck {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const cacheMs = options.cacheMs ?? 5_000;
  let cached: { at: number; state: HealthState } | undefined;
  let client: Database | undefined = options.database;

  return async () => {
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.state;

    const startedAt = performance.now();
    try {
      if (!client) {
        if (!options.databaseUrl?.trim()) {
          throw new Error("No database is configured.");
        }
        client = createDatabase(options.databaseUrl, { max: 1 });
      }
      await Promise.race([
        client.execute(sql`select 1`),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`No answer from the database in ${timeoutMs}ms.`),
              ),
            timeoutMs,
          ),
        ),
      ]);
      cached = {
        at: now,
        state: {
          ok: true,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      };
    } catch (error) {
      cached = {
        at: now,
        state: {
          ok: false,
          latencyMs: Math.round(performance.now() - startedAt),
          error: describe(error, options.databaseUrl),
        },
      };
    }
    return cached.state;
  };
}

export function createHealthRoute(options: HealthOptions): MiddlewareHandler {
  const check = createHealthCheck(options);
  return async (context) => {
    const state = await check();
    return context.json(
      {
        status: "ok",
        db: state.ok
          ? "ok"
          : `degraded: ${state.error ?? "The database could not be reached."}`,
        latencyMs: state.latencyMs,
      },
      state.ok ? 200 : 503,
    );
  };
}
