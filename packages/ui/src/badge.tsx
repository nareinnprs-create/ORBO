import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

/*
 * Canonical Badge (+ `badgeVariants`). Tone API mirrors
 * app/src/components/gallery/frame.tsx (Badge + Tone: `neutral` | `positive`
 * | `caution` | `negative`, same text scale) so a future port is mechanical —
 * there is no `ui/badge.tsx` in the app; the gallery Badge is the canonical
 * badge per 04-design-system.md §3.
 *
 * Dependency-light by design: a native <span>, no Base UI. One deliberate
 * divergence: tint backgrounds derive from the ORBO tokens with hex fallbacks
 * (neutral from the grey scale, the rest from the state colors) instead of the
 * gallery's `bg-foreground/5` + emerald/amber/red scales; text keeps the
 * gallery's contrast-tested scale so light/dark legibility is unchanged.
 */

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--orbo-grey-100,#E8ECF1)] text-[var(--orbo-grey-600,#4A5668)] dark:bg-[var(--orbo-grey-800,#232B36)] dark:text-[var(--orbo-grey-200,#D3DAE3)]",
        positive:
          "bg-[color-mix(in_oklab,var(--orbo-positive,#10B981)_12%,transparent)] text-emerald-700 dark:text-emerald-400",
        caution:
          "bg-[color-mix(in_oklab,var(--orbo-caution,#F59E0B)_15%,transparent)] text-amber-700 dark:text-amber-400",
        negative:
          "bg-[color-mix(in_oklab,var(--orbo-negative,#EF4444)_12%,transparent)] text-red-700 dark:text-red-400",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export type BadgeTone = "neutral" | "positive" | "caution" | "negative";

function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
