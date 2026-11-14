import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { outcomeOf } from "@/lib/audit/outcome";
import { auditEventsQueryOptions } from "@/lib/audit/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";

/** One row as the API returns it — the same shape the admin audit page reads. */
type AuditEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/**
 * The Bot's computer actions, read from the trail the server keeps, beside the screen it shows.
 *
 * The activity log above this is a window on this session only; this is the durable half. It reads
 * the audit endpoint, which answers administrators only, so the query is not even started for
 * anybody else — a person who is not one is told where the trail lives rather than shown an empty
 * panel that would read as "nothing has happened".
 */
export function ComputerActionTimeline({ agentId }: { agentId: string }) {
  const me = useQuery(currentUserQueryOptions());
  const admin = me.data?.role === "admin";
  const events = useQuery({
    ...auditEventsQueryOptions(
      `?targetType=computer&targetId=${encodeURIComponent(agentId)}&limit=20`,
    ),
    enabled: admin,
  });

  if (me.isPending) return null;
  if (!admin) {
    return (
      <p className="text-muted-foreground text-xs">
        The full action trail is in the admin audit log, which is an
        administrator view.
      </p>
    );
  }
  if (events.isPending) return <LoadingState label="Reading the trail…" />;
  if (events.isError) {
    return <ErrorState>The action trail could not be loaded.</ErrorState>;
  }
  const rows = (events.data.events ?? []) as AuditEvent[];
  if (rows.length === 0) {
    return (
      <EmptyState
        className="py-6"
        title="Nothing recorded yet."
        description="Every action this Bot takes on its computer is recorded here as it happens."
      />
    );
  }
  // Newest first: the trail answers "what did it just do", and the newest row is the answer.
  return (
    <ul className="min-w-0">
      {rows.map((event) => (
        <TrailRow event={event} key={event.id} />
      ))}
    </ul>
  );
}

function TrailRow({ event }: { event: AuditEvent }) {
  const payload = event.payload ?? {};
  const outcome = outcomeOf(event.eventType);
  const stopped = event.eventType === "computer.action_stopped";
  const label =
    outcome === "refused"
      ? "Blocked"
      : stopped
        ? "Stopped"
        : outcome === "did-not-happen"
          ? "Did not happen"
          : "Allowed";
  return (
    <li className="border-border/60 border-b py-2 text-xs last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {new Date(event.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
        <span className="min-w-0 break-all">
          {typeof payload.action === "string"
            ? payload.action.replace("computer_", "")
            : event.eventType}
        </span>
        <span
          className={`ml-auto shrink-0 font-medium ${
            outcome === "refused"
              ? "text-destructive"
              : outcome === "did-not-happen"
                ? "text-amber-600 dark:text-amber-500"
                : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      {/*
        The subject, when the row names one: a command run, a file touched, or the page the action
        happened on. Same fields the admin audit table reads, at this panel's own size.
      */}
      {typeof payload.command === "string" ||
      typeof payload.file === "string" ||
      typeof payload.page === "string" ? (
        <p className="mt-0.5 truncate pl-2 font-mono text-[11px] text-muted-foreground">
          {typeof payload.command === "string"
            ? payload.command
            : typeof payload.file === "string"
              ? payload.file
              : hostOf(payload.page as string)}
        </p>
      ) : null}
    </li>
  );
}

/** The part of a page URL worth naming in a one-line trail row. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
