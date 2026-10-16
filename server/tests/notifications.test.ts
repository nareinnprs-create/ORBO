import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { inArray } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../src/auth/guards";
import { createDatabase, type Database } from "../src/db/client";
import { notifications } from "../src/db/schema";
import { users } from "../src/db/schema/core";
import {
  createNotificationRoutes,
  createNotificationStore,
  decodeNotificationCursor,
  encodeNotificationCursor,
  MAX_NOTIFICATIONS_PAGE,
  type NotificationQuery,
  type NotificationRecord,
  type NotificationStore,
} from "../src/notifications/routes";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Standalone notifications (W0 D9:A): list own rows, newest first.
 *
 * In-memory fakes only for the route contract: no live database (Docker is down) and
 * no leaking `mock.module`. The one Postgres-backed suite below stays skipped without
 * a reachable test database.
 */

const actor = {
  id: "user-1",
  email: "member@orbo.test",
  role: "user",
} as const;

function record(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  const createdAt = overrides.createdAt ?? new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "notification-1",
    ownerUserId: actor.id,
    taskId: null,
    title: "Change found",
    body: "A notification is ready.",
    read: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

type StoreCall = {
  ownerUserId: string;
  query: NotificationQuery;
};

/**
 * An in-memory stand-in with the store's own semantics: owner-scoped, newest first,
 * read-filtered, keyset-paged. That proves the route asks the right question — the
 * right owner, the right filter, the right page — without a live database.
 */
function fakeStore(
  rows: NotificationRecord[],
): NotificationStore & { calls: StoreCall[] } {
  const calls: StoreCall[] = [];
  return {
    calls,
    async list(ownerUserId, query = {}) {
      calls.push({ ownerUserId, query });
      const limit = Math.min(
        Math.max(query.limit ?? 50, 1),
        MAX_NOTIFICATIONS_PAGE,
      );
      const cursor = decodeNotificationCursor(query.cursor);
      const owned = rows
        .filter((row) => row.ownerUserId === ownerUserId)
        .filter((row) => query.read === undefined || row.read === query.read)
        .filter((row) => {
          if (!cursor) return true;
          const cursorTime = Date.parse(cursor.createdAt);
          const rowTime = row.createdAt.getTime();
          return (
            rowTime < cursorTime ||
            (rowTime === cursorTime && row.id < cursor.id)
          );
        })
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id),
        );
      const wanted = owned.slice(0, limit);
      const last = wanted.at(-1);
      return {
        notifications: wanted,
        nextCursor:
          owned.length > limit && last
            ? encodeNotificationCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      };
    },
  };
}

const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  context.set("actor", actor);
  await next();
};

const denied: MiddlewareHandler<{ Variables: AppVariables }> = (context) =>
  Promise.resolve(context.json({ error: "denied" }, 401));

function appFor(
  store: NotificationStore,
  middleware: MiddlewareHandler<{ Variables: AppVariables }> = requireUser,
) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/", createNotificationRoutes(store, middleware));
  return app;
}

async function json(response: Response) {
  return response.json();
}

