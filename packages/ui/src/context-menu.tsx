import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical ContextMenu family. Export names, `data-slot`s, and Tailwind scale
 * mirror app/src/components/ui/context-menu.tsx (ContextMenu + Trigger/
 * Content/Group/Label/Item/CheckboxItem/RadioGroup/RadioItem/Separator/
 * Shortcut/Portal/Sub/SubContent/SubTrigger) so a future port is mechanical.
 *
 * Dependency-light by design: plain divs, no Base UI, no Tabler icons (inline
 * SVG chevron/check). Deliberate divergences (same category as the canonical
 * DropdownMenu): ContextMenu is a plain <div> wrapper (no Root context, no
 * open state, no keyboard/focus management, no menu roles — the same
 * lint-driven call as the Field/ItemGroup role omissions); Portal is a plain
 * <div> (no portal); Trigger is a plain <div> area wrapper (no `contextmenu`
 * behavior — the app trigger is the right-click region, not a button);
 * Content is a statically rendered <div> (no Positioner, no `side`/`align`
 * props); `checked` maps to `data-checked` (the check mark renders when set —
 * no indicator state machine); Separator is a native <hr> (with a `border-0`
 * UA reset, same call as SelectSeparator). Base UI `data-open` /
 * `data-closed` / `data-[side=...]` slide-in animation attributes are dropped
 * (layout classes kept). RadioItem gains an optional `checked` (additive —
 * the app derives it from the radio group, which has no state here).
 */

function ContextMenu({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="context-menu" className={cn(className)} {...props} />;
}

function ContextMenuPortal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="context-menu-portal" className={cn(className)} {...props} />
  );
}

function ContextMenuTrigger({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-content"
      className={cn(
        "z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="context-menu-group" className={cn(className)} {...props} />
  );
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="context-menu-label"
      data-inset={inset ? true : undefined}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <div
      data-slot="context-menu-item"
      data-inset={inset ? true : undefined}
      data-variant={variant}
      className={cn(
        "group/context-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSub({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="context-menu-sub" className={cn(className)} {...props} />
  );
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="context-menu-sub-trigger"
      data-inset={inset ? true : undefined}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
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
        className="ml-auto"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </div>
  );
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <ContextMenuContent
      data-slot="context-menu-sub-content"
      className={cn("shadow-lg", className)}
      {...props}
    />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  checked?: boolean;
  inset?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      data-slot="context-menu-checkbox-item"
      data-inset={inset ? true : undefined}
      data-checked={checked ? true : undefined}
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        {checked && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      {children}
    </div>
  );
}

function ContextMenuRadioGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-radio-group"
      className={cn(className)}
      {...props}
    />
  );
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  checked,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      data-slot="context-menu-radio-item"
      data-inset={inset ? true : undefined}
      data-checked={checked ? true : undefined}
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        {checked && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
      {children}
    </div>
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px border-0 bg-border", className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
