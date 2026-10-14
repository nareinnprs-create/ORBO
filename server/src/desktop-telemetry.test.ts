import { describe, expect, test } from "bun:test";
import { desktopTelemetryProperties } from "./desktop-telemetry";

describe("desktop runtime metadata", () => {
  test("leaves ordinary server deployments untagged", () => {
    expect(desktopTelemetryProperties({})).toEqual({});
    expect(desktopTelemetryProperties({ ORBO_DISTRIBUTION: "server" })).toEqual(
      {},
    );
  });

  test("carries only the shell's bounded metadata", () => {
    expect(
      desktopTelemetryProperties({
        ORBO_DISTRIBUTION: "desktop",
        ORBO_VERSION: "0.0.9",
        ORBO_PLATFORM: "macos",
        ORBO_ARCH: "aarch64",
        ORBO_OS_VERSION: "15.6.1",
        ORBO_ENGINE: "podman",
        OPENAI_API_KEY: "synthetic-secret",
        CPK_TELEMETRY_ID: "identity-belongs-in-the-transport",
        HOME: "/Users/private-name",
        ORBO_BASE_URL: "https://private.example",
      }),
    ).toEqual({
      orbo_distribution: "desktop",
      orbo_version: "0.0.9",
      orbo_platform: "macos",
      orbo_arch: "aarch64",
      orbo_os_version: "15.6.1",
      orbo_engine: "podman",
    });
  });

  test.each([
    "/Users/private-name",
    "private.example",
    "1.2-private-name",
    "1.2\nsecret",
    "1.2\n",
    "1.2.3.4.5",
    "1".repeat(40),
  ])("rejects arbitrary text in every metadata field: %s", (value) => {
    expect(
      desktopTelemetryProperties({
        ORBO_DISTRIBUTION: "desktop",
        ORBO_VERSION: value,
        ORBO_OS_VERSION: value,
        ORBO_PLATFORM: value,
        ORBO_ARCH: value,
        ORBO_ENGINE: value,
      }),
    ).toEqual({ orbo_distribution: "desktop" });
  });
});
