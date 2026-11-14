import { IconAlertTriangle } from "@tabler/icons-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

/**
 * The three states every surface answers with while its query is not showing rows.
 *
 * The shapes already existed — a `role="alert"` paragraph in text-destructive, a `role="status"`
 * sentence, the Empty primitives — but every surface drew its own copy, and the copies drifted.
 * These three are the one copy each. The list-level empty on a PageShell screen is still
 * `PageEmpty` (a sentence, no card); `EmptyState` is the composed card, for surfaces like the
 * sidebar and the gallery that draw the dashed box.
 */

/** A read failed. `role="alert"`, because the person did something and got nothing back. */
export function ErrorState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm text-destructive",
        className,
      )}
      role="alert"
    >
      <IconAlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{children}</span>
    </p>
  );
}

/** The surface is waiting on its query. Quiet, and announced as a status, not an alert. */
export function LoadingState({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-diya-rich-teal"
      />
      {label}
    </p>
  );
}

/**
 * Nothing to list, drawn as the composed Empty card: the primitives' one intended arrangement, so
 * a surface reaches for one name instead of restating the tree.
 */
export function EmptyState({
  className,
  description,
  icon: Icon,
  title,
}: {
  className?: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
}) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription className="text-pretty">
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
