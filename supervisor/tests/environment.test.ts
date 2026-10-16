import { describe, expect, test } from "bun:test";
import { environmentFor } from "../src/environment";

describe("what the supervisor tells a computer about its browser", () => {
  test("passes the deployment's browser mode to every per-Bot computer", () => {
    expect(
      environmentFor("invoice-collector", {
        ORBO_COMPUTER_TOKEN: "secret",
        ORBO_COMPUTER_BROWSER_MODE: "headed",
      }),
    ).toEqual([
      "ORBO_COMPUTER_BOT_ID=invoice-collector",
      "ORBO_COMPUTER_TOKEN=secret",
      "ORBO_COMPUTER_BROWSER_MODE=headed",
    ]);
  });

  test("does not invent a browser mode when the deployment left it unset", () => {
    expect(
      environmentFor("invoice-collector", { ORBO_COMPUTER_TOKEN: "secret" }),
    ).toEqual([
      "ORBO_COMPUTER_BOT_ID=invoice-collector",
      "ORBO_COMPUTER_TOKEN=secret",
    ]);
  });
});
