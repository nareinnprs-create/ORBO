import { describe, expect, test } from "bun:test";
import { testDatabaseUrlFrom } from "./database";

describe("TEST_DATABASE_URL", () => {
  test("requires an explicit test database URL", () => {
    expect(() => testDatabaseUrlFrom({})).toThrow(/TEST_DATABASE_URL/);
  });

  test("refuses the live development database even when DATABASE_URL names it", () => {
    expect(() =>
      testDatabaseUrlFrom({
        TEST_DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo",
        DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo_test",
      }),
    ).toThrow(/live orbo database/);
  });

  test("does not read DATABASE_URL as a fallback", () => {
    expect(() =>
      testDatabaseUrlFrom({
        DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo_test",
      }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  test("accepts a dedicated test database", () => {
    expect(
      testDatabaseUrlFrom({
        TEST_DATABASE_URL: "postgres://orbo:orbo@localhost:5432/orbo_test",
      }),
    ).toBe("postgres://orbo:orbo@localhost:5432/orbo_test");
  });
});
