import { describe, expect, test } from "bun:test";
import {
  checkWatch,
  type FetchPage,
  type WatchMonitor,
} from "../src/monitors/check";

/**
 * The watch-check executor, asserted without a database, without a network, and
 * without timers.
 *
 * Fetching arrives as an injected fake and time as an injected clock, so what is
 * under test is the decision alone: a `change` watch fires only against a saved
 * baseline that differs, `contains`/`price_below` fire on match, and an unusable
 * target never reaches the fetch. Nothing here needs Postgres (Docker is down) and
 * nothing here writes an alert row — fan-out stays quiet until the D9 consumer.
 */

const NOW = new Date("2026-10-16T12:00:00.000Z");
const now = () => new Date(NOW);

function monitor(overrides: Partial<WatchMonitor> = {}): WatchMonitor {
  return {
    id: "monitor_1",
    url: "https://example.com/page",
    condition: "change",
    value: "",
    intervalMinutes: 15,
    lastHash: null,
    ...overrides,
  };
}

function fetchText(text: string, calls: string[]): FetchPage {
  return async (url: string) => {
    calls.push(url);
    return { url, title: "Example", text };
  };
}

describe("watch-check executor", () => {
  test("a change watch saves its first baseline without firing", async () => {
    const calls: string[] = [];
    const result = await checkWatch(monitor(), {
      fetchPage: fetchText("Hello world", calls),
      now,
    });
    expect(result.fired).toBe(false);
    expect(result.invalidTarget).toBe(false);
    expect(result.error).toBeNull();
    expect(result.alert).toBeNull();
    expect(calls).toEqual(["https://example.com/page"]);
    expect(result.lastHash).not.toBe("");
    expect(result.lastValue).toBe("Hello world");
    expect(result.checkedAt).toEqual(NOW);
    expect(result.nextCheckAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
  });

  test("a change watch stays quiet on identical text and fires on a difference", async () => {
    const first = await checkWatch(monitor(), {
      fetchPage: fetchText("Hello world", []),
      now,
    });
    const baseline = monitor({ lastHash: first.lastHash });

    const same = await checkWatch(baseline, {
      fetchPage: fetchText("Hello   world", []),
      now,
    });
    expect(same.fired).toBe(false);
    expect(same.alert).toBeNull();

    const changed = await checkWatch(baseline, {
      fetchPage: fetchText("Hello there", []),
      now,
    });
    expect(changed.fired).toBe(true);
    expect(changed.alert?.key).toBe(`monitor:monitor_1:${changed.lastHash}`);
    expect(changed.alert?.body).toContain("https://example.com/page");
  });

  test("a contains watch fires on match regardless of baseline or case", async () => {
    const hit = await checkWatch(
      monitor({ condition: "contains", value: "In Stock" }),
      {
        fetchPage: fetchText("Only 3 left — IN STOCK now", []),
        now,
      },
    );
    expect(hit.fired).toBe(true);
    expect(hit.alert).not.toBeNull();

    const miss = await checkWatch(
      monitor({ condition: "contains", value: "In Stock" }),
      {
        fetchPage: fetchText("Sold out, check again later", []),
        now,
      },
    );
    expect(miss.fired).toBe(false);
    expect(miss.alert).toBeNull();
  });

  test("a price watch fires only below its threshold", async () => {
    const cheap = await checkWatch(
      monitor({ condition: "price_below", value: "50" }),
      {
        fetchPage: fetchText("Sale! Only $45.99 today", []),
        now,
      },
    );
    expect(cheap.fired).toBe(true);

    const dear = await checkWatch(
      monitor({ condition: "price_below", value: "50" }),
      {
        fetchPage: fetchText("List price USD 60.00", []),
        now,
      },
    );
    expect(dear.fired).toBe(false);
  });

  test("an unusable target never reaches the fetch", async () => {
    const calls: string[] = [];
    for (const bad of [
      monitor({ url: "not a url" }),
      monitor({ url: "ftp://example.com/file" }),
      monitor({ url: "" }),
      monitor({ condition: "contains", value: "   " }),
      monitor({ condition: "price_below", value: "free" }),
    ]) {
      const result = await checkWatch(bad, {
        fetchPage: fetchText("x", calls),
        now,
      });
      expect(result.fired).toBe(false);
      expect(result.invalidTarget).toBe(true);
      expect(result.error).not.toBeNull();
      expect(result.alert).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  test("a fetch failure is a failed check, not a firing and not an invalid target", async () => {
    const failing: FetchPage = async () => {
      throw new Error("connection reset");
    };
    const result = await checkWatch(monitor({ lastHash: "baseline" }), {
      fetchPage: failing,
      now,
    });
    expect(result.fired).toBe(false);
    expect(result.invalidTarget).toBe(false);
    expect(result.error).toBe("connection reset");
    expect(result.alert).toBeNull();
    // The check is still scheduled; a failure never stops the watch in this slice.
    expect(result.nextCheckAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    expect(result.lastHash).toBe("baseline");
  });
});
