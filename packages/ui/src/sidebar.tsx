import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical sidebar chrome. Export names and Tailwind scale mirror
 * app/src/components/layout/sidebar-shell.tsx (`SidebarShell`) and
 * app/src/components/layout/sidebar-toggle.tsx (`SidebarToggle`,
 * `SidebarToggleBar`) so a future port is mechanical. (The `ui/sidebar.tsx`
 * menu system consolidates here per 04-design-system.md §6, renamed
 * `SidebarShell`.)
 *
 * Dependency-light by design: native elements + the local canonical `Button`,
 * no sidebar context, no Tabler (panel icon inline SVG). Deliberate
 * divergences (static shells where the app relies on DOM/layout behavior):
 * `SidebarShell` keeps the exact app props (`children`/`className`/`width`)
 * but renders a plain div — no `SidebarProvider` context (no
 * `toggleSidebar`/⌘B shortcut), no `localStorage` persistence (the frame is
 * always expanded; open state lives with the consumer), no `matchMedia`
 * mobile branch (no overlay `Sheet`; the consumer composes the canonical
 * `Sheet` for that); `--sidebar-width`/`--sidebar-width-mobile` vars are still
 * set for the consumer to read. `SidebarToggle` keeps the app `{ className }`
 * API plus additive `label`/`onToggle` (the app reads state from context and
 * tooltips the ⌘B/Ctrl+B shortcut — no context, no key listener, and no
 * `navigator.userAgent` sniff here, so the label is fixed and the hint is a
 * native `title`). `SidebarToggleBar` keeps the reserved 48px band but takes
 * the toggle as `children` (composition inversion: the app renders its own
 * toggle from context). `useSidebarToggleVisible` has no port (a hook over
 * sidebar context + viewport, neither of which exists here).
 */

function SidebarShell({
  children,
  className,
  width,
}: {
  children: React.ReactNode;
  className?: string;
  /** Sidebar width (the app shells pass `"340px"` roster / `"300px"` nav). */
  width: string;
}) {
  return (
    <div
      data-slot="sidebar-shell"
      style={
        {
          "--sidebar-width": width,
          "--sidebar-width-mobile": "20rem",
        } as React.CSSProperties
      }
      className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
    >
      {children}
    </div>
  );
}

function SidebarToggle({
  className,
  label = "Toggle sidebar",
  onToggle,
}: {
  className?: string;
  label?: string;
  onToggle?: () => void;
}) {
  return (
    <Button
      aria-label={label}
      title={label}
      className={cn("text-muted-foreground", className)}
      onClick={onToggle}
      size="icon"
      variant="ghost"
      type="button"
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
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v16" />
      </svg>
    </Button>
  );
}

function SidebarToggleBar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="sidebar-toggle-bar"
      className={cn("flex h-12 shrink-0 items-center px-3", className)}
    >
      {children}
    </div>
  );
}

export { SidebarShell, SidebarToggle, SidebarToggleBar };
