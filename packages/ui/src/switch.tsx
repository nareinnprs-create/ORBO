import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Switch. Size API mirrors app/src/components/ui/switch.tsx
 * (`sm` | `default`, `data-size`, same track scale) so a future port is
 * mechanical.
 *
 * Dependency-light by design: a native `<input type="checkbox">` with no
 * `role` and no Base UI. The `role="switch"` + author-managed `aria-checked`
 * pair the app gets from Base UI is deliberately omitted: biome's
 * `a11y/useAriaPropsForRole` requires a static `aria-checked` beside the
 * role, which an uncontrolled native input cannot provide (its checked state
 * lives in the DOM, not in props), and the native checked state already
 * exposes toggle semantics to assistive tech. `size` is the app `sm` |
 * `default` Switch size (the native input width attribute of the same name
 * is omitted). Deliberate divergences: the app's Base UI
 * `data-checked:` / `data-unchecked:` selectors become the native `checked:`
 * variant over a base (unchecked) style, and `data-disabled:` becomes
 * `disabled:`; the thumb is a `::before` pseudo-element (a native input
 * cannot have children, so there is no `data-slot="switch-thumb"` node and
 * no group-data size selectors — size flows through `data-[size=...]:` on
 * the input itself). `dark:checked:` re-asserts the on-state over the dark
 * unchecked base so the checked fill always wins.
 */

function Switch({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default";
}) {
  return (
    <input
      type="checkbox"
      data-slot="switch"
      data-size={size}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer appearance-none items-center rounded-full border border-transparent bg-input transition-[background-color,border-color,box-shadow] duration-150 ease-out outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] before:pointer-events-none before:block before:rounded-full before:bg-background before:transition-transform before:duration-150 before:ease-out before:content-[''] data-[size=default]:before:size-4 data-[size=sm]:before:size-3 checked:before:translate-x-[calc(100%-2px)] dark:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:checked:bg-primary dark:before:bg-foreground dark:checked:before:bg-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Switch };
