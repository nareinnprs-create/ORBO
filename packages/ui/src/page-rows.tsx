import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical PageRows. Export name, props, and Tailwind scale mirror
 * app/src/components/layout/page-shell.tsx (`PageRows`) so a future port is
 * mechanical.
 *
 * Already dependency-light in the app (a plain bordered div, no Base UI) —
 * ported verbatim apart from the local `cn` import and an additive
 * `data-slot="page-rows"` (package convention; the app layout carries no
 * data-slots). The `[&_[data-slot=item]]:rounded-none` rule is load-bearing:
 * the canonical `Item` (`item.tsx`) carries `data-slot="item"`, so rows stay
 * squared off inside the card exactly as in the app. Theme classes
 * (`border-border`, `bg-card`) are kept 1:1 — no `var(--orbo-*)` substitution.
 */

function PageRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-rows"
      className={cn(
        "mt-4 overflow-hidden rounded-lg border border-border bg-card dark:border-transparent",
        "[&_[data-slot=item]]:rounded-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { PageRows };
