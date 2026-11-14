import { describe, expect, test } from "bun:test";
import { loadWorkerEnv, routineRunUrl } from "../src/env";

const base = () => ({
  WORKER_SHARED_SECRET: "a-long-enough-worker-shared-secret",
  SERVER_INTERNAL_URL: "http://server:3001",
  DATABASE_URL: "postgres://localhost:5432/orbo",
  HOSTNAME: "laptop",
});

describe("worker env", () => {
  test("parses a complete environment", () => {
    const { owner, livenessPort, ...rest } = loadWorkerEnv(base());
    expect(rest).toEqual({
      workerSharedSecret: "a-long-enough-worker-shared-secret",
      serverInternalUrl: "http://server:3001",
      databaseUrl: "postgres://localhost:5432/orbo",
    });
    expect(owner).toMatch(/^routines\/laptop-[0-9a-f]{8}$/);
    // Defaulted, so a container probe has a port without being told one.
    expect(livenessPort).toBe(3002);
  });

  test.each(["WORKER_SHARED_SECRET", "SERVER_INTERNAL_URL", "DATABASE_URL"])(
    "refuses an unset %s",
    (name) => {
      const env = base();
      delete env[name as keyof typeof env];
      expect(() => loadWorkerEnv(env)).toThrow("is not set");
    },
  );

  test.each(["WORKER_SHARED_SECRET", "SERVER_INTERNAL_URL", "DATABASE_URL"])(
    "refuses a whitespace-only %s like an unset one",
    (name) => {
      expect(() => loadWorkerEnv({ ...base(), [name]: "   " })).toThrow(
        "is not set",
      );
    },
  );

  test("trims padded values", () => {
    const env = loadWorkerEnv({
      ...base(),
      WORKER_SHARED_SECRET: "  a-long-enough-worker-shared-secret  ",
      DATABASE_URL: "  postgres://localhost:5432/orbo  ",
    });
    expect(env.workerSharedSecret).toBe("a-long-enough-worker-shared-secret");
    expect(env.databaseUrl).toBe("postgres://localhost:5432/orbo");
  });

  test.each(["12345678", "x".repeat(23)])(
    "refuses a WORKER_SHARED_SECRET shorter than the strength floor (%p characters)",
    (short) => {
      expect(() =>
        loadWorkerEnv({ ...base(), WORKER_SHARED_SECRET: short }),
      ).toThrow(/too short to resist guessing/);
    },
  );

  test("the refusal names the floor and how to generate a real one", () => {
    expect(() =>
      loadWorkerEnv({ ...base(), WORKER_SHARED_SECRET: "12345678" }),
    ).toThrow(/openssl rand -base64 32/);
  });

  test("accepts a secret at exactly the floor", () => {
    const atFloor = "x".repeat(24);
    expect(
      loadWorkerEnv({ ...base(), WORKER_SHARED_SECRET: atFloor })
        .workerSharedSecret,
    ).toBe(atFloor);
  });

  test("defaults the liveness port, and 0 turns the endpoint off", () => {
    expect(
      loadWorkerEnv({ ...base(), WORKER_LIVENESS_PORT: "0" }).livenessPort,
    ).toBe(0);
    expect(
      loadWorkerEnv({ ...base(), WORKER_LIVENESS_PORT: "4455" }).livenessPort,
    ).toBe(4455);
  });

  test.each(["nope", "1.5", "-1", "70000", "8080x"])(
    "refuses a WORKER_LIVENESS_PORT of %p",
    (port) => {
      expect(() =>
        loadWorkerEnv({ ...base(), WORKER_LIVENESS_PORT: port }),
      ).toThrow(/WORKER_LIVENESS_PORT/);
    },
  );

  test.each([
    ["http://server:3001/", "http://server:3001"],
    ["http://server:3001///", "http://server:3001"],
  ])("strips trailing slashes from %p", (raw, normalised) => {
    expect(
      loadWorkerEnv({ ...base(), SERVER_INTERNAL_URL: raw }).serverInternalUrl,
    ).toBe(normalised);
  });

  test("refuses a URL that is only slashes", () => {
    expect(() =>
      loadWorkerEnv({ ...base(), SERVER_INTERNAL_URL: "///" }),
    ).toThrow("is not set");
  });

  test("names itself without a hostname, and never as the bare role", () => {
    const without = base();
    delete without.HOSTNAME;
    expect(loadWorkerEnv(without).owner).toMatch(/^routines\/[0-9a-f]{8}$/);
  });

  test.each(["", "   "])("does not read HOSTNAME=%p as a name", (hostname) => {
    const owner = loadWorkerEnv({ ...base(), HOSTNAME: hostname }).owner;
    expect(owner).not.toBe("routines/");
    expect(owner).toMatch(/^routines\/[0-9a-f]{8}$/);
  });

  test("trims the hostname", () => {
    expect(loadWorkerEnv({ ...base(), HOSTNAME: "  laptop  " }).owner).toMatch(
      /^routines\/laptop-[0-9a-f]{8}$/,
    );
  });

  test("two workers on one host never share an owner", () => {
    expect(loadWorkerEnv(base()).owner).not.toBe(loadWorkerEnv(base()).owner);
  });
});

describe("routineRunUrl", () => {
  test("joins the run path onto the base URL", () => {
    expect(routineRunUrl("http://server:3001")).toBe(
      "http://server:3001/internal/routines/run",
    );
  });

  test("a trailing-slash base normalises to a single-slash run URL", () => {
    const env = loadWorkerEnv({
      ...base(),
      SERVER_INTERNAL_URL: "http://server:3001/",
    });
    expect(routineRunUrl(env.serverInternalUrl)).toBe(
      "http://server:3001/internal/routines/run",
    );
  });
});
