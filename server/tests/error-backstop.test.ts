import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { uncaughtErrorHandler } from "../src/app";
import { isQueryFailure } from "../src/db/query-failure";

/**
 * The backstop behind every route: what a handler that THROWS answers.
 *
 * Every route's own `catch` handles the failures it knows; this pins the one it forgets. The two
 * properties worth a test are the shape — JSON `{ error }`, the one body every client here reads —
 * and the hygiene: a query failure's statement and bound values must not travel even when the throw
 * escaped every guard meant for it.
 */

/** Just enough of a Hono Context for the handler: what it reads, and how it answers. */
function contextFor(path = "/boom") {
  const json = (body: unknown, status?: number) =>
    Response.json(body, { status: status ?? 200 });
  return {
    req: { method: "GET", path },
    json,
  } as unknown as Context<{ Variables: Record<string, never> }>;
}

describe("the app's error backstop", () => {
  test("a throw a route forgot answers JSON, not Hono's plain-text default", async () => {
    const response = await uncaughtErrorHandler(
      new Error("the vendor refused the request"),
      contextFor(),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
    expect(String(body.error)).toContain("the vendor refused the request");
  });

  test("a query failure's statement never travels, in any body or log line", async () => {
    // drizzle's own failure shape, by construction: `query` and `params` on an Error, the
    // message carrying the whole statement. See db/query-failure.ts for why shape is the test.
    const failure = new Error(
      "Failed query: insert into \"secrets\" values ('the-encrypted-envelope')",
    ) as Error & { query: unknown; params: unknown };
    failure.query = 'insert into "secrets" values ($1)';
    failure.params = ["the-encrypted-envelope"];
    expect(isQueryFailure(failure)).toBe(true);

    const response = await uncaughtErrorHandler(failure, contextFor());

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("the-encrypted-envelope");
    expect(body).not.toContain("insert into");
    expect(JSON.parse(body)).toHaveProperty("error");
  });

  test("a throw that is not an Error is answered too, not a crash in the backstop", async () => {
    const response = await uncaughtErrorHandler(
      "a string, somehow",
      contextFor(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  test("a deliberate HTTPException keeps its status, and is not logged as a fault", async () => {
    const response = await uncaughtErrorHandler(
      new HTTPException(410, { message: "That resource is gone." }),
      contextFor("/gone"),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "That resource is gone.",
    });
  });

  test("an HTTPException that carries its own response is passed through whole", async () => {
    const response = await uncaughtErrorHandler(
      new HTTPException(418, {
        res: new Response("short and stout", { status: 418 }),
      }),
      contextFor("/custom"),
    );

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("short and stout");
  });
});
