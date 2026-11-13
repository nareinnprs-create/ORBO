import { describe, expect, test } from "bun:test";
import {
  inQuietHours,
  localClock,
  nudgeLookbackMs,
  nudgePolicyFromEnv,
  nudgeVerdict,
} from "../src/proactive/nudges";

/**
 * The nudge cooldown, decided here without a database: the store supplies moments and this decides.
 * Every assertion pins the policy's own time zone to UTC so the hour-of-day arithmetic is the same
 * on every machine the suite runs on; a deployment without ORBO_NUDGE_TIMEZONE gets its own local
 * clock, which is what `localClock` is for and why it is exercised with a zone here.
 */

const at = (iso: string) => new Date(iso);
const policy = (overrides: Record<string, unknown> = {}) => ({
  maxPerDay: 3,
  spacingHours: 48,
  quietStartHour: 22,
  quietEndHour: 8,
  timeZone: "UTC",
  ...overrides,
});

describe("environment configuration", () => {
  test("absent variables give the shipped policy", () => {
    const parsed = nudgePolicyFromEnv({});
    expect(parsed.maxPerDay).toBe(3);
    expect(parsed.spacingHours).toBe(48);
    expect(parsed.quietStartHour).toBe(22);
    expect(parsed.quietEndHour).toBe(8);
    expect(parsed.timeZone).toBeUndefined();
  });

  test("each variable is read, and a value that is not a number is ignored", () => {
    const parsed = nudgePolicyFromEnv({
      ORBO_NUDGE_MAX_PER_DAY: "1",
      ORBO_NUDGE_SPACING_HOURS: "72",
      ORBO_NUDGE_QUIET_START: "20",
      ORBO_NUDGE_QUIET_END: "6",
      ORBO_NUDGE_TIMEZONE: "Europe/Berlin",
    });
    expect(parsed).toEqual({
      maxPerDay: 1,
      spacingHours: 72,
      quietStartHour: 20,
      quietEndHour: 6,
      timeZone: "Europe/Berlin",
    });
    // A deployment that mistypes one bound keeps the shipped default for that bound rather than
    // getting a policy that cannot be parsed at all.
    expect(nudgePolicyFromEnv({ ORBO_NUDGE_MAX_PER_DAY: "many" }).maxPerDay).toBe(
      3,
    );
    // Zero is a legitimate choice (a deployment switching nudges off), and clamps keep the rest
    // in the range the quiet-hour arithmetic understands.
    expect(nudgePolicyFromEnv({ ORBO_NUDGE_MAX_PER_DAY: "0" }).maxPerDay).toBe(0);
    expect(
      nudgePolicyFromEnv({ ORBO_NUDGE_QUIET_START: "99" }).quietStartHour,
    ).toBe(23);
  });
});

describe("local clock", () => {
  test("hour and calendar date come from the policy's zone, not the machine's", () => {
    // 23:30 UTC on Jul 1 is 01:30 on Jul 2 in Berlin (CEST, fixed offset in summer); both readings
    // are asserted so the test cannot pass by the machine's own zone happening to agree.
    const moment = at("2026-07-01T23:30:00Z");
    expect(localClock(moment, "UTC")).toEqual({
      hour: 23,
      localDate: "2026-07-01",
    });
    expect(localClock(moment, "Europe/Berlin")).toEqual({
      hour: 1,
      localDate: "2026-07-02",
    });
  });
});

describe("quiet hours", () => {
  test("the default window wraps midnight", () => {
    const defaultPolicy = policy();
    expect(inQuietHours(at("2026-06-01T23:00:00Z"), defaultPolicy)).toBe(true);
    expect(inQuietHours(at("2026-06-01T03:00:00Z"), defaultPolicy)).toBe(true);
    // Inclusive start, exclusive end: 22:00 is inside, 08:00 is not.
    expect(inQuietHours(at("2026-06-01T22:00:00Z"), defaultPolicy)).toBe(true);
    expect(inQuietHours(at("2026-06-01T08:00:00Z"), defaultPolicy)).toBe(false);
    expect(inQuietHours(at("2026-06-01T21:59:00Z"), defaultPolicy)).toBe(
      false,
    );
    expect(inQuietHours(at("2026-06-01T07:59:00Z"), defaultPolicy)).toBe(true);
  });

  test("a window that does not wrap and a degenerate window", () => {
    const daytime = policy({ quietStartHour: 9, quietEndHour: 17 });
    expect(inQuietHours(at("2026-06-01T12:00:00Z"), daytime)).toBe(true);
    expect(inQuietHours(at("2026-06-01T18:00:00Z"), daytime)).toBe(false);
    // Equal start and end means no quiet window at all, never "always quiet".
    expect(
      inQuietHours(at("2026-06-01T12:00:00Z"), policy({ quietStartHour: 9, quietEndHour: 9 })),
    ).toBe(false);
  });
});

