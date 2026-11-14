import { describe, expect, test } from "bun:test";
import { refuseDevelopmentTokens } from "../src/development-tokens";

/**
 * The printed tokens, at the process that holds the Docker socket.
 *
 * The supervisor's token guards four verbs over the engine socket, which is root on the host by
 * another name; the computer token it forwards rides into every container it creates. Both are in
 * the repository. These tests pin the line this file draws: production refuses, everything else
 * warns and runs, and a value that only looks like one of them is somebody's real secret.
 */
describe("the supervisor refuses the printed tokens in production", () => {
  test("the supervisor token is refused under NODE_ENV=production", () => {
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: "production",
        SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
        ORBO_COMPUTER_TOKEN: "a-real-computer-token",
      }),
    ).toThrow(/SUPERVISOR_TOKEN/);
  });

  test("the computer token is refused under NODE_ENV=production", () => {
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: "production",
        SUPERVISOR_TOKEN: "a-real-supervisor-token",
        ORBO_COMPUTER_TOKEN: "orbo-dev-computer-token",
      }),
    ).toThrow(/ORBO_COMPUTER_TOKEN/);
  });

  test("a real value is accepted under the same conditions", () => {
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: "production",
        SUPERVISOR_TOKEN: "a-real-supervisor-token",
        ORBO_COMPUTER_TOKEN: "a-real-computer-token",
      }),
    ).not.toThrow();
  });

  test("each refusal names its variable, so the fix is in the message", () => {
    for (const [name, token] of [
      ["SUPERVISOR_TOKEN", "orbo-dev-supervisor-token"],
      ["ORBO_COMPUTER_TOKEN", "orbo-dev-computer-token"],
    ] as const) {
      try {
        refuseDevelopmentTokens({ NODE_ENV: "production", [name]: token });
        throw new Error("expected a refusal");
      } catch (error) {
        expect(String(error)).toContain(name);
      }
    }
  });
});

describe("the printed tokens are only a warning off the laptop", () => {
  test("the defaults the install scripts generate are accepted", () => {
    expect(() =>
      refuseDevelopmentTokens({
        SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
        ORBO_COMPUTER_TOKEN: "orbo-dev-computer-token",
      }),
    ).not.toThrow();
  });

  test("a padded token is trimmed before it is judged", () => {
    // The supervisor trims every value it reads (`index.ts`), so a `.env` that carried spaces
    // around the printed token must not read as a real secret here either.
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: "production ",
        SUPERVISOR_TOKEN: "  orbo-dev-supervisor-token  ",
      }),
    ).toThrow(/SUPERVISOR_TOKEN/);
  });

  test("NODE_ENV is compared the way the server compares it, trimmed", () => {
    // `NODE_ENV=production ` out of an env file is production, and the server's own gate says so
    // in so many words. This gate reads the same environment style.
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: " production",
        SUPERVISOR_TOKEN: "orbo-dev-supervisor-token",
      }),
    ).toThrow(/SUPERVISOR_TOKEN/);
  });

  test("no tokens at all is nothing to refuse", () => {
    expect(() => refuseDevelopmentTokens({})).not.toThrow();
  });

  test("a secret that merely starts like a printed token is somebody's secret", () => {
    expect(() =>
      refuseDevelopmentTokens({
        NODE_ENV: "production",
        SUPERVISOR_TOKEN: "orbo-dev-supervisor-token-rotated",
      }),
    ).not.toThrow();
  });
});
