import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addressOf,
  connectionParameters,
  createDatabase,
} from "../src/db/client";
import { testDatabaseUrl } from "./support/database";

// Any readable PEM will do: these tests check what reaches Bun, not a handshake.
const caPem =
  "-----BEGIN CERTIFICATE-----\nMIIBtest\n-----END CERTIFICATE-----\n";
const caFile = join(mkdtempSync(join(tmpdir(), "orbo-ca-")), "ca.pem");
writeFileSync(caFile, caPem);

/**
 * The address goes to Bun in parts, and `$DATABASE_URL` does not survive the call.
 *
 * Both halves matter and only together. Bun reads a connection URL's path as the path of a unix
 * socket, so `postgres://…/orbo` cannot connect on Windows (oven-sh/bun#27713); and it prefers
 * `$DATABASE_URL` to the options it was handed, so passing the parts while the variable is still
 * set changes nothing. These assert the observable half: what the environment looks like
 * afterwards, and which addresses are refused before a socket is ever opened.
 */
const original = process.env.DATABASE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original;
});

describe("the database address", () => {
  test("is taken out of the environment, so Bun cannot prefer it to the parts", () => {
    process.env.DATABASE_URL = "postgres://orbo:orbo@127.0.0.1:5432/orbo";

    createDatabase("postgres://orbo:orbo@127.0.0.1:5432/orbo");

    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  test("refuses a connection string that is not a URL", () => {
    expect(() => createDatabase("://orbo@/orbo")).toThrow(
      /DATABASE_URL is not a valid URL/,
    );
  });

  test("does not put the password in the message when the URL will not parse", () => {
    // A stray character in a generated password is the likeliest reason `new URL` throws here, so
    // the refusal must not echo the string it was given: DATABASE_URL carries the credential, and a
    // message quoting it would write the password into the log line that reports the fault. The
    // invalid port makes `new URL` throw with the secret still present in the input.
    const secret = "s3cr3t-p4ssw0rd";
    let message = "";
    try {
      createDatabase(`postgres://orbo:${secret}@127.0.0.1:notaport/orbo`);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/DATABASE_URL is not a valid URL/);
    expect(message).not.toContain(secret);
  });

  test("refuses a URL with no host, which would otherwise parse and connect nowhere", () => {
    // `new URL` accepts this: the scheme is "orbo:" and there is no host at all.
    expect(() => createDatabase("orbo:orbo@localhost/orbo")).toThrow(
      /names no host/,
    );
  });

  test("refuses a URL that names no database, rather than connecting to a default", () => {
    expect(() => createDatabase("postgres://orbo:orbo@127.0.0.1:5432")).toThrow(
      /names no database/,
    );
  });

  test("refuses a port of zero instead of connecting nowhere", () => {
    /*
     * `new URL` accepts `:0` and reports the port as `"0"`, so without this check boot succeeds
     * and every query fails against a port nothing listens on. A refusal here names the variable
     * and the range, the way every other malformed address does.
     */
    expect(() =>
      createDatabase("postgres://orbo:orbo@127.0.0.1:0/orbo"),
    ).toThrow(/DATABASE_URL names a port that is not between 1 and 65535/);
  });

  test("refuses a password holding a percent that starts no escape, naming the part", () => {
    /*
     * `new URL` accepts this and `decodeURIComponent` does not, so the refusal used to be a bare
     * `URIError: URI error` naming neither DATABASE_URL nor the password -- out of the one function
     * whose job is to make a connection failure legible. A generated password is a common place to
     * find a literal `%`.
     */
    expect(() =>
      createDatabase("postgres://orbo:100%pure@127.0.0.1:5432/orbo"),
    ).toThrow(/DATABASE_URL has a password that is not percent-encoded/);
  });

  test("refuses a username holding one too", () => {
    expect(() =>
      createDatabase("postgres://open%bot:orbo@127.0.0.1:5432/orbo"),
    ).toThrow(/DATABASE_URL has a username that is not percent-encoded/);
  });

  test("refuses a database name holding one too", () => {
    expect(() =>
      createDatabase("postgres://orbo:orbo@127.0.0.1:5432/open%bot"),
    ).toThrow(/DATABASE_URL has a database name that is not percent-encoded/);
  });

  test("still accepts a password that IS percent-encoded, decoding it", () => {
    // The escape a correctly written password uses: `%40` is `@`, which cannot be written raw.
    expect(() =>
      createDatabase("postgres://orbo:p%40ss@127.0.0.1:5432/orbo"),
    ).not.toThrow();
  });

  test("still refuses pool options where the address belongs", () => {
    // @ts-expect-error the wrong-way-round call this guard exists for
    expect(() => createDatabase({ max: 1 })).toThrow(/connection string/);
  });
});

describe("connection parameters on the URL", () => {
  test("survive, because a dropped application_name turns a lock test into a timeout", async () => {
    const address = new URL(testDatabaseUrl());
    address.searchParams.set("application_name", "db_client_address_probe");
    const named = createDatabase(address.toString());

    try {
      const rows = await named.execute(
        "select application_name from pg_stat_activity where pid = pg_backend_pid()",
      );
      expect(
        (rows as Array<{ application_name: string }>)[0]?.application_name,
      ).toBe("db_client_address_probe");
    } finally {
      await named.$client.close();
    }
  });
});

/**
 * The per-connection statement ceilings.
 *
 * The unit half pins what `connectionParameters` derives from the environment, including the two
 * ways a deployment restates it (`0` for off, a URL parameter winning for one address). The
 * integration half proves the parameters actually land: a live connection answers `show` with the
 * ceilings set, and one opened from a URL that names its own keeps that one instead.
 */
describe("the per-connection statement ceilings", () => {
  test("default to 30s for a statement and 60s for a stalled transaction", () => {
    expect(connectionParameters({})).toEqual({
      statement_timeout: "30000",
      idle_in_transaction_session_timeout: "60000",
    });
  });

  test("are restated in whole milliseconds, and 0 leaves a ceiling off", () => {
    expect(
      connectionParameters({
        DATABASE_STATEMENT_TIMEOUT_MS: "5000",
        DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: "0",
      }),
    ).toEqual({ statement_timeout: "5000" });
  });

  test("reject a value that is not a whole number of milliseconds", () => {
    expect(() =>
      connectionParameters({ DATABASE_STATEMENT_TIMEOUT_MS: "soon" }),
    ).toThrow(/DATABASE_STATEMENT_TIMEOUT_MS/);
    expect(() =>
      connectionParameters({ DATABASE_STATEMENT_TIMEOUT_MS: "1.5" }),
    ).toThrow(/DATABASE_STATEMENT_TIMEOUT_MS/);
    expect(() =>
      connectionParameters({ DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: "-1" }),
    ).toThrow(/DATABASE_IDLE_TRANSACTION_TIMEOUT_MS/);
  });

  test("land on a live connection, which the factory opens with them", async () => {
    const database = createDatabase(testDatabaseUrl());
    try {
      const rows = (await database.execute(
        "select current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle",
      )) as Array<{ statement: string; idle: string }>;
      expect(rows[0]?.statement).toBe("30s");
      expect(rows[0]?.idle).toBe("1min");
    } finally {
      await database.$client.close();
    }
  });

  test("a URL's own parameter keeps its address's ceiling, not the default", async () => {
    const address = new URL(testDatabaseUrl());
    address.searchParams.set("statement_timeout", "5s");
    const database = createDatabase(address.toString());
    try {
      const rows = (await database.execute(
        "select current_setting('statement_timeout') as statement",
      )) as Array<{ statement: string }>;
      expect(rows[0]?.statement).toBe("5s");
    } finally {
      await database.$client.close();
    }
  });
});

/**
 * `sslmode` is a client setting, and Bun takes it as the `tls` option rather than reading it.
 *
 * It used to travel with `application_name` as a Postgres startup parameter. Postgres refuses that
 * (`unrecognized configuration parameter "sslmode"`), and against a database that requires TLS the
 * connection went out unencrypted first, which RDS answers with `no pg_hba.conf entry ... no
 * encryption`. That is every managed database, and `?sslmode=require` is what the deployment docs
 * tell a managed database to carry, so the documented configuration could not connect at all.
 */
describe("sslmode on the URL", () => {
  const base = "postgres://orbo:orbo@db.example.com:5432/orbo";

  test("require encrypts without checking the certificate, as libpq's require does", () => {
    const options = addressOf(`${base}?sslmode=require`);
    expect(options.tls).toEqual({ rejectUnauthorized: false });
  });

  test("is not sent to Postgres, which refuses it as a parameter", () => {
    const options = addressOf(`${base}?sslmode=require&application_name=probe`);
    expect(options.connection).toEqual({ application_name: "probe" });
  });

  test("disable turns TLS off explicitly", () => {
    expect(addressOf(`${base}?sslmode=disable`).tls).toBe(false);
  });

  test("absent leaves TLS as it was, so a local database without TLS still connects", () => {
    expect("tls" in addressOf(base)).toBe(false);
  });

  test("verify-full checks the certificate against sslrootcert on a Bun that verifies", () => {
    const options = addressOf(
      `${base}?sslmode=verify-full&sslrootcert=${encodeURIComponent(caFile)}`,
      "1.4.0",
    );
    expect(options.tls).toEqual({ rejectUnauthorized: true, ca: caPem });
    expect(options.connection).toBeUndefined();
  });

  test("verify-full without sslrootcert checks against the trusted roots", () => {
    expect(addressOf(`${base}?sslmode=verify-full`, "1.4.0").tls).toEqual({
      rejectUnauthorized: true,
    });
  });

  test("verify-full is refused on a Bun that does not verify, rather than pretending to", () => {
    // Observed on 1.3.14: `rejectUnauthorized: true` connects to a self-signed server and to a
    // certificate naming a different host. A setting that says it verifies and does not is worse
    // than one that refuses to start.
    expect(() => addressOf(`${base}?sslmode=verify-full`, "1.3.14")).toThrow(
      /sslmode=verify-full.*needs Bun 1\.4 or later.*1\.3\.14/,
    );
  });

  test("verify-ca is refused, since Bun cannot check the CA without the host name", () => {
    expect(() => addressOf(`${base}?sslmode=verify-ca`, "1.4.0")).toThrow(
      /sslmode=verify-ca.*not supported.*verify-full/,
    );
  });

  test.each(["prefer", "allow"])(
    "%s is refused, because Bun cannot fall back from TLS the way libpq does",
    (mode) => {
      expect(() => addressOf(`${base}?sslmode=${mode}`)).toThrow(
        new RegExp(`sslmode=${mode}.*not supported.*require`),
      );
    },
  );

  test("an unknown mode is refused, naming the ones that work", () => {
    expect(() => addressOf(`${base}?sslmode=strict`)).toThrow(
      /sslmode=strict.*not one of disable, require or verify-full/,
    );
  });

  test("sslrootcert without verify-full is refused, since nothing would check it", () => {
    expect(() =>
      addressOf(
        `${base}?sslmode=require&sslrootcert=${encodeURIComponent(caFile)}`,
      ),
    ).toThrow(/sslrootcert.*only read with sslmode=verify-full/);
  });

  test("an sslrootcert that cannot be read names the file, not the password", () => {
    const secret = "s3cr3t-p4ssw0rd";
    let message = "";
    try {
      addressOf(
        `postgres://orbo:${secret}@db.example.com:5432/orbo?sslmode=verify-full&sslrootcert=/nonexistent/ca.pem`,
        "1.4.0",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(
      /sslrootcert \/nonexistent\/ca\.pem could not be read/,
    );
    expect(message).not.toContain(secret);
  });
});

describe("sslmode against a real database", () => {
  test("disable connects to a database without TLS, where the parameter used to be refused", async () => {
    const address = new URL(testDatabaseUrl());
    address.searchParams.set("sslmode", "disable");
    const plain = createDatabase(address.toString());

    try {
      const rows = await plain.execute(
        "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
      );
      expect((rows as Array<{ ssl: boolean }>)[0]?.ssl).toBe(false);
    } finally {
      await plain.$client.close();
    }
  });
});
