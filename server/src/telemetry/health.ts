/**
 * `/health`: the little yes an orchestrator and an operator both read.
 *
 * `status: "ok"` says the process is up; `db` says the one thing the rest of this server cannot work
 * without says it works too; `intelligence` says the same of the model runtime every Bot answers
 * through. Degraded is not crashed: an unreachable dependency answers `"degraded: <reason>"` with a
 * 503 and the reason named, never a connection string or a credential — the health endpoint answers
 * anyone who can reach the port and must not be the one way secrets leak.
 *
 * Each check is a tiny request, racy against a short timeout, and both answers are cached in memory
 * for a few seconds together, so hammering this endpoint hammers nothing else. The database client
 * of the deployment's own database is shared where a caller has one; otherwise a dedicated
 * pooled-to-one connection is built lazily from the address, so a deployment with no database
 * answers degraded rather than dying at boot. The Intelligence probe is plain reachability: any HTTP
 * answer at all, even a refusal, proves the service is up, because whose keys are right is that
 * service's business and not a health answer's.
 */
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { createDatabase, type Database } from "../db/client";

/** One dependency's answer: did it answer inside the budget, and what it said when it did not. */
export type HealthState = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

/** The whole check: the database, the Intelligence runtime when one is probed, and the slowest. */
export type HealthReport = {
  database: HealthState;
  intelligence?: HealthState;
  ok: boolean;
  latencyMs: number;
};

export type HealthCheck = () => Promise<HealthReport>;

/** The Intelligence address and key, as the health check was given them. */
export type IntelligenceTarget = {
  url: string;
  apiKey: string;
};

export type HealthOptions = {
  /** A client of the deployment's database, when the caller already holds one. */
  database?: Database;
  /** The address to build a dedicated pooled-to-one client of our own from, when it does not. */
  databaseUrl?: string;
  /** The Intelligence deployment to probe for reachability, when there is one. */
  intelligence?: IntelligenceTarget;
  /** How long one ping may take before losing the race. Short, so scrapes are never held hostage. */
  timeoutMs?: number;
  /** How long one answer may be reused. Short enough to stay honest, long enough to stop hammering. */
  cacheMs?: number;
};

/**
 * The reason without the secrets: whatever error text carries the database address, the
 * Intelligence URL or the Intelligence key, rewritten out. A DNS failure's message is exactly the
 * kind of thing that names the host it could not reach, and this endpoint answers anyone.
 */
function describe(error: unknown, ...secrets: (string | undefined)[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "<redacted>");
  }
  return message;
}

/** One dependency, pinged racy against the scrape budget, with its failure named for the answer. */
async function ping(
  name: string,
  work: () => Promise<void>,
  timeoutMs: number,
): Promise<HealthState> {
  const startedAt = performance.now();
  try {
    await Promise.race([
      work(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`No answer from ${name} in ${timeoutMs}ms.`)),
          timeoutMs,
        ),
      ),
    ]);
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: describe(error),
    };
  }
}

export function createHealthCheck(options: HealthOptions): HealthCheck {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const cacheMs = options.cacheMs ?? 5_000;
  let cached: { at: number; report: HealthReport } | undefined;
  let client: Database | undefined = options.database;

  return async () => {
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.report;

    const database = await ping(
      "the database",
      async () => {
        if (!client) {
          if (!options.databaseUrl?.trim()) {
            throw new Error("No database is configured.");
          }
          client = createDatabase(options.databaseUrl, { max: 1 });
        }
        await client.execute(sql`select 1`);
      },
      timeoutMs,
    );

    // Same budget, cached beside the database's answer, its own reason on failure. The URL is the
    // address of the deployment's model runtime and the key is a credential; the probe presents the
    // key and reports neither, which is why its error goes back through `describe` with both
    // rewritten out after the ping, and why nothing of the response body is ever read.
    let intelligence: HealthState | undefined;
    if (options.intelligence) {
      const { url, apiKey } = options.intelligence;
      const probe = await ping(
        "Intelligence",
        async () => {
          const response = await fetch(url, {
            headers: { authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(timeoutMs),
          });
          // Reachability, not authorisation: the service answering at all — a 401 included — is
          // the thing a health probe asks.
          await response.body?.cancel();
        },
        timeoutMs,
      );
      intelligence = {
        ...probe,
        ...(probe.error
          ? {
              error: describe(
                probe.error,
                url,
                // A fetch failure's message often names the host without the scheme or the
                // port, so the address's host is rewritten out as well as the whole URL.
                new URL(url).host,
                url.replace(/^https?:\/\//, ""),
                apiKey,
              ),
            }
          : {}),
      };
    }

    const report: HealthReport = {
      database,
      ...(intelligence ? { intelligence } : {}),
      ok: database.ok && (intelligence?.ok ?? true),
      latencyMs: Math.max(
        database.latencyMs,
        intelligence?.latencyMs ?? database.latencyMs,
      ),
    };
    cached = { at: now, report };
    return report;
  };
}

export function createHealthRoute(options: HealthOptions): MiddlewareHandler {
  const check = createHealthCheck(options);
  return async (context) => {
    const report = await check();
    return context.json(
      {
        status: "ok",
        db: report.database.ok
          ? "ok"
          : `degraded: ${report.database.error ?? "The database could not be reached."}`,
        ...(report.intelligence
          ? {
              intelligence: report.intelligence.ok
                ? "ok"
                : `degraded: ${report.intelligence.error ?? "Intelligence did not answer."}`,
            }
          : {}),
        latencyMs: report.latencyMs,
      },
      report.ok ? 200 : 503,
    );
  };
}
