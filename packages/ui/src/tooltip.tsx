import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical Tooltip family. Export names, `data-slot`s, and Tailwind scale
 * mirror app/src/components/ui/tooltip.tsx (Tooltip + Trigger/Content/
 * Provider) so a future port is mechanical.
 *
 * Dependency-light by design: plain divs + a native <button> trigger, no Base
 * UI. Deliberate divergences: Tooltip/Provider are plain <div> wrappers (no
 * Root context, no open state, no delay timing — `delay` is accepted and
 * reflected as `data-delay` but schedules nothing); Trigger is a native
 * button defaulting to `type="button"`; Content is a statically rendered
 * <div> with `role="tooltip"` (no Portal/Positioner, no `side`/`align` props,
 * no hover/focus behavior — it renders the app's default `side="top"`
 * placement) with a non-positioned diamond arrow (no Arrow primitive).
 * Base UI `data-open` / `data-closed` / `data-[state=...]` animation
 * attributes are dropped (layout classes kept).
 */

function TooltipProvider({
  className,
  delay = 0,
  ...props
}: React.ComponentProps<"div"> & {
  delay?: number;
}) {
  return (
    <div
      data-slot="tooltip-provider"
      data-delay={delay}
      className={cn(className)}
      {...props}
    />
  );
}

function Tooltip({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="tooltip" className={cn(className)} {...props} />;
}

function TooltipTrigger({
  type = "button",
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="tooltip-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tooltip-content"
      role="tooltip"
      className={cn(
        "relative z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
        className,
      )}
      {...props}
    >
      {children}
      <div
        aria-hidden="true"
        className="absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-foreground"
      />
    </div>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
