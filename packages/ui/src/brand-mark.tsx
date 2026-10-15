import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical BrandMark (`BrandMark` + `Wordmark`).
 *
 * There is no brand-mark source in the app — per 04-design-system.md §3/§6
 * every legacy avatar set (boring-avatars and other upstream marks)
 * is REPLACED by the ORBO brand mark, and §5.3 fixes the wordmark to
 * Montserrat 700. The orb here is a static inline-SVG disc in the
 * royal-purple token scale (hex fallbacks), not the motion-driven
 * `agents/orb/agent-orb.tsx` (no `motion`, no audio/amplitude/state — a
 * deliberate static divergence, same category as the other styled shells).
 *
 * Dependency-light by design: no image assets, no font packaging (the
 * wordmark requests Montserrat with an Inter/sans-serif fallback until G1
 * vendors the face). The mark is decorative (`aria-hidden` SVG): the
 * wordmark text carries the accessible name when shown.
 */

function BrandMark({
  size = 24,
  showWordmark = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <span
      data-slot="brand-mark"
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="16" cy="16" r="14" fill="var(--orbo-purple-600,#6D28D9)" />
        <circle cx="16" cy="16" r="9" fill="var(--orbo-purple-400,#A78BFA)" />
        <circle cx="16" cy="16" r="4.5" fill="var(--orbo-purple-100,#EDE9FE)" />
        <circle cx="11.5" cy="10.5" r="3.5" fill="#FFFFFF" opacity="0.35" />
      </svg>
      {showWordmark ? <Wordmark /> : null}
    </span>
  );
}

function Wordmark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="brand-wordmark"
      style={{ fontFamily: "Montserrat, Inter, sans-serif" }}
      className={cn(
        "text-[23px] leading-[1.1] font-bold tracking-[-1px]",
        className,
      )}
      {...props}
    >
      ORBO
    </span>
  );
}

export { BrandMark, Wordmark };
