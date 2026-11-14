import { describe, expect, test } from "bun:test";
import { singleUserEnabled } from "../src/auth/dev-actor";

/**
 * Whether this deployment lets every visitor in as one administrator.
 *
 * The most dangerous boolean in the codebase and it had no test. It used to be locked with
 * `NODE_ENV === "production"`, which is exactly the wrong way round: `NODE_ENV` is unset unless
 * somebody sets it, so a container on a VM with a hand-written env file and no identity provider
 * served the whole internet as an administrator, silently, because nothing was wrong from the
 * outside. It now takes an explicit flag and refuses to start without one.
 *
 * The cases below are the four a deployment can actually be in.
 *
 * This function reads only the flag and `NODE_ENV=production`, which is what these cases pin. Outside
 * production `NODE_ENV` decides nothing, and whether a deployment may HAVE no sign-in is a second
 * question, asked by `singleUserAllowed` in config.ts, which refuses it on any address other people
 * can reach.
 */
describe("running with no sign-in", () => {
  test("a configured provider always wins, whatever else is set", () => {
    // A provider means sign-in, so the flag cannot half-disable it. Asserted with the flag on,
    // because the dangerous reading is "the flag opens a deployment that has a provider".
    expect(singleUserEnabled({ ORBO_SINGLE_USER: "true" }, true)).toBe(false);
    expect(singleUserEnabled({}, true)).toBe(false);
  });

  test("no provider and the flag set runs open, because somebody said so", () => {
    expect(singleUserEnabled({ ORBO_SINGLE_USER: "true" }, false)).toBe(true);
  });

  test("the older name for the flag still works, so an existing .env keeps running", () => {
    expect(singleUserEnabled({ ORBO_DEV_NO_AUTH: "true" }, false)).toBe(true);
  });

  test("no provider and no flag refuses to start", () => {
    // The whole point. Not a warning, not a default: a deployment that would admit everybody as an
    // administrator does not come up, and says what to configure.
    expect(() => singleUserEnabled({}, false)).toThrow(
      /No identity provider is configured/,
    );
  });

  // NODE_ENV still decides nothing about WHETHER the ask is read — the flag is the only lock there.
  // It decides whether the ask is HONOURED (dev-actor.ts): under NODE_ENV=production both names
  // refuse, outside it both name the same mode and NODE_ENV is not looked at otherwise.
  test("outside production, NODE_ENV decides nothing", () => {
    expect(() =>
      singleUserEnabled({ NODE_ENV: "development" }, false),
    ).toThrow();
    expect(
      singleUserEnabled(
        { NODE_ENV: "development", ORBO_SINGLE_USER: "true" },
        false,
      ),
    ).toBe(true);
  });

  test("production refuses the flag under either name", () => {
    expect(() =>
      singleUserEnabled(
        { NODE_ENV: "production", ORBO_SINGLE_USER: "true" },
        false,
      ),
    ).toThrow(/NODE_ENV=production/);
    expect(() =>
      singleUserEnabled(
        { NODE_ENV: "production", ORBO_DEV_NO_AUTH: "true" },
        false,
      ),
    ).toThrow(/ORBO_DEV_NO_AUTH means nothing in production/);
  });

  test("NODE_ENV is read through config's trim semantic, and process.env when unset", () => {
    // `"production "` with a trailing space is what Docker's env_file and every dashboard text box
    // preserve verbatim, and the reason config.ts compares through a trimmed `optional`.
    expect(() =>
      singleUserEnabled(
        { NODE_ENV: "production ", ORBO_SINGLE_USER: "true" },
        false,
      ),
    ).toThrow(/NODE_ENV=production/);
    // No record entry, the environment itself is production: the boot path hands process.env in,
    // but a test record without NODE_ENV must consult it rather than pretend the gate is off.
    expect(() => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        singleUserEnabled({ ORBO_SINGLE_USER: "true" }, false);
      } finally {
        process.env.NODE_ENV = previous;
      }
    }).toThrow(/NODE_ENV=production/);
  });

  test("a flag set to anything but true is not a yes", () => {
    // Read exactly, so `ORBO_SINGLE_USER=false` and a stray `1` both refuse rather than opening.
    for (const value of ["false", "1", "yes", "TRUE", ""]) {
      expect(() =>
        singleUserEnabled({ ORBO_SINGLE_USER: value }, false),
      ).toThrow();
    }
  });
});
