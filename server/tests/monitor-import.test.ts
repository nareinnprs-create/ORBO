import { describe, expect, test } from "bun:test";
import {
  importMonitors,
  type LegacyMonitorInput,
} from "../src/monitors/import";

function monitor(
  overrides: Partial<LegacyMonitorInput> = {},
): LegacyMonitorInput {
  return {
    id: "8f2c1e44-1111-4222-8333-444455556666",
    owner: "mus-user-1",
    taskId: "legacy-task-9",
    url: "https://example.test/price",
    condition: "price_below",
    value: "42.50",
    intervalMinutes: 30,
    status: "active",
    nextCheckAt: 1763000000000,
    ...overrides,
  };
}

describe("monitor-import", () => {
  test("maps a valid record onto a monitors row and one due task offer", () => {
    const result = importMonitors([monitor()]);

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.monitors).toEqual([
      {
        id: "mon-8f2c1e44-1111-4222-8333-444455556666",
        ownerUserId: "mus-user-1",
        url: "https://example.test/price",
        condition: "price_below",
        value: "42.50",
        intervalMinutes: 30,
        status: "active",
        nextCheckAt: new Date(1763000000000),
      },
    ]);
    // The legacy taskId does not travel: the offer is the new-world task link.
    expect(result.taskOffers).toEqual([
      {
        key: "monitor:8f2c1e44-1111-4222-8333-444455556666:2025-11-13T02:13:20.000Z",
        producer: {
          kind: "monitor",
          id: "mon-8f2c1e44-1111-4222-8333-444455556666",
        },
        scheduledFor: new Date(1763000000000),
      },
    ]);
  });

  test("accepts an envelope object, ISO timestamps, and both timestamp forms", () => {
    const epoch = importMonitors({
      monitors: [monitor({ id: "epoch-1", nextCheckAt: 1763000000000 })],
    });
    const iso = importMonitors([
      monitor({ id: "iso-1", nextCheckAt: "2026-11-13T00:00:00.000Z" }),
    ]);

    expect(epoch.report).toEqual({ imported: 1, skipped: [] });
    expect(iso.report).toEqual({ imported: 1, skipped: [] });
    expect(iso.monitors[0]!.nextCheckAt).toEqual(
      new Date("2026-11-13T00:00:00.000Z"),
    );
    expect(iso.taskOffers[0]!.key).toBe(
      "monitor:iso-1:2026-11-13T00:00:00.000Z",
    );
  });

  test("condition and value fall to their column defaults when absent", () => {
    const result = importMonitors([
      monitor({ id: "bare-1", condition: undefined, value: undefined }),
    ]);

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.monitors[0]!.condition).toBe("change");
    expect(result.monitors[0]!.value).toBe("");
  });

  test("a paused watch imports its row and gets no task offer", () => {
    const result = importMonitors([monitor({ status: "paused" })]);

    expect(result.report).toEqual({ imported: 1, skipped: [] });
    expect(result.monitors[0]!.status).toBe("paused");
    expect(result.taskOffers).toEqual([]);
  });

  test("a contains watch takes any text value; change ignores its value", () => {
    const result = importMonitors([
      monitor({ id: "contains-1", condition: "contains", value: "sold out" }),
      monitor({ id: "change-1", condition: "change", value: "ignored" }),
    ]);

    expect(result.report).toEqual({ imported: 2, skipped: [] });
  });

  test("per-record problems skip that record with a reason, importing the rest", () => {
    const result = importMonitors([
      "not-an-object" as unknown as LegacyMonitorInput,
      monitor({ id: "" }),
      monitor({ id: "no-owner", owner: "" }),
      monitor({ id: "ftp", url: "ftp://example.test/file" }),
      monitor({ id: "bad-condition", condition: "cheaper" }),
      monitor({ id: "bad-price", value: "free" }),
      monitor({ id: "zero-price", value: "0" }),
      monitor({ id: "bad-interval", intervalMinutes: 0 }),
      monitor({ id: "big-interval", intervalMinutes: 10081 }),
      monitor({ id: "bad-status", status: "sleeping" }),
      monitor({ id: "bad-next", nextCheckAt: "soon" }),
      monitor({ id: "good-1" }),
    ]);

    expect(result.report.imported).toBe(1);
    expect(result.monitors[0]!.id).toBe("mon-good-1");
    expect(result.report.skipped.map((skip) => skip.monitorId)).toEqual([
      "<unknown>",
      "<unknown>",
      "no-owner",
      "ftp",
      "bad-condition",
      "bad-price",
      "zero-price",
      "bad-interval",
      "big-interval",
      "bad-status",
      "bad-next",
    ]);
  });

  test("malformed envelopes refuse the whole batch", () => {
    expect(() => importMonitors({ nope: [] } as never)).toThrow(
      /monitors" array/,
    );
    expect(() => importMonitors("monitors" as never)).toThrow(
      /monitors" array/,
    );
  });
});
