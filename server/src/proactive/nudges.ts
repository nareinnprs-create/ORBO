/**
 * Proactive nudge discipline: the cooldown a Bot's background research is under before it may
 * ping its person.
 *
 * The suggestions a proactive run produces are already bounded per run; what was unbounded is how
 * often those suggestions reach OUT to the person. This module is the answer: at most so many
 * nudges a day per person, at least so long between one person's nudges whatever the Bot, and
 * never during that deployment's quiet hours. The verdict is computed from the `proactive_nudges`
 * table through the store, so restarts and replicas inherit the same counters rather than a fresh
 * allowance.
 *
 * Nothing here is a suggestion about what to propose — a run may still fill its quota of
 * suggestions. This is only about the ping. A suggestion that arrives inside quiet hours stays on
 * the person's Bot page (open suggestions are listed there) and is simply not pushed now.
 *
 * Configured from the environment, because the right numbers are a deployment's own:
 *
 *   ORBO_NUDGE_MAX_PER_DAY    (default 3)
 *   ORBO_NUDGE_SPACING_HOURS  (default 48)
 *   ORBO_NUDGE_QUIET_START    (default 22 — hour of day, local)
 *   ORBO_NUDGE_QUIET_END      (default 8)
 *   ORBO_NUDGE_TIMEZONE       (IANA name; absent means the deployment's local time)
 */
import { z } from "zod";

export type NudgeVerdict = { allowed: true } | { allowed: false; reason: string };

/** The shipped policy, before a deployment tunes it with ORBO_NUDGE_*. */
export const DEFAULT_NUDGE_MAX_PER_DAY = 3;
export const DEFAULT_NUDGE_SPACING_HOURS = 48;
export const DEFAULT_NUDGE_QUIET_START_HOUR = 22;
export const DEFAULT_NUDGE_QUIET_END_HOUR = 8;

export type NudgePolicy = {
  /** Per person per day, across every Bot: three pings is already a chatty day. */
  maxPerDay: number;
  /** Minimum hours between one person's nudges, whatever the Bot. */
  spacingHours: number;
  /**
   * The quiet window in hour-of-day terms, inclusive at the start and exclusive at the end, so
   * `[22, 8)` covers 22:00 through 07:59. It may wrap midnight, which is what the default does.
   */
  quietStartHour: number;
  quietEndHour: number;
  /** IANA time zone for hour-of-day and day boundaries; absent means the deployment's local time. */
  timeZone?: string;
};

const hourOfDayCheck = z.number().int().min(0).max(23);
void hourOfDayCheck;

export function nudgePolicyFromEnv(
  env: Record<string, string | undefined>,
): NudgePolicy {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const parsed = z.coerce.number().safeParse(raw);
    return parsed.success ? parsed.data : fallback;
  };
  const timeZone = env.ORBO_NUDGE_TIMEZONE?.trim() || undefined;
  return {
    maxPerDay: Math.max(
      0,
      read("ORBO_NUDGE_MAX_PER_DAY", DEFAULT_NUDGE_MAX_PER_DAY),
    ),
    spacingHours: Math.max(
      0,
      read("ORBO_NUDGE_SPACING_HOURS", DEFAULT_NUDGE_SPACING_HOURS),
    ),
    quietStartHour: Math.min(
      23,
      Math.max(
        0,
        read("ORBO_NUDGE_QUIET_START", DEFAULT_NUDGE_QUIET_START_HOUR),
      ),
    ),
    quietEndHour: Math.min(
      23,
      Math.max(0, read("ORBO_NUDGE_QUIET_END", DEFAULT_NUDGE_QUIET_END_HOUR)),
    ),
    ...(timeZone ? { timeZone } : {}),
  };
}

/** The local hour-of-day and local calendar date, read with the platform's own calendar. */
export function localClock(
  now: Date,
  timeZone?: string,
): { hour: number; localDate: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    ...(timeZone ? { timeZone } : {}),
    hour: "numeric",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: Number(value("hour")) % 24,
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

/** Whether `now`'s local hour sits inside the quiet window, including the wrap past midnight. */
export function inQuietHours(now: Date, policy: NudgePolicy): boolean {
  const { hour } = localClock(now, policy.timeZone);
  if (policy.quietStartHour === policy.quietEndHour) return false;
  if (policy.quietStartHour < policy.quietEndHour)
    return hour >= policy.quietStartHour && hour < policy.quietEndHour;
  return hour >= policy.quietStartHour || hour < policy.quietEndHour;
}

/** What the store hands over: the moments of one person's recent nudges, newest last. */
export type NudgeVerdictInput = {
  now: Date;
  policy: NudgePolicy;
  /** When each of this person's recent nudges happened, any Bot. */
  recentNudges: Date[];
};

/**
 * The whole verdict, pure so it is tested without a database: the store supplies the history, the
 * caller supplies the moment. Refusals say which bound closed, because the reason is logged and an
 * operator reading the logs should be able to tell a tuned cap from a bug.
 */
export function nudgeVerdict(input: NudgeVerdictInput): NudgeVerdict {
  const { now, policy, recentNudges } = input;
  if (inQuietHours(now, policy))
    return {
      allowed: false,
      reason: `quiet hours (${policy.quietStartHour}:00-${policy.quietEndHour}:00 local)`,
    };
  const spacingMs = policy.spacingHours * 3_600_000;
  const last = recentNudges.at(-1);
  if (last && now.getTime() - last.getTime() < spacingMs)
    return {
      allowed: false,
      reason: `the last nudge to this person was ${Math.floor((now.getTime() - last.getTime()) / 3_600_000)}h ago, inside the ${policy.spacingHours}h spacing`,
    };
  const { localDate } = localClock(now, policy.timeZone);
  const nudgesToday = recentNudges.filter(
    (at) => localClock(at, policy.timeZone).localDate === localDate,
  ).length;
  if (nudgesToday >= policy.maxPerDay)
    return {
      allowed: false,
      reason: `this person has already been nudged ${nudgesToday} times today, at the cap of ${policy.maxPerDay}`,
    };
  return { allowed: true };
}

/**
 * How far back the store must read to answer every bound: the spacing window, or a day — the
 * wider of the two, because "today" in local terms reaches at most twenty-four hours back.
 */
export function nudgeLookbackMs(policy: NudgePolicy): number {
  return Math.max(policy.spacingHours, 24) * 3_600_000;
}
