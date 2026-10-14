import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Input. API mirrors app/src/components/ui/input.tsx (native input
 * props, `data-slot="input"`, same Tailwind scale) so a future port is
 * mechanical.
 *
 * Dependency-light by design: a native <input>, no Base UI. No ORBO token
 * overrides — radius/severity classes resolve to the same values as tokens.ts,
 * so no class churn is needed at port time.
 */

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
