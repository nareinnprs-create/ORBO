import { and, desc, eq, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { notifications } from "../db/schema";
import { parsePageLimit } from "../paging";

/**
 * Standalone notifications (W0 D9:A; 01 §5).
 *
 * What happened, newest first: watch/monitor firings and task-done fan-out land here.
 * Suggestions answer "what should I consider" and keep their own open/dismissed/started
 * vocabulary; these rows carry firings and receipts. Read-only in this slice: watches stay
 * quiet per 29 N9, so nothing here writes fan-out, and there is no UI.
 *
 * Owner-scoped through the store on every read, never by filtering a broader read
 * afterwards: `list` takes the caller's id and answers as if another person's rows do
 * not exist.
 */
export type NotificationRecord = {
  id: string;
  ownerUserId: string;
  taskId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationDto = {
  id: string;
  taskId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One page of somebody's notifications, newest first, and whether there is another. */
export type NotificationPage = {
  notifications: NotificationRecord[];
  /** Where the next page starts, or null at the end. */
  nextCursor: string | null;
};

/** What a page request may ask for. */
export type NotificationQuery = {
  /** From a previous page's `nextCursor`. */
  cursor?: string;
  limit?: number;
  /** True for read only, false for unread only, absent for both. */
  read?: boolean;
};

export type NotificationStore = {
  /** One page of one person's notifications, newest first. */
  list: (
    ownerUserId: string,
    query?: NotificationQuery,
  ) => Promise<NotificationPage>;
};

/** How many notifications a page holds when the caller does not say. */
const DEFAULT_NOTIFICATIONS_PAGE = 50;

/**
 * The most a caller may ask for in one page.
 *
 * A ceiling rather than a suggestion, because the limit arrives over HTTP and the whole
 * point of paging is that no single request can be made to read the whole table.
 *
 * Exported so the route parses against the same ceiling the store enforces, rather than
 * the two drifting apart unnoticed.
 */
export const MAX_NOTIFICATIONS_PAGE = 100;

/** Where a page stopped: every part of the sort, in sort order. */
type NotificationCursor = { createdAt: string; id: string };

/** The shape the encoder writes: UTC, to the millisecond or the microsecond. */
const CURSOR_CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Read a cursor a client sent back.
 *
 * A malformed one is treated as no cursor rather than as an error: it means the first
 * page, which is a sensible answer to a stale or hand-edited link, and there is nothing
 * here worth refusing over. A well-formed cursor carrying a non-date `createdAt` falls
 * back the same way instead of reaching `::timestamptz` in SQL and answering 500.
 *
 * Exported for regression tests.
 */
export function decodeNotificationCursor(
  value: string | undefined,
): NotificationCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as NotificationCursor;
    return typeof parsed?.id === "string" &&
      typeof parsed?.createdAt === "string" &&
      CURSOR_CREATED_AT.test(parsed.createdAt) &&
      !Number.isNaN(Date.parse(parsed.createdAt))
      ? { createdAt: parsed.createdAt, id: parsed.id }
      : undefined;
  } catch {
    return undefined;
  }
}

export const NOTIFICATION_READ_ERROR =
  'Query parameter "read" must be "true", "false", or "all".';

/**
 * A read/unread filter from a `?read=` query param, parsed strictly.
 *
 * Absent or blank means the caller did not ask, and both read and unread rows answer.
 * `"all"` says the same thing explicitly. `"true"` keeps read rows only, `"false"`
 * keeps unread rows only. Anything else is a caller error and answers 400 naming the
 * parameter, like `?limit=` already does.
 */
export function parseNotificationRead(
  raw: string | null,
): { ok: true; read?: boolean } | { ok: false; error: string } {
  if (raw === null || raw.trim() === "") return { ok: true };
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "true") return { ok: true, read: true };
  if (trimmed === "false") return { ok: true, read: false };
  if (trimmed === "all") return { ok: true };
  return { ok: false, error: NOTIFICATION_READ_ERROR };
}