describe("GET / notifications", () => {
  test("lists the caller's own notifications, newest first", async () => {
    const store = fakeStore([
      record({
        id: "old",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
        title: "Older",
      }),
      record({
        id: "new",
        createdAt: new Date("2026-09-02T00:00:00.000Z"),
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
        title: "Newer",
        taskId: "task-1",
        read: true,
      }),
    ]);
    const response = await appFor(store).request("http://orbo.test/");

    expect(response.status).toBe(200);
    const body = (await json(response)) as {
      notifications: { id: string }[];
      nextCursor: string | null;
    };
    expect(body.notifications.map((row) => row.id)).toEqual(["new", "old"]);
    expect(body.notifications[0]).toEqual({
      id: "new",
      taskId: "task-1",
      title: "Newer",
      body: "A notification is ready.",
      read: true,
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(body.nextCursor).toBeNull();
    expect(store.calls).toEqual([{ ownerUserId: actor.id, query: {} }]);
  });

  test("another person's rows are never listed: owner-scoping stays in the store", async () => {
    const store = fakeStore([
      record({ id: "mine", ownerUserId: actor.id }),
      record({ id: "theirs", ownerUserId: "user-2" }),
    ]);
    const response = await appFor(store).request("http://orbo.test/");

    expect(response.status).toBe(200);
    const body = (await json(response)) as { notifications: { id: string }[] };
    expect(body.notifications.map((row) => row.id)).toEqual(["mine"]);
    expect(store.calls).toEqual([{ ownerUserId: actor.id, query: {} }]);
  });

  test("filters read and unread, and absent means both", async () => {
    const rows = [
      record({ id: "read-1", read: true }),
      record({ id: "unread-1", read: false }),
    ];
    const readBody = (await json(
      await appFor(fakeStore(rows)).request("http://orbo.test/?read=true"),
    )) as { notifications: { id: string }[] };
    expect(readBody.notifications.map((row) => row.id)).toEqual(["read-1"]);

    const unreadBody = (await json(
      await appFor(fakeStore(rows)).request("http://orbo.test/?read=false"),
    )) as { notifications: { id: string }[] };
    expect(unreadBody.notifications.map((row) => row.id)).toEqual(["unread-1"]);

    const allExplicit = (await json(
      await appFor(fakeStore(rows)).request("http://orbo.test/?read=all"),
    )) as { notifications: { id: string }[] };
    expect(allExplicit.notifications).toHaveLength(2);

    const absent = (await json(
      await appFor(fakeStore(rows)).request("http://orbo.test/"),
    )) as { notifications: { id: string }[] };
    expect(absent.notifications).toHaveLength(2);
  });

  test("rejects a bogus read filter with 400, before the store is asked", async () => {
    const store = fakeStore([record()]);
    const response = await appFor(store).request("http://orbo.test/?read=yes");

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: 'Query parameter "read" must be "true", "false", or "all".',
    });
    expect(store.calls).toEqual([]);
  });

  test("pages with limit and cursor, ending with a null cursor", async () => {
    const rows = [
      record({ id: "n-3", createdAt: new Date("2026-09-03T00:00:00.000Z") }),
      record({ id: "n-2", createdAt: new Date("2026-09-02T00:00:00.000Z") }),
      record({ id: "n-1", createdAt: new Date("2026-09-01T00:00:00.000Z") }),
    ];
    const app = appFor(fakeStore(rows));
    const first = (await json(
      await app.request("http://orbo.test/?limit=2"),
    )) as { notifications: { id: string }[]; nextCursor: string | null };
    expect(first.notifications.map((row) => row.id)).toEqual(["n-3", "n-2"]);
    expect(typeof first.nextCursor).toBe("string");

    const second = (await json(
      await app.request(
        `http://orbo.test/?limit=2&cursor=${encodeURIComponent(first.nextCursor as string)}`,
      ),
    )) as { notifications: { id: string }[]; nextCursor: string | null };
    expect(second.notifications.map((row) => row.id)).toEqual(["n-1"]);
    expect(second.nextCursor).toBeNull();
  });

  test.each([["12abc"], ["3.9"], ["-5"], ["0x10"]])(
    "refuses a coerced limit with 400: %p",
    async (raw) => {
      const store = fakeStore([record()]);
      const response = await appFor(store).request(
        `http://orbo.test/?limit=${encodeURIComponent(raw)}`,
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        error: 'Query parameter "limit" must be a positive integer.',
      });
      expect(store.calls).toEqual([]);
    },
  );

  test("reads a garbage cursor as the first page", async () => {
    const store = fakeStore([record({ id: "only" })]);
    const response = await appFor(store).request(
      "http://orbo.test/?cursor=%%%",
    );

    expect(response.status).toBe(200);
    const body = (await json(response)) as { notifications: { id: string }[] };
    expect(body.notifications.map((row) => row.id)).toEqual(["only"]);
  });

  test("refuses without a session, before the store is asked", async () => {
    const store = fakeStore([record()]);
    const response = await appFor(store, denied).request("http://orbo.test/");

    expect(response.status).toBe(401);
    expect(store.calls).toEqual([]);
  });
});

