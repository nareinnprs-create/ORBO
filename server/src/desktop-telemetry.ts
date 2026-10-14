/** Only the desktop shell's closed metadata may join the runtime's existing events. */
export function desktopTelemetryProperties(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (env.ORBO_DISTRIBUTION !== "desktop") return {};

  const properties: Record<string, string> = {
    orbo_distribution: "desktop",
  };
  for (const [input, output, allowed] of [
    ["ORBO_PLATFORM", "orbo_platform", ["macos", "windows", "linux", "other"]],
    ["ORBO_ARCH", "orbo_arch", ["aarch64", "x86_64", "other"]],
    ["ORBO_ENGINE", "orbo_engine", ["docker", "podman", "none"]],
  ] as const) {
    const value = env[input];
    if (value && allowed.some((item) => item === value))
      properties[output] = value;
  }
  for (const [input, output] of [
    ["ORBO_VERSION", "orbo_version"],
    ["ORBO_OS_VERSION", "orbo_os_version"],
  ] as const) {
    const value = env[input];
    if (
      value &&
      value.length <= 32 &&
      value.trim() === value &&
      /^\d+(?:\.\d+){1,3}$/.test(value)
    ) {
      properties[output] = value;
    }
  }
  return properties;
}
