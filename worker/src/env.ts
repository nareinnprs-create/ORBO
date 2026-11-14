import { workOwner } from "../../shared/work-owner";

/**
 * What the worker needs from its environment, parsed and ready to use.
 *
 * `serverInternalUrl` never carries a trailing slash, so `routineRunUrl` cannot
 * produce the double-slash `//internal/routines/run` that a `SERVER_INTERNAL_URL`
 * with a trailing slash used to build — a 404 the sweep only reported as "the server
 * answered 404 rather than 202". `owner` always carries a random suffix, so two
 * workers on one host never share a lease name; see `shared/work-owner.ts`.
 *
 * `livenessPort` is where the `/live` HTTP endpoint binds, defaulted so a container
 * or a service manager has a probe to call without being told a port. `0` binds no
 * endpoint at all, for a worker whose host watches it some other way.
 */
export type WorkerEnv = {
  workerSharedSecret: string;
  serverInternalUrl: string;
  databaseUrl: string;
  owner: string;
  livenessPort: number;
};

/**
 * The shortest secret this worker will carry.
 *
 * A shared secret is the whole credential the server compares on every dispatch,
 * so a short one is guessable brute-force, and the failure it produces — a worker
 * firing routines into a server that answers 401 forever — is silent by the time
 * anybody looks. 24 characters is comfortably above what offline guessing at web
 * speeds can reach within any useful window, while staying a value a person can
 * copy whole.
 */
export const MIN_WORKER_SHARED_SECRET_LENGTH = 24;

/** Where `/live` binds when the environment does not say. Documented in docs/deployment.md. */
export const DEFAULT_LIVENESS_PORT = 3002;

/**
 * Read and validate the worker's settings, failing fast and loudly.
 *
 * Whitespace-only values are refused exactly like unset ones: the old `if (!value)`
 * guards let `"   "` through, and the loop then failed on every tick — `fetch` to
 * `"   /internal/..."`, `createDatabase("   ")` on the first query — logging
 * `routine-sweep-tick-failed` forever instead of saying at boot what was misconfigured.
 */
export function loadWorkerEnv(
  environment: Record<string, string | undefined> = process.env,
): WorkerEnv {
  const workerSharedSecret = environment.WORKER_SHARED_SECRET?.trim();
  if (!workerSharedSecret) {
    throw new Error(
      "WORKER_SHARED_SECRET is not set, so this worker cannot authenticate itself to /internal/routines/run and no routine could be fired.",
    );
  }
  if (workerSharedSecret.length < MIN_WORKER_SHARED_SECRET_LENGTH) {
    throw new Error(
      `WORKER_SHARED_SECRET is ${workerSharedSecret.length} characters, which is too short to resist guessing (the minimum is ${MIN_WORKER_SHARED_SECRET_LENGTH}). Generate one with \`openssl rand -base64 32\` and set the SAME value in the server's environment, or every dispatch will be refused with a 401.`,
    );
  }

  const rawServerUrl = environment.SERVER_INTERNAL_URL?.trim();
  if (!rawServerUrl) {
    throw new Error(
      "SERVER_INTERNAL_URL is not set, so this worker does not know where to hand a routine run.",
    );
  }
  const serverInternalUrl = rawServerUrl.replace(/\/+$/, "");
  if (!serverInternalUrl) {
    throw new Error(
      "SERVER_INTERNAL_URL is not set, so this worker does not know where to hand a routine run.",
    );
  }
  try {
    const parsed = new URL(serverInternalUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("not http(s)");
    }
  } catch {
    throw new Error(
      "SERVER_INTERNAL_URL must be a valid http(s) URL, so this worker knows where to hand a routine run.",
    );
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set, so this worker has no database to read routines from or claim them in.",
    );
  }

  const rawLivenessPort = environment.WORKER_LIVENESS_PORT?.trim();
  let livenessPort = DEFAULT_LIVENESS_PORT;
  if (rawLivenessPort !== undefined && rawLivenessPort !== "") {
    const parsed = Number(rawLivenessPort);
    if (
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > 65535 ||
      // `Number("")` is 0 and `Number(" ")` is 0; the trims above make those unreachable,
      // but a string of digits with a stray letter must not read as a port either.
      !/^\d+$/.test(rawLivenessPort)
    ) {
      throw new Error(
        "WORKER_LIVENESS_PORT must be a port between 0 and 65535 (0 disables the /live endpoint).",
      );
    }
    livenessPort = parsed;
  }

  const owner = workOwner("routines", environment);

  return {
    workerSharedSecret,
    serverInternalUrl,
    databaseUrl,
    owner,
    livenessPort,
  };
}

/** Where a claimed run is handed to the server. Built on the normalised base URL. */
export function routineRunUrl(serverInternalUrl: string): string {
  return `${serverInternalUrl}/internal/routines/run`;
}
