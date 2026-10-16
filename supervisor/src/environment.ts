/**
 * What a computer is told about itself.
 *
 * Kept separate from the HTTP server so the exact environment boundary is testable without
 * starting a listener or connecting to Docker. Nothing here is caller-supplied: a request says
 * which Bot, never what to run or what to set.
 */
export function environmentFor(
  botId: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const passthrough = Object.entries(env).filter(([key]) =>
    key.startsWith("EGRESS_PROXY"),
  );
  const computerToken = env.ORBO_COMPUTER_TOKEN?.trim() || undefined;
  const spireSocketVolume = env.SPIRE_AGENT_SOCKET_VOLUME;
  // Fail fast here rather than forwarding an invalid mode that crashes the child at
  // `browserModeFromEnv`: whitespace-only is falsy after trim, anything else must be headless
  // or headed.
  const rawBrowserMode = env.ORBO_COMPUTER_BROWSER_MODE?.trim() || undefined;
  if (
    rawBrowserMode !== undefined &&
    rawBrowserMode !== "headless" &&
    rawBrowserMode !== "headed"
  ) {
    throw new Error(
      `ORBO_COMPUTER_BROWSER_MODE must be headless or headed, not ${JSON.stringify(env.ORBO_COMPUTER_BROWSER_MODE)}.`,
    );
  }
  const browserMode = rawBrowserMode;
  return [
    `ORBO_COMPUTER_BOT_ID=${botId}`,
    ...(computerToken ? [`ORBO_COMPUTER_TOKEN=${computerToken}`] : []),
    ...(spireSocketVolume
      ? ["SPIFFE_ENDPOINT_SOCKET=/tmp/spire-agent/public/api.sock"]
      : []),
    ...(browserMode ? [`ORBO_COMPUTER_BROWSER_MODE=${browserMode}`] : []),
    ...passthrough.map(([key, value]) => `${key}=${value ?? ""}`),
  ];
}
