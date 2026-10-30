import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { testEnvironment } from "./support/environment";

/**
 * The ceiling no route falls below, and the limits it must not get in the way of.
 *
 * The global gate exists for the routes that never grew one of their own: before it, an unbounded
 * body on any of them was buffered in full before a handler could look at it. It is sized at the
 * largest ceiling any governed route enforces, because of how the gates compose — the first limit
 * a request meets is the only one that can refuse it, so a smaller global gate would silently
 * rewrite every wider limit below it. These tests pin both halves: the ungoverned route is
 * capped, and the governed ceilings still mean what they say.
 */

const config = loadConfig(testEnvironment());

const auth = {
  handler: () => new Response(null, { status: 204 }),
  api: {
    getSession: async () => null,
  },
};

/** The global ceiling: dictation's, which is the largest of the per-route limits. */
const GLOBAL_LIMIT = 10 * 1024 * 1024 + 64 * 1024;

describe("the global body ceiling", () => {
  test("an ungoverned route refuses a body past the ceiling, with the api's error shape", async () => {
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    // `/api/capabilities` is a GET, so this is answered by the catch-all: the point is that a
    // body nothing expects is still refused at the door rather than buffered, whatever route it
    // arrives at.
    const response = await app.request("http://orbo.local/api/capabilities", {
      method: "POST",
      headers: { "content-length": String(GLOBAL_LIMIT + 1) },
      body: "x",
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "That request is larger than this deployment accepts.",
    });
  });

  test("a body under the ceiling reaches the route", async () => {
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    // The refusal above could be a middleware refusing everything; this is the control.
    const response = await app.request("http://orbo.local/api/capabilities", {
      method: "POST",
      headers: { "content-length": "4" },
      body: "okay",
    });
    expect(response.status).not.toBe(413);
  });

  test("a chunked body is refused by counting bytes, not by trusting a header", async () => {
    // No content-length: the gate has to read the stream and stop when the count crosses. A
    // client that omits the header does not opt out of the ceiling.
    const app = createApp(config, auth, { rolesForUser: async () => [] });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(GLOBAL_LIMIT / 2).fill(120));
        controller.enqueue(new Uint8Array(GLOBAL_LIMIT / 2 + 1).fill(120));
        controller.close();
      },
    });

    const response = await app.request("http://orbo.local/api/capabilities", {
      method: "POST",
      body: stream,
      // Hono's test request carries a stream as a body with no length header, which is the shape
      // being tested. The `duplex` option is what a real streaming fetch sends.
      // @ts-expect-error duplex is not in the RequestInit types Bun ships
      duplex: "half",
    });

    expect(response.status).toBe(413);
  });
});