export function createNotificationStore(database: Database): NotificationStore {
  async function list(
    ownerUserId: string,
    query: NotificationQuery = {},
  ): Promise<NotificationPage> {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_NOTIFICATIONS_PAGE, 1),
      MAX_NOTIFICATIONS_PAGE,
    );
    const cursor = decodeNotificationCursor(query.cursor);

    const conditions = [eq(notifications.ownerUserId, ownerUserId)];
    if (query.read !== undefined) {
      conditions.push(eq(notifications.read, query.read));
    }
    if (cursor) {
      // One row comparison over the whole sort key, which only reads as "everything
      // after the cursor" because every part of that key descends.
      conditions.push(
        sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`,
      );
    }

    const rows = await database
      .select({
        id: notifications.id,
        ownerUserId: notifications.ownerUserId,
        taskId: notifications.taskId,
        title: notifications.title,
        body: notifications.body,
        read: notifications.read,
        createdAt: notifications.createdAt,
        updatedAt: notifications.updatedAt,
        /*
         * The row's own timestamp to the microsecond, for the cursor only.
         *
         * `created_at` keeps microseconds and a `Date` keeps milliseconds, so a cursor
         * made from `createdAt` named a moment just before the row it came from. The rows
         * the next page should have started with, written earlier in that same millisecond
         * or at the same instant, then compared as newer than the cursor and were on no
         * page at all.
         */
        cursorCreatedAt: sql<string>`to_char(${notifications.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      // One more than asked for, so "is there another page" needs no second count query.
      .limit(limit + 1);

    const wanted = rows.slice(0, limit);
    const last = wanted.at(-1);
    return {
      notifications: wanted.map(({ cursorCreatedAt: _cursorOnly, ...row }) => ({
        ...row,
        taskId: row.taskId ?? null,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeNotificationCursor({
              createdAt: last.cursorCreatedAt,
              id: last.id,
            })
          : null,
    };
  }

  return { list };
}

function notificationDto(row: NotificationRecord): NotificationDto {
  return {
    id: row.id,
    taskId: row.taskId ?? null,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `GET /api/notifications`: the caller's own notifications, newest first.
 *
 * Query params: `?read=true|false|all` (absent means both), `?limit=` (parsed strictly
 * by `paging.ts`, clamped into `1..MAX_NOTIFICATIONS_PAGE`), `?cursor=` (a previous
 * page's `nextCursor`; malformed means the first page). Answers
 * `{ notifications, nextCursor }`; a bad `limit` or `read` answers 400 naming the
 * parameter. No fan-out writing here: watches stay quiet per 29 N9.
 */
export function createNotificationRoutes(
  store: NotificationStore,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get("/", requireUser, async (context) => {
    const url = new URL(context.req.url);
    /*
     * Parsed strictly, not coerced: `Number.parseInt` reads `"12abc"` as 12 and `"3.9"`
     * as 3, so a typo silently returned the wrong page. A run of digits is clamped into
     * range like the store already does; anything else is a 400 naming the parameter.
     */
    const parsedLimit = parsePageLimit(
      url.searchParams.get("limit"),
      MAX_NOTIFICATIONS_PAGE,
    );
    if (!parsedLimit.ok) {
      return context.json({ error: parsedLimit.error }, 400);
    }
    const parsedRead = parseNotificationRead(url.searchParams.get("read"));
    if (!parsedRead.ok) {
      return context.json({ error: parsedRead.error }, 400);
    }

    const page = await store.list(context.var.actor.id, {
      ...(url.searchParams.get("cursor")
        ? { cursor: url.searchParams.get("cursor") as string }
        : {}),
      ...(parsedLimit.limit !== undefined ? { limit: parsedLimit.limit } : {}),
      ...(parsedRead.read !== undefined ? { read: parsedRead.read } : {}),
    });

    return context.json({
      notifications: page.notifications.map(notificationDto),
      nextCursor: page.nextCursor,
    });
  });

  return routes;
}
