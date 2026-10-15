import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Separator. Orientation API mirrors
 * app/src/components/ui/separator.tsx (`horizontal` | `vertical`, same
 * Tailwind scale) so a future port is mechanical.
 *
 * Dependency-light by design: a native <hr>, no Base UI (same call as the
 * earlier ItemSeparator, FieldSeparator, and SelectSeparator). Deliberate
 * divergences: `data-horizontal` / `data-vertical` are set explicitly from
 * the `orientation` prop (Base UI derived them from state); `decorative`
 * maps to `aria-hidden` and a vertical separator adds `aria-orientation`;
 * `border-0` resets the UA hr border so `h-px` / `w-px` read exactly.
 */

function Separator({
  className,
  orientation = "horizontal",
  decorative,
  ...props
}: React.ComponentProps<"hr"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    <hr
      data-slot="separator"
      data-orientation={orientation}
      data-horizontal={orientation === "horizontal" ? true : undefined}
      data-vertical={orientation === "vertical" ? true : undefined}
      aria-orientation={orientation === "vertical" ? "vertical" : undefined}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        "shrink-0 border-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
