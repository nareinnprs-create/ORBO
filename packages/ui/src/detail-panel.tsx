import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical DetailPanel. Export name, props (`open`/`onClose`/`title`/
 * `detail`/`detailWidth`), and Tailwind scale mirror
 * app/src/components/layout/detail-panel.tsx (`DetailPanel`) so a future
 * port is mechanical.
 *
 * Dependency-light by design: native divs + the local canonical `Button`, no
 * `motion`, no Tabler (close X inline SVG). Deliberate divergences (static
 * shell where the app relies on DOM layout behavior): the app measures its
 * container with a `ResizeObserver` and renders the detail in a `Sheet`
 * overlay below `detailWidth + 400px`, otherwise as an animated side pane —
 * this always renders the side pane (`open` ? aside at `detailWidth` : null),
 * so narrow windows are the consumer's composition (wrap the canonical
 * `Sheet`); the `motion` width/content entrance is dropped (instant, so
 * reduced-motion is trivially honored); `EASE_OUT`/timing constants go with
 * it. Preserved: `detailWidth` default (400), detail unmounts while closed,
 * `data-open` reflects state (additive, package convention alongside
 * `data-slot="detail-panel"`). Theme classes (`border-border`, `bg-sidebar`)
 * are kept 1:1 — no `var(--orbo-*)` substitution.
 */

const DEFAULT_DETAIL_WIDTH = 400;

function DetailPanel({
  open,
  onClose,
  title,
  detail,
  detailWidth = DEFAULT_DETAIL_WIDTH,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Rendered at the left of the detail pane's header row, beside the close button. */
  title?: React.ReactNode;
  detail?: React.ReactNode;
  /** Open width of the detail pane, in pixels. */
  detailWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="detail-panel"
      data-open={open}
      className="flex h-full min-h-0"
    >
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {open ? (
        <div
          className={cn(
            "flex h-full shrink-0 flex-col border-border border-l bg-sidebar",
          )}
          style={{ width: detailWidth }}
        >
          <div className="sticky top-0 flex h-12 shrink-0 flex-row items-center justify-between gap-2 px-2">
            <div className="flex w-full min-w-0 items-center gap-1.5">
              {title}
            </div>
            <div className="flex flex-row gap-1.5">
              <Button
                aria-label="Close details"
                onClick={onClose}
                variant="ghost"
                size="icon"
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
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
        </div>
      ) : null}
    </div>
  );
}

export { DetailPanel };
