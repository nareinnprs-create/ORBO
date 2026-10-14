import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical Dialog family. Export names, `data-slot`s, and Tailwind scale
 * mirror app/src/components/ui/dialog.tsx (Dialog + Trigger/Close/Portal/
 * Overlay/Content/Header/Body/Footer/Title/Description) so a future port is
 * mechanical.
 *
 * Dependency-light by design: plain divs + native <button>s, no Base UI, no
 * Tabler icons (inline SVG close). Deliberate divergences: Dialog is a plain
 * <div> wrapper (no Root context, no open/onOpenChange state, no focus trap,
 * scroll lock, or escape handling); Portal is a plain <div> (no portal);
 * Trigger/Close are native buttons defaulting to `type="button"`; Title and
 * Description are native <h2>/<p>; Content keeps the app `showCloseButton` +
 * `overlayClassName` API and always renders its own backdrop div (a stacked
 * dialog passes a heavier overlay via `overlayClassName`).
 */

function Dialog({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog" className={cn(className)} {...props} />;
}

function DialogTrigger({
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return <button type={type} data-slot="dialog-trigger" {...props} />;
}

function DialogClose({
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return <button type={type} data-slot="dialog-close" {...props} />;
}

function DialogPortal({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-portal" className={cn(className)} {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
  /**
   * Restyles the backdrop behind this popup. A dialog stacked over another
   * passes a heavier one here, so the dialog underneath reads as background
   * rather than as a competing surface.
   */
  overlayClassName?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <div
        data-slot="dialog-content"
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-popover p-5 text-sm text-popover-foreground shadow-lg transition duration-150 ease-out",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon-sm"
            data-slot="dialog-close"
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
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 pr-8", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-row items-center justify-end gap-2", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "font-heading font-medium text-base text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm text-pretty", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
