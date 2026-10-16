import { describe, expect, test } from "bun:test";
import { environmentFor } from "../src/environment";

/**
 * Whitespace-only `ORBO_COMPUTER_TOKEN` used to be forwarded verbatim while the child trims and then
 * exits, a boot crash loop from a value the supervisor accepted. Invalid `ORBO_COMPUTER_BROWSER_MODE`
 * was likewise forwarded to crash the child instead of failing fast here.
 */
describe("supervisor environment hardening", () => {
  test("omits a whitespace-only computer token", () => {
    expect(
      environmentFor("bot-1", {
        ORBO_COMPUTER_TOKEN: "   ",
        ORBO_COMPUTER_BROWSER_MODE: "headless",
      }),
    ).toEqual([
      "ORBO_COMPUTER_BOT_ID=bot-1",
      "ORBO_COMPUTER_BROWSER_MODE=headless",
    ]);
  });

  test("trims a padded token", () => {
    expect(
      environmentFor("bot-1", { ORBO_COMPUTER_TOKEN: "  secret  " }),
    ).toContain("ORBO_COMPUTER_TOKEN=secret");
  });

  test("refuses an invalid browser mode instead of forwarding it", () => {
    expect(() =>
      environmentFor("bot-1", {
        ORBO_COMPUTER_TOKEN: "s",
        ORBO_COMPUTER_BROWSER_MODE: "fullscreen",
      }),
    ).toThrow(/headless or headed/);
  });

  test("accepts both valid modes", () => {
    for (const mode of ["headless", "headed"]) {
      expect(
        environmentFor("bot-1", {
          ORBO_COMPUTER_TOKEN: "s",
          ORBO_COMPUTER_BROWSER_MODE: mode,
        }),
      ).toContain(`ORBO_COMPUTER_BROWSER_MODE=${mode}`);
    }
  });
});
