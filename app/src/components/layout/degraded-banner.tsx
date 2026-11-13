import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { appConfig } from "@/lib/generated/application-config";
import { healthQueryOptions } from "@/lib/health/queries";

const DEPENDENCY_NAMES = {
  database: "the database",
  intelligence: "the model runtime",
} as const;

/**
 * A sentence at the top of the signed-in app when the deployment is degraded.
 *
 * Bots answer through the database and the Intelligence runtime; when either is down, every surface
 * here quietly fails at once and each of them would otherwise say so in its own words. This banner
 * says it once, from `/health` — the one endpoint that names the dependency — and anything on
 * screen that fails while it is up is explained by it.
 *
 * Dismissal is deliberately per-visit state, not a persisted preference: the person who closed it
 * signed out or closed the tab, and a dependency that is still broken after that deserves to be
 * announced again. While the fetch is in flight or has failed (a whole server that is down makes
 * this query fail too) it renders nothing — the surfaces' own error states are already saying it.
 */
export function DegradedBanner() {
  const health = useQuery(healthQueryOptions());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !health.data || health.data.ok) {
    return null;
  }

  const names = health.data.degraded
    .map((dependency) => DEPENDENCY_NAMES[dependency.name])
    .join(" and ");
  const errors = health.data.degraded
    .map((dependency) => dependency.error)
    .filter(Boolean)
    .join(" ");

  return (
    /*
     * Fixed rather than in-flow: every shell here (the app's one-viewport pane, PageShell's
     * scroller) scrolls inside itself, so there is no single ancestor both to sit the banner in and
     * to push down. Overlapping the top of the pane for as long as the banner is up is the honest
     * cost, and the close button is the way out.
     */
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-100 py-2 text-amber-950 dark:bg-amber-950/90 dark:text-amber-100"
      role="alert"
    >
      <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      <p className="text-pretty text-center text-xs">
        {names.charAt(0).toUpperCase() + names.slice(1)}{" "}
        {health.data.degraded.length === 1 ? "is" : "are"} not answering, so
        parts of {appConfig.brand.productName} may not work right now.
        {errors ? ` (${errors})` : ""}
      </p>
      <button
        aria-label="Dismiss the degraded-service notice"
        className="rounded p-1 transition-colors hover:bg-amber-950/10 dark:hover:bg-amber-100/10"
        onClick={() => setDismissed(true)}
        type="button"
      >
        <IconX aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
