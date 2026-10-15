import type * as React from "react";

import { cn } from "./utils";

/*
 * Canonical DropdownMenu family. Export names, `data-slot`s, and Tailwind
 * scale mirror app/src/components/ui/dropdown-menu.tsx (DropdownMenu +
 * Portal/Trigger/Content/Group/Label/Item/CheckboxItem/RadioGroup/RadioItem/
 * Separator/Shortcut/Sub/SubTrigger/SubContent) so a future port is
 * mechanical.
 *
 * Dependency-light by design: plain divs + a native <button> trigger, no Base
 * UI, no Tabler icons (inline SVG chevron/check). Deliberate divergences:
 * DropdownMenu is a plain <div> wrapper (no Root context, no open state, no
 * keyboard/focus management, no menu roles — the same lint-driven call as
 * the Field/ItemGroup role omissions); Portal is a plain <div> (no portal);
 * Trigger is a native button defaulting to `type="button"`; Content is a
 * statically rendered <div> (no Positioner, no `side`/`align` props);
 * `checked` maps to `data-checked` (the check mark renders when set — no
 * indicator state machine); Separator is a native <hr> (with a `border-0` UA
 * reset, same call as SelectSeparator). Base UI `data-open` / `data-closed` /
 * `data-popup-open` / `data-[side=...]` slide-in animation attributes are
 * dropped (layout classes kept). RadioItem gains an optional `checked`
 * (additive — the app derives it from the radio group, which has no state
 * here).
 */

function DropdownMenu({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu" className={cn(className)} {...props} />;
}

function DropdownMenuPortal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-portal"
      className={cn(className)}
      {...props}
    />
  );
}

function DropdownMenuTrigger({
  type = "button",
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      data-slot="dropdown-menu-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-content"
      className={cn(
        "z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="dropdown-menu-group" className={cn(className)} {...props} />
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset ? true : undefined}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
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
      data-slot="dropdown-menu-item"
      data-inset={inset ? true : undefined}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dropdown-menu-sub" className={cn(className)} {...props} />
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset ? true : undefined}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
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
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset ? true : undefined}
      data-checked={checked ? true : undefined}
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
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

function DropdownMenuRadioGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-radio-group"
      className={cn(className)}
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
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
      data-slot="dropdown-menu-radio-item"
      data-inset={inset ? true : undefined}
      data-checked={checked ? true : undefined}
      data-disabled={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
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

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"hr">) {
  return (
    <hr
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px border-0 bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
