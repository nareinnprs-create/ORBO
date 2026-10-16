/**
 * Watch-check executor (25 M4, first slice).
 *
 * Given one monitor row and a freshly fetched content snapshot, decides fired/not.
 * Pure by construction: page fetching arrives as an injected `fetchPage`, time arrives
 * as an injected `now`, and this module performs no network, starts no timers, and
 * writes no rows — not monitors, not notifications. The caller persists the returned
 * `lastHash`/`lastValue`/`checkedAt`/`nextCheckAt`; alert fan-out stays quiet until
 * the D9 route consumer exists, so the returned `alert` payload is in-memory only
 * (25 R6).
 *
 * Condition semantics mirror the legacy `observe` executor row-for-row:
 * - `change`: fires when a previous baseline exists and the normalized text differs.
 *   The first check only saves the baseline and never fires.
 * - `contains`: fires when the text contains `value` (case-insensitive).
 * - `price_below`: fires when any `$`/`USD` price in the text is below `value`.
 *
 * Deliberately NOT ported in this slice (see schema header): failure backoff, the
 * 5-strike auto-pause, the relative-time quiet rule, and dedup alert keys. Those
 * travel with the fan-out slice, where their tests live.
 */
import type { Monitor } from "../db/schema/monitors";

export type WatchCondition = Monitor["condition"];

/** The monitor fields a check reads. A full `Monitor` row always satisfies this. */
export interface WatchMonitor {
  id: string;
  url: string;
  condition: WatchCondition;
  value: string;
  intervalMinutes: number;
  lastHash: string | null | undefined;
}

/** One fetched page, supplied by the caller's injected fetch. */
export interface WatchSnapshot {
  url: string;
  title: string;
  text: string;
}

export type FetchPage = (url: string) => Promise<WatchSnapshot>;
export type Clock = () => Date;

/** In-memory alert payload for a firing. Returned, never written (fan-out is quiet). */
export interface WatchAlert {
  title: string;
  body: string;
  key: string;
}

export interface WatchCheckResult {
  monitorId: string;
  /** True when the condition matched this snapshot. */
  fired: boolean;
  /** True when the monitor target itself is unusable; `fetchPage` is never called. */
  invalidTarget: boolean;
  /** Human-readable reason: validation failure or fetch failure. Null on a clean check. */
  error: string | null;
  /** Present only when `fired`. In-memory only — the caller writes no alert rows. */
  alert: WatchAlert | null;
  /** State for the caller to persist on the monitor row. */
  lastHash: string;
  lastValue: string;
  checkedAt: Date;
  nextCheckAt: Date;
}

const MAX_INTERVAL_MINUTES = 10080;
const PRICE_PATTERN = /(?:\$|USD)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g;

/** Deterministic fingerprint of normalized text (FNV-1a, hex). No crypto, no I/O. */
export function hashWatchText(normalized: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeWatchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function matchesPrice(text: string, threshold: number): boolean {
  PRICE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PRICE_PATTERN)) {
    if (Number(match[1].replace(/,/g, "")) < threshold) return true;
  }
  return false;
}

function invalidReason(monitor: WatchMonitor): string | null {
  let protocol: string;
  try {
    protocol = new URL(monitor.url).protocol;
  } catch {
    return `Unusable watch target: ${monitor.url}`;
  }
  if (protocol !== "http:" && protocol !== "https:") {
    return `Unusable watch target: ${monitor.url}`;
  }
  if (
    monitor.condition !== "change" &&
    monitor.condition !== "contains" &&
    monitor.condition !== "price_below"
  ) {
    return `Unknown watch condition: ${String(monitor.condition)}`;
  }
  if (monitor.condition === "contains" && !monitor.value.trim()) {
    return "A contains watch needs a value to look for";
  }
  if (monitor.condition === "price_below") {
    const threshold = Number(monitor.value);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return "A price watch needs a positive price";
    }
  }
  if (
    !Number.isInteger(monitor.intervalMinutes) ||
    monitor.intervalMinutes < 1 ||
    monitor.intervalMinutes > MAX_INTERVAL_MINUTES
  ) {
    return `Watch interval must be 1–${MAX_INTERVAL_MINUTES} minutes`;
  }
  return null;
}

export async function checkWatch(
  monitor: WatchMonitor,
  deps: { fetchPage: FetchPage; now?: Clock },
): Promise<WatchCheckResult> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now();
  const schedule = (lastHash: string, lastValue: string) => ({
    lastHash,
    lastValue,
    checkedAt,
    nextCheckAt: new Date(
      checkedAt.getTime() + monitor.intervalMinutes * 60_000,
    ),
  });

  const reason = invalidReason(monitor);
  if (reason) {
    return {
      monitorId: monitor.id,
      fired: false,
      invalidTarget: true,
      error: reason,
      alert: null,
      ...schedule(monitor.lastHash ?? "", ""),
    };
  }

  let snapshot: WatchSnapshot;
  try {
    snapshot = await deps.fetchPage(monitor.url);
  } catch (error) {
    return {
      monitorId: monitor.id,
      fired: false,
      invalidTarget: false,
      error: error instanceof Error ? error.message : "Page check failed",
      alert: null,
      ...schedule(monitor.lastHash ?? "", ""),
    };
  }

  const text = normalizeWatchText(snapshot.text);
  const currentHash = hashWatchText(text);
  const lastValue = text.slice(0, 1000);

  let fired: boolean;
  if (monitor.condition === "change") {
    // No baseline yet: this check saves one and stays quiet.
    fired = Boolean(monitor.lastHash) && monitor.lastHash !== currentHash;
  } else if (monitor.condition === "contains") {
    fired = text.toLowerCase().includes(monitor.value.trim().toLowerCase());
  } else {
    fired = matchesPrice(text, Number(monitor.value));
  }

  return {
    monitorId: monitor.id,
    fired,
    invalidTarget: false,
    error: null,
    alert: fired
      ? {
          title: `Watch fired: ${monitor.url}`,
          body: `Condition met at ${snapshot.url}: ${text.slice(0, 240)}`,
          key: `monitor:${monitor.id}:${currentHash}`,
        }
      : null,
    ...schedule(currentHash, lastValue),
  };
}
