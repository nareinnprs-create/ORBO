import { readFileSync } from "node:fs";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

/**
 * One percent-decoded part of the address, or a refusal that names it.
 *
 * A password is where this bites. `postgres://orbo:100%pure@host:5432/orbo` is a string
 * `new URL` accepts without complaint, and `decodeURIComponent` then rejects with `URIError: URI
 * error` -- a message that names neither `DATABASE_URL` nor which part of it was wrong, thrown out
 * of the one function whose whole job is to make a connection failure legible. A `%` that starts no
 * escape is a common thing to find in a generated password, and every other malformed address here
 * is answered with a sentence saying what to fix.
 */
function decodePart(value: string, part: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new TypeError(
      `DATABASE_URL has a ${part} that is not percent-encoded. A literal "%" must be written "%25".`,
    );
  }
}

/** Whether `version` is at least `major.minor`. Pre-release suffixes are ignored. */
function atLeast(version: string, major: number, minor: number): boolean {
  const [have = 0, haveMinor = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  return have > major || (have === major && haveMinor >= minor);
}

/**
 * `sslmode` and `sslrootcert`, turned into the `tls` option Bun reads instead.
 *
 * They are libpq's client settings, not Postgres parameters. Forwarded as connection parameters
 * they were refused (`unrecognized configuration parameter "sslmode"`), and the connection was
 * opened without TLS first, which a database that requires TLS answers with `no pg_hba.conf entry
 * ... no encryption`. RDS, Cloud SQL and Azure Database all require it by default, and
 * `?sslmode=require` is what the deployment docs tell them to carry.
 *
 * Only the modes Bun can honour are accepted, each checked against a real server:
 *
 * - `require` encrypts and checks nothing, which is libpq's meaning too.
 * - `verify-full` checks the chain and the host name, against `sslrootcert` when given. Bun 1.3.x
 *   connects regardless, to a self-signed server and to a certificate naming another host, so on
 *   that Bun it is refused rather than allowed to look like verification.
 * - `verify-ca` would check the chain and not the name, and Bun ignores the hook that skips the
 *   name, so it is refused rather than quietly made stricter.
 * - `prefer` and `allow` try one way and fall back to the other, which Bun cannot do, so they are
 *   refused rather than quietly made one or the other.
 */
function tlsOf(params: URLSearchParams, bunVersion: string) {
  const mode = params.get("sslmode");
  const rootCert = params.get("sslrootcert");
  if (rootCert !== null && mode !== "verify-full") {
    throw new TypeError(
      "DATABASE_URL has sslrootcert, which is only read with sslmode=verify-full.",
    );
  }
  switch (mode) {
    case null:
      return {};
    case "disable":
      return { tls: false as const };
    case "require":
      return { tls: { rejectUnauthorized: false } };
    case "verify-full": {
      if (!atLeast(bunVersion, 1, 4)) {
        throw new TypeError(
          `DATABASE_URL has sslmode=verify-full, which needs Bun 1.4 or later to check the certificate. This is Bun ${bunVersion}. Use sslmode=require to encrypt without checking it.`,
        );
      }
      if (rootCert === null) return { tls: { rejectUnauthorized: true } };
      let ca: string;
      try {
        ca = readFileSync(rootCert, "utf8");
      } catch {
        throw new TypeError(
          `DATABASE_URL: sslrootcert ${rootCert} could not be read.`,
        );
      }
      return { tls: { rejectUnauthorized: true, ca } };
    }
    case "verify-ca":
      throw new TypeError(
        "DATABASE_URL has sslmode=verify-ca, which is not supported: Bun cannot check the certificate authority without the host name. Use sslmode=verify-full.",
      );
    case "prefer":
    case "allow":
      throw new TypeError(
        `DATABASE_URL has sslmode=${mode}, which is not supported: Bun cannot fall back between TLS and plain connections. Use sslmode=require, or sslmode=disable.`,
      );
    default:
      throw new TypeError(
        `DATABASE_URL has sslmode=${mode}, which is not one of disable, require or verify-full.`,
      );
  }
}

/**
 * The address, taken apart, because Bun will not take it whole on every platform.
 *
 * `new SQL("postgres://user:pass@host:5432/orbo")` works on macOS and Linux and cannot work on
 * Windows: Bun reads the URL's path, `/orbo`, as the path of a unix socket, ignores the host and
 * the port, and fails to open a socket that Windows does not have (oven-sh/bun#27713). The server
 * then cannot reach Postgres at all there, while `psql` inside the container and a plain TCP
 * connection from the same machine both succeed, which is what makes it look like a network fault
 * and not a parsing one.
 *
 * Passing the parts leaves nothing to parse. The behaviour is identical where the URL already
 * worked, since these are the same values Bun would have derived.
 *
 * Exported for its tests. `bunVersion` is a parameter so they can check both sides of the Bun 1.4
 * line from whichever Bun runs them.
 */
export function addressOf(
  databaseUrl: string,
  bunVersion: string = Bun.version,
) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // The value is not echoed back. DATABASE_URL holds the database password, and the one string
    // most likely to fail `new URL` is one with a stray character in that password, so printing it
    // to name the fault would put the credential in the log line that reports it. Name the variable
    // and the shape it expects, the way every other refusal in this function does.
    throw new TypeError(
      "DATABASE_URL is not a valid URL. Expected postgres://user:password@host:port/database.",
    );
  }
  if (url.hostname === "") {
    throw new TypeError(
      "DATABASE_URL names no host. Expected postgres://user:password@host:port/database.",
    );
  }
  const database = decodePart(url.pathname.replace(/^\//, ""), "database name");
  if (database === "") {
    throw new TypeError(
      "DATABASE_URL names no database. Expected postgres://user:password@host:port/database.",
    );
  }
  /*
   * The query string is carried across as connection parameters, not dropped.
   *
   * `?application_name=…` is the one that matters here: the profile store's serialization tests
   * name a session that way and then look for it in `pg_stat_activity`, so losing it turns a lock
   * test into a three second timeout with nothing to say why. Anything else Postgres accepts on a
   * URL travels the same way. `sslmode` and `sslrootcert` do not: Postgres refuses them, and they
   * become the `tls` option below.
   */
  const tls = tlsOf(url.searchParams, bunVersion);
  const connection = Object.fromEntries(
    [...url.searchParams].filter(
      ([name]) => name !== "sslmode" && name !== "sslrootcert",
    ),
  );

  /*
   * A port that is not a port is refused before a socket is ever opened.
   *
   * `new URL` already rejects `:65536` and above, but `:0` parses to `"0"` and would travel
   * into `new SQL({ port: 0 })` as `0`. Boot then succeeds and every query fails against a port
   * nothing listens on, instead of the start-up refusal every other malformed address here gets.
   * Postgres ports are 1-65535, the same range the server's own `PORT`/`SERVER_PORT` enforces.
   */
  let port = 5432;
  if (url.port !== "") {
    port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new TypeError(
        "DATABASE_URL names a port that is not between 1 and 65535.",
      );
    }
  }

  return {
    adapter: "postgres" as const,
    hostname: url.hostname,
    port,
    username: decodePart(url.username, "username"),
    password: decodePart(url.password, "password"),
    database,
    ...(Object.keys(connection).length > 0 ? { connection } : {}),
    ...tls,
  };
}

