import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical PageEmpty. Export name, props, and Tailwind scale mirror
 * app/src/components/layout/page-shell.tsx (`PageEmpty`) so a future port is
 * mechanical.
 *
 * Already dependency-light in the app (a plain paragraph, no Base UI) —
 * ported verbatim apart from the local `cn` import and an additive
 * `data-slot="page-empty"` (package convention; the app layout carries no
 * data-slots). Not to be confused with the canonical `Empty` family
 * (`empty.tsx`): that is the illustrated empty state, this is the one-sentence
 * "nothing here yet" on a configuration screen.
 */

function PageEmpty({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      data-slot="page-empty"
      className={cn("mt-4 text-muted-foreground text-sm", className)}
    >
      {children}
    </p>
  );
}

export { PageEmpty };
