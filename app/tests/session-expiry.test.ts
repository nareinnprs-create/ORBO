import { afterEach, beforeEach, expect, test } from "bun:test";
import { MutationObserver } from "@tanstack/react-query";
import { isSessionPath, onSessionExpired } from "@/lib/auth/session-expiry";
import { client, RequestError } from "@/lib/client";
import { queryClient } from "@/query-client";

/**
 * What a dead session does, and what it must not.
 *
 * Before the global handler, a 401 was handled exactly once — by the auth gate's own `/api/me` —
 * and everywhere else it surfaced as an ordinary failed read while the app carried on pretending
 * the person was signed in. These cases pin the three parts: the paths whose 401 is an answer
 * rather than an expiry, the dedupe that keeps one dead session from firing a dozen redirects, and
 * the query and mutation caches, which signal through the same module `lib/client` does.
 *
 * The harness is this repository's (see `plugin-read-failure.test.tsx`): fetch replaced per test
 * and restored in `afterEach`, and the shared query client cleared between cases.
 */

const originalFetch = global.fetch;

/** The whole body matters here: the thrown sentence is the server's own. */
function notSignedIn() {
  return new Response(JSON.stringify({ error: "Not signed in." }), {
    headers: { "content-type": "application/json" },
    status: 401,
  });
}

function tick() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

let expired: number;

beforeEach(() => {
  expired = 0;
  onSessionExpired(() => {
    expired += 1;
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  queryClient.clear();
});

test("the paths that manage or report the session are not expiries", () => {
  expect(isSessionPath("/api/auth/sign-out")).toBe(true);
  expect(isSessionPath("/api/auth/sign-in/email")).toBe(true);
  expect(isSessionPath("/api/me")).toBe(true);
  expect(isSessionPath("/api/capabilities")).toBe(true);
  expect(isSessionPath("/api/channels")).toBe(false);
  expect(isSessionPath("/api/agents")).toBe(false);
});

test("a 401 from an ordinary read throws the server's sentence and signals the expiry", async () => {
  global.fetch = Object.assign(async () => notSignedIn(), {
    preconnect: originalFetch.preconnect,
  });

  const failure = client("/api/channels", "channels");
  await expect(failure).rejects.toBeInstanceOf(RequestError);
  await failure.catch((error: RequestError) => {
    expect(error.message).toBe("Not signed in.");
    expect(error.status).toBe(401);
    expect(error.path).toBe("/api/channels");
  });
  await tick();
  expect(expired).toBe(1);
});

test("a burst of 401s from one dying session signals the expiry once", async () => {
  global.fetch = Object.assign(async () => notSignedIn(), {
    preconnect: originalFetch.preconnect,
  });

  // What expiry actually looks like: every mounted query refetching at once, not one tidy failure.
  await Promise.allSettled([
    client("/api/channels", "channels"),
    client("/api/agents", "agents"),
    client("/api/plugins/connections", "connections"),
  ]);
  await tick();
  expect(expired).toBe(1);
});

test("a 401 from sign-out is an answer for its own flow, not an expiry", async () => {
  global.fetch = Object.assign(async () => notSignedIn(), {
    preconnect: originalFetch.preconnect,
  });

  await expect(
    client("/api/auth/sign-out", { method: "POST" }),
  ).rejects.toBeInstanceOf(RequestError);
  await tick();
  expect(expired).toBe(0);
});

test("the guard lifts once the redirect settles, so a later session still gets the treatment", async () => {
  global.fetch = Object.assign(async () => notSignedIn(), {
    preconnect: originalFetch.preconnect,
  });

  await expect(client("/api/channels", "channels")).rejects.toBeInstanceOf(
    RequestError,
  );
  await tick();
  expect(expired).toBe(1);

  // A second session, signed in and expired again some time later.
  await expect(client("/api/channels", "channels")).rejects.toBeInstanceOf(
    RequestError,
  );
  await tick();
  expect(expired).toBe(2);
});

test("the query cache signals a dead session carried by any 401-shaped error", async () => {
  // Thrown by hand rather than through `client`, so this case is about the cache handler alone:
  // `client` signalling on its own cannot prove the cache would.
  await expect(
    queryClient.fetchQuery({
      queryFn: async () => {
        throw new RequestError("Not signed in.", 401, "/api/bots");
      },
      queryKey: ["session-expiry", "query"],
      retry: false,
    }),
  ).rejects.toBeInstanceOf(RequestError);
  await tick();
  expect(expired).toBe(1);
});

test("the mutation cache signals a dead session the same way", async () => {
  const observer = new MutationObserver(queryClient, {
    mutationFn: async () => {
      throw new RequestError("Not signed in.", 401, "/api/bots");
    },
  });

  await expect(observer.mutate(undefined)).rejects.toBeInstanceOf(RequestError);
  await tick();
  expect(expired).toBe(1);
});

test("a non-401 failure in the caches is a failure where it happened, not an expiry", async () => {
  await expect(
    queryClient.fetchQuery({
      queryFn: async () => {
        throw new RequestError("Could not load bots.", 500, "/api/bots");
      },
      queryKey: ["session-expiry", "server-error"],
      retry: false,
    }),
  ).rejects.toBeInstanceOf(RequestError);
  await tick();

  const observer = new MutationObserver(queryClient, {
    mutationFn: async () => {
      throw new RequestError("Not signed in.", 401, "/api/auth/sign-out");
    },
  });
  await expect(observer.mutate(undefined)).rejects.toBeInstanceOf(RequestError);
  await tick();
  expect(expired).toBe(0);
});
