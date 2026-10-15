import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical ToolLine. Export names and props mirror
 * app/src/components/channels/tool-line.tsx (`label`/`detail`/`running`/
 * `refused`/`failed`/`children`) so a future port is mechanical.
 *
 * Already dependency-light in the app (native <div>/<details>/<summary>, no
 * Base UI) — ported verbatim apart from the local `cn` import. Two additive
 * divergences: `data-slot="tool-line"` plus `data-running`/`data-refused`/
 * `data-failed` for test targeting (the channels source carries no slots),
 * and an optional `className` merged onto the wrapper. One carry-over: the
 * running sweep keyframes (`.tool-line-running`) and the open-chevron rule
 * (`.tool-line[open] .tool-line-chevron`) still live in app/src/styles.css —
 * they are not yet in `tokensCss` (same follow-up category as wiring
 * `tokensCss` into `:root`), so the shimmer only animates where that
 * stylesheet is loaded. Native <details> owns expansion (kept from the app —
 * SDK tool renderers can be re-invoked independently of React state).
 */

function ToolLine({
  label,
  detail,
  running = false,
  refused = false,
  failed = false,
  children,
  className,
}: {
  /** What was done, in a couple of words: "Searched Slack", "Filled in", "Read the page". */
  label: string;
  /** What it was done to. Muted, and truncated rather than wrapped. */
  detail?: string;
  running?: boolean;
  /** A policy or a boundary said no. Final: nothing the Bot does differently will help. */
  refused?: boolean;
  /** It was permitted and did not work. A different request might. */
  failed?: boolean;
  /** Shown when the line is expanded. Without it the line is not expandable. */
  children?: React.ReactNode;
  className?: string;
}) {
  const tone = refused
    ? "text-destructive"
    : failed
      ? "text-amber-600 dark:text-amber-500"
      : "text-muted-foreground";

  const text = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-baseline gap-1.5 text-sm",
        tone,
        running && "tool-line-running",
      )}
    >
      <span className="shrink-0">
        {refused
          ? `Blocked: ${label}`
          : failed
            ? `${label}, didn't work`
            : label}
      </span>
      {detail ? <span className="truncate opacity-70">{detail}</span> : null}
    </span>
  );

  if (!children) {
    return (
      <div
        data-slot="tool-line"
        data-running={running ? true : undefined}
        data-refused={refused ? true : undefined}
        data-failed={failed ? true : undefined}
        className={cn("my-1.5", className)}
      >
        {text}
      </div>
    );
  }

  return (
    <details
      data-slot="tool-line"
      data-running={running ? true : undefined}
      data-refused={refused ? true : undefined}
      data-failed={failed ? true : undefined}
      className={cn("tool-line my-1.5 min-w-0", className)}
    >
      {/*
       * Native <details> owns expansion because SDK tool renderers can be re-invoked independently
       * of this component's React state.
       */}
      <summary className="flex cursor-pointer list-none items-baseline gap-1.5">
        <span
          aria-hidden
          className="tool-line-chevron shrink-0 text-xs text-muted-foreground transition-transform"
        >
          ▸
        </span>
        {text}
      </summary>
      {/*
       * Headings are cut down to the size of the surrounding text. A tool result is markdown a
       * server wrote for a model, so its `#` is a section marker rather than a page title.
       */}
      <div className="mt-2 max-h-80 overflow-auto border-l pl-3 text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-xs [&_h1]:font-medium [&_h2]:font-medium [&_h3]:font-medium">
        {children}
      </div>
    </details>
  );
}

export { ToolLine };
