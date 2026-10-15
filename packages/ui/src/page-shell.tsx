import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical PageShell. Export name, props (`action`/`description`/`title`/
 * `width: "prose" | "wide"`, `backButton`), and Tailwind scale mirror
 * app/src/components/layout/page-shell.tsx (`PageShell`) so a future port is
 * mechanical. `PageSection`/`PageRows`/`PageEmpty` live in their own modules
 * (`page-section.tsx`, `page-rows.tsx`, `page-empty.tsx`).
 *
 * Dependency-light by design: native elements + the local canonical `Button`,
 * no TanStack Router, no sidebar context, no Tabler (chevron inline SVG).
 * Deliberate divergences (static shell where the app relies on DOM/layout
 * behavior): `backButton` is `{ label; onBack? }` rendering a native button
 * (the app takes router `LinkProps` and renders a `Link` — routing stays with
 * the consumer; see docs/planning/15-phase4-portability-audit.md:53); the top
 * bar renders only when `backButton` is present (the app additionally draws it
 * for the sidebar toggle via `useSidebarToggleVisible`, which needs sidebar
 * context that does not exist here — compose `SidebarToggle` separately, see
 * `sidebar.tsx`). Theme classes (`text-muted-foreground`, `max-w-*`) are kept
 * 1:1 — there is no accent color here, so no `var(--orbo-*)` substitution.
 */

export type PageShellWidth = "prose" | "wide";

const WIDTHS: Record<PageShellWidth, string> = {
  prose: "max-w-2xl",
  wide: "max-w-5xl",
};

function PageShell({
  action,
  children,
  className,
  description,
  title,
  width = "prose",
  backButton,
}: {
  /** Sits on the title's baseline. For the page's one primary verb, if it has one. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: string;
  width?: PageShellWidth;
  backButton?: {
    label: string;
    onBack?: () => void;
  };
}) {
  const bar = !!backButton;

  return (
    <>
      {bar ? (
        <div className="h-14 w-full max-w-7xl flex items-center gap-1 px-3">
          {!!backButton && (
            <Button variant="ghost" onClick={backButton.onBack} type="button">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
              {backButton.label}
            </Button>
          )}
        </div>
      ) : null}
      <div data-slot="page-shell" className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col px-4 pb-12",
            bar ? "pt-8" : "pt-12",
            WIDTHS[width],
            className,
          )}
        >
          <header className="flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between gap-4">
              <h1 className="font-bold text-2xl">{title}</h1>
              {action}
            </div>
            {description ? (
              <p className="max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            ) : null}
          </header>
          {children}
        </div>
      </div>
    </>
  );
}

export { PageShell };
