/**
 * Whether this supervisor is being handed the tokens the install scripts mint, and whether that is
 * allowed.
 *
 * `orbo-dev-supervisor-token` is printed in this repository, and so is the computer token this
 * process forwards into every container it creates. They are the defaults `scripts/install.sh` and
 * `scripts/start.sh` (and the PowerShell twins) generate when `.env` carries nothing, and nothing
 * anywhere refused them. The server now refuses them at its own boot where somebody else could be
 * listening; this is the same question asked where this process asks it, because the supervisor is
 * the half of the pair that holds the Docker socket — root on the host by way of four verbs — and
 * its token guards exactly that.
 *
 * Kept out of `index.ts`, which exits at import without its environment, so a test can reach it —
 * the same reason `authorised` lives in its own file.
 */

/** The values the install scripts generate. The list is theirs; it is copied here, not imported. */
const DEVELOPMENT_TOKENS = [
  "orbo-dev-supervisor-token",
  "orbo-dev-computer-token",
] as const;

type DevelopmentToken = (typeof DEVELOPMENT_TOKENS)[number];

function isDevelopmentToken(
  value: string | undefined,
): value is DevelopmentToken {
  return (
    typeof value === "string" &&
    (DEVELOPMENT_TOKENS as readonly string[]).includes(value)
  );
}

/**
 * Refuse to run production on the printed tokens; warn everywhere else.
 *
 * Production is the line, and `NODE_ENV` is how a deployment says it: the server's image and the
 * chart set it for every workload, the compose stack this supervisor normally runs in does not,
 * and the laptop that keeps the defaults is the case they exist for. A deployment that is about to
 * hold its container sockets behind a password from a public README is told to stop rather than
 * started, because the token is not a speed bump — it is the whole of what stands between the
 * network and four verbs over the Docker socket.
 */
export function refuseDevelopmentTokens(
  env: Record<string, string | undefined> = process.env,
): void {
  const names = ["SUPERVISOR_TOKEN", "ORBO_COMPUTER_TOKEN"] as const;
  for (const name of names) {
    if (!isDevelopmentToken(env[name]?.trim() ?? undefined)) continue;

    if (env.NODE_ENV?.trim() === "production") {
      throw new Error(
        `${name} is still the development token printed in this repository, which is public, and this process is running in production. Generate a real one before starting.`,
      );
    }
    console.warn(
      `${name} is the development token printed in this repository. Fine on a loopback laptop. Generate a real one before deploying.`,
    );
  }
}
