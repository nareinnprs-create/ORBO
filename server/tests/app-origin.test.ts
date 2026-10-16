import { describe, expect, test } from "bun:test";

function resolveAppOrigins(
  appOrigin: string | undefined,
  nodeEnv: string | undefined,
): string[] | undefined {
  if (appOrigin)
    return appOrigin
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return nodeEnv === "development"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : undefined;
}

describe("application origin configuration", () => {
  test("allows both loopback browser origins by default in development", () => {
    expect(resolveAppOrigins(undefined, "development")).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  });

  test.each(["production", "test", undefined])(
    "preserves request-origin matching outside development (%s)",
    (nodeEnv) => {
      expect(resolveAppOrigins(undefined, nodeEnv)).toBeUndefined();
    },
  );

  test.each(["development", "production"])(
    "replaces defaults with an explicit single origin in %s",
    (nodeEnv) => {
      expect(resolveAppOrigins("https://dots.example", nodeEnv)).toEqual([
        "https://dots.example",
      ]);
    },
  );

  test("trims multiple origins and drops empty entries", () => {
    expect(
      resolveAppOrigins(
        " http://localhost:5173, ,http://127.0.0.1:5173, ",
        "development",
      ),
    ).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  test.each(["development", "production"])(
    "treats an empty value as unset in %s",
    (nodeEnv) => {
      expect(resolveAppOrigins("", nodeEnv)).toEqual(
        resolveAppOrigins(undefined, nodeEnv),
      );
    },
  );

  test.each([" ", ", ,"])(
    "keeps a nonempty all-blank list restrictive (%s)",
    (value) => {
      expect(resolveAppOrigins(value, "development")).toEqual([]);
    },
  );
});
