import type * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

/*
 * Canonical MessageScroller family. Export names, `data-slot`s, and Tailwind
 * scale mirror app/src/components/ui/message-scroller.tsx (Provider + Root/
 * Viewport/Content/Item/Button, same `direction` + `variant`/`size` API on the
 * button) so a future port is mechanical.
 *
 * Dependency-light by design: plain divs + a native-scrolling viewport, no
 * `@shadcn/react/message-scroller`, no Tabler icons (inline SVG arrow, local
 * Button for the scroll button). Deliberate divergences: Provider is a plain
 * <div> wrapper (no scroll context — `autoScroll`/`defaultScrollPosition`/
 * `scrollEdgeThreshold`/`scrollPreviousItemPeek`/`scrollMargin` are accepted
 * and reflected as `data-*` but schedule nothing: no auto-scroll, no scroll
 * anchoring); Viewport is natively scrollable (`preserveScrollOnPrepend`
 * reflected as `data-preserve-scroll-on-prepend` only — prepends do not hold
 * position); Content is statically rendered (no spacer virtualizer —
 * `spacerClassName` reflected as `data-spacer-class` only); Item is a plain
 * <div> (`messageId`/`scrollAnchor` reflected as `data-message-id`/
 * `data-scroll-anchor`, no anchor tracking); Button keeps the app `direction`
 * + `variant`/`size` API over the local Button but has no visibility state
 * machine — it takes an explicit `active` (defaults to `false`, always
 * rendered as `data-active="true"|"false"` so the app's
 * `data-[active=...]` show/hide classes keep working) and `behavior` is
 * reflected as `data-behavior` only (scrolls nothing), with no `render` prop
 * (same call as the canonical Button); the `useMessageScroller`/
 * `useMessageScrollerScrollable`/`useMessageScrollerVisibility` hooks are
 * static stubs (no-op scrollers returning `false`, empty visibility) so call
 * sites typecheck before the behavior port.
 */

type MessageScrollerScrollOptions = {
  align?: "start" | "center" | "end" | "nearest";
  behavior?: ScrollBehavior;
  scrollMargin?: number;
};

function useMessageScroller() {
  return {
    scrollToEnd: (_options?: MessageScrollerScrollOptions) => false,
    scrollToMessage: (
      _messageId: string,
      _options?: MessageScrollerScrollOptions,
    ) => false,
    scrollToStart: (_options?: MessageScrollerScrollOptions) => false,
  };
}

function useMessageScrollerScrollable() {
  return { start: false, end: false };
}

function useMessageScrollerVisibility() {
  return {
    currentAnchorId: null as string | null,
    visibleMessageIds: [] as string[],
  };
}

function MessageScrollerProvider({
  className,
  children,
  autoScroll = true,
  defaultScrollPosition = "end",
  scrollEdgeThreshold,
  scrollPreviousItemPeek,
  scrollMargin,
  ...props
}: React.ComponentProps<"div"> & {
  autoScroll?: boolean;
  defaultScrollPosition?: "start" | "end" | "last-anchor";
  scrollEdgeThreshold?: number;
  scrollPreviousItemPeek?: number;
  scrollMargin?: number;
}) {
  return (
    <div
      data-slot="message-scroller-provider"
      data-auto-scroll={autoScroll}
      data-default-scroll-position={defaultScrollPosition}
      data-scroll-edge-threshold={scrollEdgeThreshold}
      data-scroll-margin={scrollMargin}
      data-scroll-previous-item-peek={scrollPreviousItemPeek}
      className={cn("contents", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function MessageScroller({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-scroller"
      className={cn(
        "group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerViewport({
  className,
  preserveScrollOnPrepend = false,
  ...props
}: React.ComponentProps<"div"> & {
  preserveScrollOnPrepend?: boolean;
}) {
  return (
    <div
      data-slot="message-scroller-viewport"
      data-preserve-scroll-on-prepend={
        preserveScrollOnPrepend ? true : undefined
      }
      className={cn(
        "size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent",
        className,
      )}
      {...props}
    />
  );
}

function MessageScrollerContent({
  className,
  spacerClassName,
  ...props
}: React.ComponentProps<"div"> & {
  spacerClassName?: string;
}) {
  return (
    <div
      data-slot="message-scroller-content"
      data-spacer-class={spacerClassName}
      className={cn("flex h-max min-h-full flex-col gap-6", className)}
      {...props}
    />
  );
}

function MessageScrollerItem({
  className,
  messageId,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<"div"> & {
  messageId?: string;
  scrollAnchor?: boolean;
}) {
  return (
    <div
      data-slot="message-scroller-item"
      data-message-id={messageId}
      data-scroll-anchor={scrollAnchor ? true : undefined}
      // Do not use `content-visibility: auto`: short transcripts can reserve
      // item height without painting the message until a scroll/resize forces
      // it (kept from the app).
      className={cn("min-w-0 shrink-0", className)}
      {...props}
    />
  );
}

function MessageScrollerButton({
  direction = "end",
  behavior,
  active = false,
  className,
  children,
  variant = "secondary",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button> & {
  direction?: "start" | "end";
  behavior?: ScrollBehavior;
  active?: boolean;
}) {
  return (
    <Button
      data-slot="message-scroller-button"
      data-direction={direction}
      data-behavior={behavior}
      data-active={active}
      data-variant={variant}
      data-size={size}
      variant={variant}
      size={size}
      type="button"
      className={cn(
        "absolute inset-s-1/2 -translate-x-1/2 border-border bg-background text-foreground transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] data-[direction=end]:bottom-4 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full rtl:translate-x-1/2 data-[direction=start]:[&_svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14m-7-7 7 7 7-7" />
          </svg>
          <span className="sr-only">
            {direction === "end" ? "Scroll to end" : "Scroll to start"}
          </span>
        </>
      )}
    </Button>
  );
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
  type MessageScrollerScrollOptions,
};