describe("the verdict", () => {
  test("quiet hours refuse before anything is counted", () => {
    const verdict = nudgeVerdict({
      now: at("2026-06-01T23:00:00Z"),
      policy: policy(),
      recentNudges: [],
    });
    expect(verdict).toEqual({
      allowed: false,
      reason: expect.stringContaining("quiet hours"),
    });
  });

  test("the spacing bound refuses inside 48h of any nudge, whatever the Bot", () => {
    const base = at("2026-06-01T12:00:00Z");
    const inside = nudgeVerdict({
      now: base,
      policy: policy(),
      recentNudges: [new Date(base.getTime() - 47 * 3_600_000)],
    });
    expect(inside.allowed).toBe(false);
    expect(inside).toMatchObject({ reason: expect.stringContaining("48h") });
    // At exactly the spacing the nudge is allowed again; the bound is "at least".
    const outside = nudgeVerdict({
      now: base,
      policy: policy(),
      recentNudges: [new Date(base.getTime() - 48 * 3_600_000)],
    });
    expect(outside.allowed).toBe(true);
  });

  test("the daily cap counts only today's nudges, and a new local day spends from zero", () => {
    const base = at("2026-06-03T12:00:00Z");
    const three = [
      at("2026-06-03T01:00:00Z"),
      at("2026-06-03T06:00:00Z"),
      at("2026-06-03T09:00:00Z"),
    ];
    /*
     * The shipped 48h spacing would refuse before the cap ever could — three nudges inside one
     * day leave the newest well inside 48 hours — so the cap is exercised under a short spacing,
     * the deployment choice that makes the cap the binding constraint.
     */
    const shortSpacing = policy({ spacingHours: 1 });
    const verdict = nudgeVerdict({
      now: base,
      policy: shortSpacing,
      recentNudges: three,
    });
    expect(verdict).toEqual({
      allowed: false,
      reason: expect.stringContaining("cap of 3"),
    });
    // Yesterday's nudges are yesterday's: a new local day spends from zero. Spacing is satisfied
    // here by construction (the last nudge is 27h old, past the 1h spacing).
    const verdictNextDay = nudgeVerdict({
      now: at("2026-06-04T12:00:00Z"),
      policy: shortSpacing,
      recentNudges: three,
    });
    expect(verdictNextDay.allowed).toBe(true);
    // A cap of zero refuses every nudge on the history alone.
    expect(
      nudgeVerdict({ now: base, policy: policy({ maxPerDay: 0 }), recentNudges: [] }),
    ).toMatchObject({ allowed: false, reason: expect.stringContaining("cap of 0") });
  });

  test("cap and spacing compose: whichever is stricter closes first", () => {
    const base = at("2026-06-03T12:00:00Z");
    // Inside spacing AND at cap: quiet hours are off, so a bound must refuse, and the sentence
    // says which one. This is the reading an operator gets from the log.
    const verdict = nudgeVerdict({
      now: base,
      policy: policy(),
      recentNudges: [
        at("2026-06-03T01:00:00Z"),
        at("2026-06-03T06:00:00Z"),
        at("2026-06-03T09:00:00Z"),
        // Ascending, as the store answers: the newest is the one the spacing bound reads.
        new Date(base.getTime() - 2 * 3_600_000),
      ],
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining("48h") });
  });

  test("an empty history is allowed outside quiet hours", () => {
    expect(
      nudgeVerdict({
        now: at("2026-06-03T12:00:00Z"),
        policy: policy(),
        recentNudges: [],
      }),
    ).toEqual({ allowed: true });
  });
});

describe("the lookback", () => {
  test("reaches the spacing window or a day, whichever is wider", () => {
    // 48h spacing needs 48h of rows; a 1h spacing still needs the whole local day for the cap.
    expect(nudgeLookbackMs(policy())).toBe(48 * 3_600_000);
    expect(nudgeLookbackMs(policy({ spacingHours: 1 }))).toBe(24 * 3_600_000);
    expect(nudgeLookbackMs(policy({ spacingHours: 96 }))).toBe(96 * 3_600_000);
  });
});
