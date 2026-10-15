import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Skeleton. API mirrors app/src/components/ui/skeleton.tsx (native
 * div props, `data-slot="skeleton"`, same Tailwind scale) so a future port is
 * mechanical.
 *
 * Already dependency-light in the app (native <div>, no Base UI) — ported
 * verbatim apart from the local `cn` import.
 */

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
