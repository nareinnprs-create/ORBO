import type { MiddlewareHandler } from "hono";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import type { AppVariables, AuthenticatedActor } from "./guards";

/**
 * A signed-in person, without signing in.
 *
 * A deployment with no identity provider is one administrator and no sign-in, so `bun run dev`
 * reaches the product without registering an OAuth client first. Nobody should have to set up Entra
 * to look at a Bot. `.env.example` ships that line switched on, so a clone still runs with no
 * configuration at all.
 *
 * The lock is the flag and nothing else. It used to be `NODE_ENV`, which is exactly backwards:
 * `NODE_ENV` is unset by default, so the one case it had to catch was the one it let through. A
 * container run on a VM with a hand-written env file and no provider served every visitor on the
 * internet as an administrator, and said nothing, because it looked like it was working. Now the
 * deployment refuses to start unless somebody wrote down that they meant it.
 *
 * `NODE_ENV=production` still refuses to honour the ask — see {@link singleUserEnabled} — but it
 * decides nothing about whether the ask itself is read, which is the trust boundary the flag guard.
 *
 * The actor is an administrator so admin surfaces can be reached too, and its id is fixed so
 * Intelligence threads and memory stay attached to the same person across restarts.
 */

export const DEV_ACTOR: AuthenticatedActor = {
  id: "dev-local-user",
  email: "dev@orbo.local",
  role: "admin",
};

type UserWriter = Pick<Database, "insert">;

export async function initializeDevActorUser(
  database: UserWriter,
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) return false;

  const name = DEV_ACTOR.name ?? DEV_ACTOR.email;
  await database
    .insert(users)
    .values({
      id: DEV_ACTOR.id,
      email: DEV_ACTOR.email,
      name,
      emailVerified: false,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: DEV_ACTOR.email,
        name,
        updatedAt: new Date(),
      },
    });

  return true;
}

/**
 * Whether this deployment admits everybody as one administrator.
 *
 * Only ever true when no identity provider is configured: a provider always wins, so a deployment
 * cannot half sign people in.
 *
 * Refused under `NODE_ENV=production` under either name. The flag is a development convenience —
 * the whole point of the flag-only lock is not trusting `NODE_ENV` to say who a deployment is — but
 * deployers were using it as a permanent substitute for an identity provider, because nothing said
 * they should not. Whether a production deployment may still HAVE no sign-in is `singleUserAllowed`'s
 * question in config.ts; this one draws the line earlier: `NODE_ENV=production` is what callers ask
 * to be graded as, and under it both flags are throwaways rather than a configuration.
 *
 * @param hasProvider whether any identity provider is configured
 */
export function singleUserEnabled(
  environment: Record<string, string | undefined>,
  hasProvider: boolean,
): boolean {
  if (hasProvider) return false;

  const legacyName = "ORBO_DEV_NO_AUTH";
  const asked = environment.ORBO_SINGLE_USER?.trim() === "true";
  // The name this had before. Still honoured so an existing .env keeps working — with a warning
  // below and only outside production, where both names refuse outright.
  const askedWithLegacyName =
    !asked && environment[legacyName]?.trim() === "true";

  if (asked || askedWithLegacyName) {
    /*
     * `NODE_ENV` decides nothing about WHETHER sign-in was asked for — the flag is the only lock
     * there, by design. It decides whether that ask is honoured. Read through this file's own
     * copy of config.ts's `optional` trim semantic (a value that does not trim to a string is
     * unset), from the record first and `process.env` second: the boot path hands `process.env`
     * straight in, and tests hand a literal record which may or may not carry `NODE_ENV`.
     */
    const nodeEnv =
      (environment.NODE_ENV ?? process.env.NODE_ENV)?.trim() || undefined;
    if (nodeEnv === "production") {
      if (asked) {
        throw new Error(
          "ORBO_SINGLE_USER=true means nothing in production (NODE_ENV=production): one administrator and no sign-in is a development convenience, and a production deployment is reachable by people who are not its administrator. Configure an identity provider instead.",
        );
      }
      throw new Error(
        "ORBO_DEV_NO_AUTH means nothing in production (NODE_ENV=production), and the name itself is deprecated: rename the line to ORBO_SINGLE_USER=true. That still refuses under NODE_ENV=production — one administrator and no sign-in is a development convenience, not a production configuration. Configure an identity provider instead.",
      );
    }
    if (askedWithLegacyName) {
      console.warn(
        "ORBO_DEV_NO_AUTH is the name ORBO_SINGLE_USER had before: the term is deprecated, so every deployment still carrying it should rename the line to ORBO_SINGLE_USER=true. The name keeps working in development for now; both names stop meaning anything in production (NODE_ENV=production).",
      );
    }
    return true;
  }

  throw new Error(
    "No identity provider is configured. Set GOOGLE_OAUTH_*, MICROSOFT_OAUTH_* or OKTA_OAUTH_* with BETTER_AUTH_SECRET and BETTER_AUTH_URL, or set ORBO_SINGLE_USER=true to run with one administrator and no sign-in. Refusing to start rather than serving a deployment where every visitor is an administrator.",
  );
}

/** A guard that admits everybody as {@link DEV_ACTOR}. Only ever mounted when singleUserEnabled(). */
export function createDevRequireUser(): MiddlewareHandler<{
  Variables: AppVariables;
}> {
  return async (context, next) => {
    context.set("actor", DEV_ACTOR);
    await next();
  };
}
