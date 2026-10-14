import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Label. API mirrors app/src/components/ui/label.tsx (native label
 * props, `data-slot="label"`, same Tailwind scale) so a future port is
 * mechanical.
 *
 * Already dependency-light in the app (native <label>, no Base UI) — ported
 * verbatim apart from the local `cn` import. The `biome-ignore` below is
 * lint-driven, not a behavior change: the repo biome config relaxes
 * `a11y/noLabelWithoutControl` only for `app/src/components/ui/**`.
 */

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic primitive, consumer associates control via htmlFor.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