/**
 * The server-side statement ceilings, applied as connection start-up parameters on every
 * connection this factory opens.
 *
 * Two runaway shapes used to have no floor: a query that never returns (a missing index meeting a
 * big table, a lock waited on forever) holds its pooled connection until the process is restarted,
 * and a session that opens a transaction and stalls inside it holds its locks the same way. Postgres
 * carries both settings; they only do anything when somebody sets them, so this factory does, on
 * every connection, where no caller can forget.
 *
 * - `statement_timeout` — one statement, 30s by default. Long enough for every ordinary query here;
 *   a migration or a deliberate batch that needs longer overrides it for its own session.
 * - `idle_in_transaction_session_timeout` — a session parked inside an open transaction, 60s by
 *   default. Generous next to the statement ceiling, because a legitimate transaction has thinking
 *   time between its statements; an abandoned one is what this reaps.
 *
 * `DATABASE_STATEMENT_TIMEOUT_MS` / `DATABASE_IDLE_TRANSACTION_TIMEOUT_MS` restate either in
 * milliseconds; `0` leaves that ceiling off entirely. A value that is not a non-negative integer is
 * refused at client construction, the same loud-and-early treatment every malformed `DATABASE_URL`
 * part gets — a typo surfacing on the first slow query, hours into a deployment, is the failure
 * mode to avoid. URL query parameters still win: a `?statement_timeout=` on `DATABASE_URL` names
 * the ceiling for that one address, exactly as `?application_name=` already names the session.
 */
