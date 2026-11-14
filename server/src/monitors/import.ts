/**
 * OpenMuse → Monitors one-shot ETL (fixture-based, pure) — TD-09 step 3.
 *
 * Maps legacy `Monitor` records (the `records(owner, kind="monitors", id, data)`
 * rows of 01 §1.2/§2) onto the landed superset tables per 01 §6 ("direct",
 * owner string → `owner_user_id`) and the register's TD-09. Pure function over
 * JSON: no database reads or writes. The caller inserts the returned monitor
 * rows and offers the returned tasks through the task ledger.
 *
 * Mapping decisions (01 §6 + monitors.ts header + TD-09):
 * - `id` → `mon-<legacyId>` prefix, so an imported watch can never collide with
 *   a live one or with another imported record.
 * - `owner` → `ownerUserId` (the legacy records PK carried the owner string).
 * - `url` → verbatim; only http(s) targets are checkable, anything else is
 *   skipped, never repaired.
 * - `condition` → verbatim; absent (early legacy rows predate the field) falls
 *   to the column's own default `change`. Unknown values are skipped.
 * - `value` → verbatim; absent (added later in the legacy timeline) falls to
 *   `""`. For `price_below` the value must be a positive number, the same
 *   contract the column comment states — a non-numeric or non-positive value
 *   is skipped, not coerced.
 * - `intervalMinutes` → verbatim; must be an integer within the column's
 *   1..10080 CHECK.
 * - `status` → verbatim; must be one of the column's three values.
 * - `nextCheckAt` → `Date` (timestamptz). Accepts epoch-ms (a number) or an
 *   ISO string, whichever the legacy export carries.
 * - `taskId` is NOT imported. It named the legacy AgentTask that spawned the
 *   watch, which has no row in the unified `tasks` ledger — keeping it would
 *   break the `monitors.task_id` FK. That column means "the firing that ran
 *   this check as a unified task", and the import hands every still-active
 *   watch exactly that: one task offer at `nextCheckAt`, keyed
 *   `monitor:<legacyId>:<ISO>`, produced by `monitor:<newId>`, so the replayed
 *   offer collides with itself and the due sweep runs the watch like any
 *   other. Paused and stopped watches get no offer — nothing is due.
 */

import type { MonitorCondition, MonitorStatus } from "../db/schema";

/** One legacy Monitor record as it appears in a `records` export. */
export type LegacyMonitorInput = {
  id: unknown;
  owner: unknown;
  taskId?: unknown;
  url: unknown;
  condition?: unknown;
  value?: unknown;
  intervalMinutes: unknown;
  status: unknown;
  nextCheckAt: unknown;
  [key: string]: unknown;
};

export type MonitorImportInput =
  | { monitors: LegacyMonitorInput[] }
  | LegacyMonitorInput[];

export type ImportedMonitorRow = {
  id: string;
  ownerUserId: string;
  url: string;
  condition: MonitorCondition;
  value: string;
  intervalMinutes: number;
  status: MonitorStatus;
  nextCheckAt: Date;
};

/** The task-ledger offer descriptor for one still-active watch. */
export type MonitorTaskOffer = {
  key: string;
  producer: { kind: "monitor"; id: string };
  scheduledFor: Date;
};

export type MonitorImportSkip = {
  monitorId: string;
  reason: string;
};

export type MonitorImportReport = {
  imported: number;
  skipped: MonitorImportSkip[];
};

export type MonitorImportResult = {
  monitors: ImportedMonitorRow[];
  taskOffers: MonitorTaskOffer[];
  report: MonitorImportReport;
};

const CONDITIONS: readonly MonitorCondition[] = [
  "change",
  "contains",
  "price_below",
];
const STATUSES: readonly MonitorStatus[] = ["active", "paused", "stopped"];

function describeId(value: unknown): string {
  return typeof value === "string" && value ? value : "<unknown>";
}

function toTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Map legacy Monitor JSON onto `monitors` rows and task-ledger offers. Throws
 * `Error` on a malformed envelope; per-record problems skip that record and
 * land in `report.skipped` — never truncated, never repaired.
 */
export function importMonitors(input: MonitorImportInput): MonitorImportResult {
  const records = Array.isArray(input) ? input : input?.monitors;
  if (!Array.isArray(records)) {
    throw new Error(
      'monitor-import: input must be a record array or an object with a "monitors" array.',
    );
  }

  const monitors: ImportedMonitorRow[] = [];
  const taskOffers: MonitorTaskOffer[] = [];
  const skipped: MonitorImportSkip[] = [];

  for (const record of records) {
    if (typeof record !== "object" || record === null) {
      skipped.push({
        monitorId: "<unknown>",
        reason: "record is not an object",
      });
      continue;
    }
    const monitorId = describeId(record.id);

    if (typeof record.id !== "string" || record.id.trim() === "") {
      skipped.push({ monitorId, reason: "id must be a non-empty string" });
      continue;
    }
    const id = `mon-${record.id}`;

    if (typeof record.owner !== "string" || record.owner.trim() === "") {
      skipped.push({
        monitorId,
        reason: "owner must be a non-empty string; it becomes owner_user_id",
      });
      continue;
    }

    if (typeof record.url !== "string" || record.url.trim() === "") {
      skipped.push({ monitorId, reason: "url must be a non-empty string" });
      continue;
    }
    if (!/^https?:\/\//i.test(record.url)) {
      skipped.push({
        monitorId,
        reason: "url must be an http(s) target; only those are checkable",
      });
      continue;
    }

    let condition: MonitorCondition = "change";
    if (record.condition !== undefined && record.condition !== null) {
      const named =
        typeof record.condition === "string"
          ? CONDITIONS.find((c) => c === record.condition)
          : undefined;
      if (!named) {
        skipped.push({
          monitorId,
          reason:
            "condition must be change, contains, or price_below when present",
        });
        continue;
      }
      condition = named;
    }

    let value = "";
    if (record.value !== undefined && record.value !== null) {
      if (typeof record.value !== "string") {
        skipped.push({ monitorId, reason: "value must be text when present" });
        continue;
      }
      value = record.value;
    }
    if (condition === "price_below") {
      const price = Number(value);
      if (value === "" || !Number.isFinite(price) || price <= 0) {
        skipped.push({
          monitorId,
          reason: "price_below needs a positive numeric value",
        });
        continue;
      }
    }

    if (
      typeof record.intervalMinutes !== "number" ||
      !Number.isInteger(record.intervalMinutes) ||
      record.intervalMinutes < 1 ||
      record.intervalMinutes > 10080
    ) {
      skipped.push({
        monitorId,
        reason: "intervalMinutes must be an integer between 1 and 10080",
      });
      continue;
    }

    if (typeof record.status !== "string") {
      skipped.push({
        monitorId,
        reason: "status must be active, paused, or stopped",
      });
      continue;
    }
    const status = STATUSES.find((s) => s === record.status);
    if (!status) {
      skipped.push({
        monitorId,
        reason: "status must be active, paused, or stopped",
      });
      continue;
    }

    const nextCheckAt = toTimestamp(record.nextCheckAt);
    if (!nextCheckAt) {
      skipped.push({
        monitorId,
        reason: "nextCheckAt must be epoch-ms or an ISO timestamp",
      });
      continue;
    }

    monitors.push({
      id,
      ownerUserId: record.owner,
      url: record.url,
      condition,
      value,
      intervalMinutes: record.intervalMinutes,
      status,
      nextCheckAt,
    });

    // Only an active watch is due something; paused and stopped ones keep
    // their state and no open task.
    if (status === "active") {
      taskOffers.push({
        key: `monitor:${record.id}:${nextCheckAt.toISOString()}`,
        producer: { kind: "monitor", id },
        scheduledFor: nextCheckAt,
      });
    }
  }

  return {
    monitors,
    taskOffers,
    report: { imported: monitors.length, skipped },
  };
}