describe("notification cursor", () => {
  test("round-trips a cursor to the microsecond", () => {
    const cursor = {
      createdAt: "2026-09-01T00:00:00.123456Z",
      id: "notification-1",
    };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor,
    );
  });

  test("reads garbage, undefined and a non-date as the first page", () => {
    expect(decodeNotificationCursor("%%%")).toBeUndefined();
    expect(decodeNotificationCursor(undefined)).toBeUndefined();
    expect(
      decodeNotificationCursor(
        Buffer.from(
          JSON.stringify({ createdAt: "not-a-date", id: "n-1" }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeUndefined();
  });
});

// Requires live Postgres via Docker/CI — skipped cleanly without one.
function canConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

let cachedUrl: string | null = null;
try {
  cachedUrl = testDatabaseUrl();
} catch {
  // No test database configured: the suite below stays skipped.
  cachedUrl = null;
}

let livePostgres = false;
if (cachedUrl) {
  try {
    const url = new URL(cachedUrl);
    livePostgres = await canConnect(
      url.hostname || "localhost",
      url.port ? Number(url.port) : 5432,
      2_000,
    );
  } catch {
    // Unparseable test URL: the suite below stays skipped.
    livePostgres = false;
  }
}

describe.skipIf(!livePostgres)("notification store (Postgres)", () => {
  let database: Database;
  const prefix = `notifications-${randomUUID()}`;
  const owner = `${prefix}-owner`;
  const stranger = `${prefix}-stranger`;

  test("lists one owner's rows newest first, with read filter and pages", async () => {
    database = createDatabase(testDatabaseUrl(), TEST_POOL);
    await database.insert(users).values([
      { id: owner, email: `${prefix}-owner@orbo.test` },
      { id: stranger, email: `${prefix}-stranger@orbo.test` },
    ]);
    await database.insert(notifications).values([
      {
        id: `${prefix}-old`,
        ownerUserId: owner,
        title: "Older",
        body: "older body",
        read: true,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        id: `${prefix}-new`,
        ownerUserId: owner,
        taskId: "task-1",
        title: "Newer",
        body: "newer body",
        read: false,
        createdAt: new Date("2026-09-02T00:00:00.000Z"),
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
      },
      {
        id: `${prefix}-theirs`,
        ownerUserId: stranger,
        title: "Theirs",
        body: "somebody else",
        read: false,
        createdAt: new Date("2026-09-03T00:00:00.000Z"),
        updatedAt: new Date("2026-09-03T00:00:00.000Z"),
      },
    ]);
    try {
      const store = createNotificationStore(database);

      const all = await store.list(owner);
      expect(all.notifications.map((row) => row.id)).toEqual([
        `${prefix}-new`,
        `${prefix}-old`,
      ]);
      expect(all.nextCursor).toBeNull();

      const unread = await store.list(owner, { read: false });
      expect(unread.notifications.map((row) => row.id)).toEqual([
        `${prefix}-new`,
      ]);

      const first = await store.list(owner, { limit: 1 });
      expect(first.notifications.map((row) => row.id)).toEqual([
        `${prefix}-new`,
      ]);
      expect(typeof first.nextCursor).toBe("string");
      const second = await store.list(owner, {
        limit: 1,
        cursor: first.nextCursor as string,
      });
      expect(second.notifications.map((row) => row.id)).toEqual([
        `${prefix}-old`,
      ]);
      expect(second.nextCursor).toBeNull();
    } finally {
      await database
        .delete(notifications)
        .where(inArray(notifications.ownerUserId, [owner, stranger]));
      await database.delete(users).where(inArray(users.id, [owner, stranger]));
    }
  });
});
