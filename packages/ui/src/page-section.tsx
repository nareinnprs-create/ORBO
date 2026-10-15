import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical PageSection. Export name, props (`action`/`description`/`title`),
 * and Tailwind scale mirror app/src/components/layout/page-shell.tsx
 * (`PageSection`) so a future port is mechanical.
 *
 * Already dependency-light in the app (plain section/divs, no Base UI) —
 * ported verbatim apart from the local `cn` import and an additive
 * `data-slot="page-section"` (package convention; the app layout carries no
 * data-slots). Theme classes are kept 1:1 — no accent color, so no
 * `var(--orbo-*)` substitution.
 */

function PageSection({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title?: string;
}) {
  return (
    <section data-slot="page-section" className={cn("mt-12", className)}>
      {title ? (
        <div className="flex min-h-8 flex-row items-center justify-between gap-4">
          <h2 className="font-bold text-lg">{title}</h2>
          {action}
        </div>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export { PageSection };
