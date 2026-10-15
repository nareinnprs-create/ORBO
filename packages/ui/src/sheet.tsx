import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical Sheet family. Export names, `data-slot`s, and Tailwind scale
 * mirror app/src/components/ui/sheet.tsx (Sheet + Trigger/Close/Content/
 * Header/Footer/Title/Description) so a future port is mechanical.
 *
 * Dependency-light by design: plain divs + native <button>s, no Base UI, no
 * Tabler icons (inline SVG close). Deliberate divergences (same category as
 * the canonical Dialog): Sheet is a plain <div> wrapper (no Root context, no
 * open/onOpenChange state, no focus trap, scroll lock, or escape handling);
 * Portal is a plain <div> (no portal); Trigger/Close are native buttons
 * defaulting to `type="button"`; Title and Description are native <h2>/<p>;
 * Content keeps the app `side` + `showCloseButton` API and always renders its
 * own backdrop div; Base UI `data-ending-style` / `data-starting-style`
 * animation attributes are dropped (transition classes kept). SheetPortal and
 * SheetOverlay stay module-private, matching the app (the canonical Dialog
 * exports its Portal/Overlay because the app dialog does too).
 */

function Sheet({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet" className={cn(className)} {...props} />;
}

function SheetTrigger({
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return <button type={type} data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return <button type={type} data-slot="sheet-close" {...props} />;
}

function SheetPortal({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-portal" className={cn(className)} {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <div
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon-sm"
            data-slot="sheet-close"
            className="absolute top-3 right-3"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
