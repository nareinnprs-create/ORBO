import { describe, expect, test } from "bun:test";
import {
  actsOnTheComputer,
  isOpenPath,
  matchesToken,
  offeredToken,
  STREAM_AUTH_DEADLINE_MS,
  streamAuthToken,
} from "../src/authorisation";

/**
 * The check that stands in front of a Bot's browser.
 *
 * Every case here is one that was reachable before it existed: taking the wheel, navigating a live
 * page, listing the Bot's files, with no sign-in and no audit row.
 */

const SECRET = "a-long-development-secret";

describe("matching the secret", () => {
  test("the right secret is accepted", () => {
    expect(matchesToken(SECRET, SECRET)).toBeTrue();
  });

  test("a wrong secret of the same length is refused", () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);
    expect(matchesToken(SECRET, wrong)).toBeFalse();
  });

  test("a correct prefix is refused", () => {
    // The case the constant-time comparison exists for: guessing forwards must not get warmer.
    expect(matchesToken(SECRET, SECRET.slice(0, 5))).toBeFalse();
  });

  test("an empty offer is refused", () => {
    expect(matchesToken(SECRET, "")).toBeFalse();
  });

  test("an empty EXPECTED secret refuses everything, including an empty offer", () => {
    // A computer that came up without a secret must be unreachable rather than open to anybody who
    // also sends nothing, which is what a plain equality check would have done.
    expect(matchesToken("", "")).toBeFalse();
    expect(matchesToken("", "anything")).toBeFalse();
  });
});

describe("finding the secret a caller offered", () => {
  const url = (path: string) => new URL(`http://computer.test${path}`);

  test("a header", () => {
    const headers = new Headers({ "x-orbo-computer-token": SECRET });
    expect(offeredToken(headers, url("/snapshot"))).toBe(SECRET);
  });

  test("a bearer token", () => {
    const headers = new Headers({ authorization: `Bearer ${SECRET}` });
    expect(offeredToken(headers, url("/snapshot"))).toBe(SECRET);
  });

  test("the stream takes it from the query, because an upgrade carries no headers", () => {
    const headers = new Headers();
    expect(offeredToken(headers, url(`/stream?bot=b&token=${SECRET}`))).toBe(
      SECRET,
    );
  });

  test("the stream does NOT accept a header instead", () => {
    // Not a restriction that matters for security, both are checked against the same secret, but
    // the socket has one way in, and a surface that sent the header would fail loudly rather than
    // appearing to work until somebody looked.
    const headers = new Headers({ "x-orbo-computer-token": SECRET });
    expect(offeredToken(headers, url("/stream?bot=b"))).toBe("");
  });

  test("nothing offered is an empty string, not a crash", () => {
    expect(offeredToken(new Headers(), url("/snapshot"))).toBe("");
  });
});

/**
 * The first message IS the credential, for a stream that upgraded without a query token.
 *
 * This is the path the server proxy prefers, precisely because a token in a URL lands in access
 * logs where a websocket message does not. The frame's shape is a contract between two processes
 * changed together, so it is pinned here literally: `{"type":"auth","token":<the secret>}`, and
 * nothing else — not an input that arrived early, not a near miss — reads as one.
 */
describe("the stream's first-message auth frame", () => {
  test("an auth frame yields its token", () => {
    expect(streamAuthToken({ type: "auth", token: SECRET })).toBe(SECRET);
  });

  test.each([
    ["an input that arrived ahead of it", { type: "pointer-move", x: 1, y: 2 }],
    ["the wrong type", { type: "login", token: SECRET }],
    ["a frame with no token", { type: "auth" }],
    ["a token that is not a string", { type: "auth", token: 42 }],
    ["an array", ["auth", SECRET]],
    ["a string", "auth"],
    ["nothing at all", null],
  ])("refuses %p", (_name, message) => {
    expect(streamAuthToken(message)).toBeNull();
  });

  test("an unparseable message is refused by the caller's catch, and parses to nothing here", () => {
    // The handler wraps JSON.parse itself; this pins that a valid-JSON-but-wrong frame can never
    // authenticate, which is the part of that wrapping worth a test.
    expect(streamAuthToken(JSON.parse('{"type":"auth","token":""}'))).toBe("");
    // An empty token then fails `matchesToken` (an empty expected secret refuses everything), so
    // "" can only ever end in a refusal.
    expect(
      matchesToken(SECRET, streamAuthToken({ type: "auth", token: "" }) ?? ""),
    ).toBeFalse();
  });

  test("the deadline a socket has to present its token is bounded", () => {
    // A connection that presents nothing must go away on its own, not hold the process open.
    expect(STREAM_AUTH_DEADLINE_MS).toBeGreaterThan(0);
    expect(STREAM_AUTH_DEADLINE_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("what an unauthenticated caller may reach", () => {
  test("health, and nothing else", () => {
    expect(isOpenPath("/health")).toBeTrue();
    for (const path of [
      "/control/take",
      "/navigate",
      "/snapshot",
      "/files/list",
      "/files/read",
      "/files/download",
      "/stream",
      "/live",
      "/",
    ]) {
      expect(isOpenPath(path)).toBeFalse();
    }
  });
});

/**
 * Which paths the wheel stops.
 *
 * A person takes the wheel at a login wall precisely because they no longer want the Bot acting, and
 * `control.ts` states the property outright: "While a person holds control every acting call from the
 * Bot is refused". That was true of the page from the start and untrue of the shell, which arrived
 * later (#62) and was never wired to the wheel, so a Bot could run a command and rewrite the
 * workspace underneath somebody mid-sign-in.
 *
 * The list lives here, beside the other path decision, rather than in `index.ts`, for the reason the
 * header of this file gives: a decision next to `chromium.launch()` cannot be tested without Chrome.
 *
 * Reading is not acting. `/files/read` and `/files/list` stay open so a Bot waiting to be handed the
 * wheel back can still say what it was doing.
 */
describe("what the wheel stops while a person is driving", () => {
  test("every path that acts on the computer, the shell and a workspace write included", () => {
    for (const path of [
      "/navigate",
      "/click",
      "/type",
      "/key",
      "/scroll",
      "/exec",
      "/files/write",
    ]) {
      expect(actsOnTheComputer(path)).toBeTrue();
    }
  });

  test("reading, looking and the handover itself are not acting", () => {
    for (const path of [
      "/files/read",
      "/files/list",
      "/snapshot",
      "/screenshot",
      "/health",
      "/control",
      "/control/take",
      "/control/release",
      "/stream",
    ]) {
      expect(actsOnTheComputer(path)).toBeFalse();
    }
  });
});
