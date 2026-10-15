import * as React from "react";

import { Button } from "./button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
import { cn } from "./utils";

/*
 * Canonical Combobox family. Export names, `data-slot`s, and Tailwind scale
 * mirror app/src/components/ui/combobox.tsx (Combobox + Value/Trigger/Input/
 * Content/List/Item/Group/Label/Collection/Empty/Separator/Chips/Chip/
 * ChipsInput) so a future port is mechanical.
 *
 * Dependency-light by design: plain divs + native inputs/buttons, no Base UI,
 * no Tabler icons (inline SVG chevron/check/clear); ComboboxInput composes
 * the local canonical InputGroup family and keeps the app
 * `showTrigger`/`showClear` API. Deliberate divergences: Combobox is a plain
 * <div> wrapper (no Root context, no value/multiple/open state, no
 * filtering); Trigger/Clear are native buttons defaulting to `type="button"`;
 * Content is a statically rendered <div> (no Portal/Positioner, no
 * `side`/`align` props, no open/close animation attributes — the `anchor`
 * prop survives only as a `withChips` flag for the min-width rule); Item is a
 * <div> with an optional `value` (no highlight state); Separator is a native
 * <hr> (with a `border-0` UA reset, same call as SelectSeparator); Collection
 * renders as a fragment (no filtering); Chip keeps `showRemove`/`removeLabel`
 * with the remove control on the local Button (`ghost`, `icon-xs`).
 * ComboboxClear is exported (additive — defined but unexported in the app).
 */

function Combobox({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="combobox" className={cn(className)} {...props} />;
}

function ComboboxValue({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="combobox-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

function ComboboxTrigger({
  type = "button",
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none size-4 text-muted-foreground"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function ComboboxClear({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-slot="combobox-clear"
      className={cn(className)}
      {...props}
    >
      {children ?? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
    </Button>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: React.ComponentProps<"input"> & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={cn("w-auto", className)}>
      <InputGroupInput disabled={disabled} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <ComboboxTrigger
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  children,
  withChips = false,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * Mirrors the app's `anchor` (chips) layout: when the popup is anchored to
   * the chips list it keeps the anchor width instead of the wider default.
   */
  withChips?: boolean;
}) {
  return (
    <div
      data-slot="combobox-content"
      data-chips={withChips ? true : undefined}
      className={cn(
        "group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function ComboboxList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox-list"
      className={cn(
        "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  value,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string;
  disabled?: boolean;
}) {
  return (
    <div
      data-slot="combobox-item"
      data-value={value}
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
    </div>
  );
}

function ComboboxGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function ComboboxEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px border-0 bg-border", className)}
      {...props}
    />
  );
}

function ComboboxChips({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  removeLabel,
  ...props
}: React.ComponentProps<"div"> & {
  showRemove?: boolean;
  /** What the remove button is called to a screen reader, e.g. "Remove Knowledge". */
  removeLabel?: string;
}) {
  return (
    <div
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          data-slot="combobox-chip-remove"
          aria-label={removeLabel}
          className="mr-0.5 -ml-0.5 size-4 rounded-sm opacity-50 hover:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Button>
      )}
    </div>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxValue,
  useComboboxAnchor,
};
