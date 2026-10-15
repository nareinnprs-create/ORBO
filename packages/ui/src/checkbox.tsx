import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Checkbox. Checked/disabled API mirrors
 * app/src/components/ui/checkbox.tsx (checked, defaultChecked, disabled,
 * required, name, value, aria-invalid, same Tailwind scale) so a future port
 * is mechanical.
 *
 * Dependency-light by design: a native <input type="checkbox">, no Base UI,
 * no Tabler icons (inline SVG check). Deliberate divergences: the control is
 * a native input with `appearance-none`, so the app's Base UI
 * `data-checked:` / `data-disabled:` selectors become the native `checked:` /
 * `disabled:` variants; the check mark is a sibling SVG toggled by
 * `peer-checked:` (a native input cannot have children, so there is no
 * CheckboxIndicator slot); the input carries the app `data-slot="checkbox"`
 * and the wrapper span is unslotted layout only (disabled dimming flows
 * through `has-disabled:` so the box and the mark dim together).
 */

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex size-4 shrink-0 has-disabled:opacity-50">
      <input
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "peer size-4 shrink-0 appearance-none rounded-[4px] border border-input shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 checked:border-primary checked:bg-primary checked:text-primary-foreground disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

export { Checkbox };