const STATEMENT_TIMEOUT_MS_ENV = "DATABASE_STATEMENT_TIMEOUT_MS";
const IDLE_IN_TRANSACTION_TIMEOUT_MS_ENV =
  "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS";
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

/** One timeout from its environment variable: milliseconds, `0` for off, refused otherwise. */
function timeoutMs(
  name: string,
  environmentValue: string | undefined,
  defaultMs: number,
) {
  const raw = environmentValue?.trim();
  if (raw === undefined || raw === "") return defaultMs;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(
      `${name} must be a whole number of milliseconds, or 0 for no ceiling.`,
    );
  }
  return parsed;
}

/**
 * The start-up parameters themselves, Postgres's own names. Values are plain millisecond integers
 * in string form, which is the one spelling every Postgres version takes on the wire, with no
 * unit-suffix parsing to disagree about.
 */
export function connectionParameters(
  environment: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const parameters: Record<string, string> = {};
  const statement = timeoutMs(
    STATEMENT_TIMEOUT_MS_ENV,
    environment[STATEMENT_TIMEOUT_MS_ENV],
    DEFAULT_STATEMENT_TIMEOUT_MS,
  );
  if (statement > 0) parameters.statement_timeout = String(statement);
  const idle = timeoutMs(
    IDLE_IN_TRANSACTION_TIMEOUT_MS_ENV,
    environment[IDLE_IN_TRANSACTION_TIMEOUT_MS_ENV],
    DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  );
  if (idle > 0) {
    parameters.idle_in_transaction_session_timeout = String(idle);
  }
  return parameters;
}

/**
 * `max` is exposed so tests can pin the pool to a single connection. Code that opens a transaction
 * and then reads on a second connection deadlocks once every pooled connection is inside such a
 * transaction; a pool of one turns that from a load-dependent production hang into an immediate,
 * reproducible failure.
 */
export function createDatabase(
  databaseUrl: string,
  options: { max?: number } = {},
) {
  /*
   * Loud rather than silent when the arguments are the wrong way round.
   *
   * Bun's `SQL` takes either a URL or an options object as its one argument, so a caller passing the
   * pool options where the address belongs gets a working database from `$DATABASE_URL` and no
   * complaint. Two tests were doing exactly that, green for a reason that had nothing to do with
   * what they were checking, and the test tree is not type-checked so nothing else was going to say
   * so. A connection string is a string.
   */
  if (typeof databaseUrl !== "string" || databaseUrl.trim() === "") {
    throw new TypeError(
      "createDatabase needs a connection string as its first argument. Pool options go second.",
    );
  }
  /*
   * `$DATABASE_URL` is taken out of the environment first, and stays out.
   *
   * Passing the parts is not enough on its own: Bun reads `$DATABASE_URL` when one is set and
   * prefers it to what the caller passed, so the address goes back through the parser this exists
   * to avoid and Windows fails exactly as before. Observed, not assumed: the options form connects
   * from a Bun script with no `$DATABASE_URL` set and fails inside the server, which is started
   * with `--env-file`, until the variable is gone.
   *
   * Nothing else reads it after this point. `loadConfig` has already captured it, and the worker
   * reads it into a local before it opens a database. Removing it also means a later
   * `new SQL()` cannot silently connect somewhere nobody named.
   */
  delete process.env.DATABASE_URL;

  const address = addressOf(databaseUrl);
  // The ceilings ride with the address's own connection parameters, which win: a URL that names
  // its own `statement_timeout` said so for that address specifically.
  const parameters = {
    ...connectionParameters(),
    ...(address.connection ?? {}),
  };
  const client = new SQL({
    ...address,
    ...(Object.keys(parameters).length > 0 ? { connection: parameters } : {}),
    ...(options.max === undefined ? {} : { max: options.max }),
  });

  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabase>;
