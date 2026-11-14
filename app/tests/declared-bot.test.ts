import { describe, expect, test } from "bun:test";
import {
  botPollInterval,
  declaredBotId,
  isPlaceholderBot,
} from "../src/lib/copilot/active-bot";

/**
 * The placeholder Bot id is a routing convenience, not a Bot. Anything that would ask the server
 * about it must be told there is nothing to ask about.
 */

describe("declaredBotId", () => {
  test("returns undefined for the placeholder", () => {
    expect(declaredBotId("default")).toBeUndefined();
  });

  test("passes a declared Bot through", () => {
    expect(declaredBotId("general-assistant")).toBe("general-assistant");
  });

  test("passes a Bot through even when the placeholder is its prefix", () => {
    expect(declaredBotId("default-2")).toBe("default-2");
  });
});

describe("isPlaceholderBot", () => {
  test("names the placeholder, not any other id", () => {
    expect(isPlaceholderBot("default")).toBe(true);
    expect(isPlaceholderBot("default-2")).toBe(false);
    expect(isPlaceholderBot("general-assistant")).toBe(false);
    expect(isPlaceholderBot("")).toBe(false);
  });
});

describe("botPollInterval", () => {
  test("keeps the usual cadence while the Bot has answered, placeholder-free or not", () => {
    const interval = botPollInterval(5_000);
    expect(interval({ state: { data: ["a"], error: null } })).toBe(5_000);
    // Data on file keeps its usual interval through a failed refetch too: TanStack keeps the last
    // good snapshot across those, and the next poll is not a predicted miss.
    expect(interval({ state: { data: ["a"], error: new Error("404") } })).toBe(
      5_000,
    );
  });

  test("backs a never-answered failing poll off", () => {
    const interval = botPollInterval(5_000);
    const backed = interval({
      state: { data: undefined, error: new Error("404") },
    });
    expect(backed).not.toBe(5_000);
    expect(backed).toBeGreaterThan(60_000);
  });

  test("keeps the usual cadence while the poll has not failed yet", () => {
    const interval = botPollInterval(15_000);
    expect(interval({ state: { data: undefined, error: null } })).toBe(15_000);
  });
});
