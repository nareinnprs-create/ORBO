import { queryOptions } from "@tanstack/react-query";
import { tryClient } from "@/lib/client";

/**
 * What `/health` says about the deployment's dependencies.
 *
 * The endpoint is the orchestrator's scrape, but the app reads it too: a Bot that cannot answer
 * because the database or the Intelligence runtime is down is a fact worth a sentence on screen,
 * and this is the one endpoint that names it. It answers anybody who can reach the port (no
 * session, no secrets — see server/src/telemetry/health.ts), so the app may read it before anybody
 * is signed in, and a degraded answer arrives as a 503 with the report still in the body.
 */
export type DegradedDependency = {
  /** The check that failed, named the way the banner says it. */
  name: "database" | "intelligence";
  /** The server's own reason, already redacted of addresses and keys by `describe`. */
  error?: string;
};

/** What the banner needs: is the deployment whole, and if not, which half is not. */
export type HealthSnapshot = {
  ok: boolean;
  degraded: DegradedDependency[];
};

export const healthKeys = {
  all: ["health"] as const,
  report: () => [...healthKeys.all, "report"] as const,
};

/**
 * One scrape, then nothing for a minute.
 *
 * `staleTime` rather than an interval is the whole budget: health.ts caches its own checks for a
 * few seconds and the route is answered from that cache, but a browser tab is one more scraper the
 * deployment did not ask for, so the app re-reads at most once a minute — often enough to raise a
 * banner within a minute of a dependency actually going away.
 */
export function healthQueryOptions() {
  return queryOptions({
    queryKey: healthKeys.report(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<HealthSnapshot> => {
      /*
       * `tryClient` rather than `client`: a 503 is the degraded answer itself, not a failed request
       * — the report is in the body and has to be read before `client` would throw it away.
       */
      const response = await tryClient("/health");
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        database?: { ok?: boolean; error?: string };
        intelligence?: { ok?: boolean; error?: string } | null;
      } | null;

      if (response.ok && body?.ok !== false) {
        return { ok: true, degraded: [] };
      }

      const degraded: DegradedDependency[] = [];
      if (body?.database?.ok === false) {
        degraded.push({
          name: "database",
          ...(body.database.error ? { error: body.database.error } : {}),
        });
      }
      if (body?.intelligence?.ok === false) {
        degraded.push({
          name: "intelligence",
          ...(body.intelligence.error
            ? { error: body.intelligence.error }
            : {}),
        });
      }
      // An answer this app cannot read still says not-ok; the banner stays generic then, because
      // inventing which dependency failed would be exactly the news a broken answer must not make.
      if (!degraded.length) {
        degraded.push({ name: "database" });
      }
      return { ok: false, degraded };
    },
  });
}
