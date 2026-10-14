import { afterEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createPageFrameStore } from "../src/computer/page-frames";
import { createDatabase } from "../src/db/client";
import { computerPageFrame } from "../src/db/schema";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * A conversation is a record, and a record must not change its mind.
 *
 * The transcript used to fetch the live screen for every past turn, so an answer about one page sat
 * under a picture of whichever page the Bot had open by the time somebody read it back. The frame is
 * kept per computer and TURN, which is the identity of the thing being remembered; keying it on the
 * page instead let a second visit to one address rewrite an earlier turn's picture, which is the
 * same mutability wearing a different hat.
 *
 * Driven against the database rather than a fake, because the properties under test are the
 * database's: which rows collide, and what happens when they do.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);

const store = createPageFrameStore(database);
const computers: string[] = [];

function computerId(): string {
  const id = `frame-probe-${crypto.randomUUID().slice(0, 8)}`;
  computers.push(id);
  return id;
}

afterEach(async () => {
  for (const id of computers.splice(0)) {
    await database
      .delete(computerPageFrame)
      .where(eq(computerPageFrame.computerId, id));
  }
});

describe("kept page frames", () => {
  test("a turn is read back with the frame it opened its page on", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-1",
      url: "https://example.com/one",
      title: "One",
      frame: "AAAA",
    });

    const stored = await store.load(id, "call-1");
    expect(stored?.frame).toBe("AAAA");
    expect(stored?.title).toBe("One");
    expect(stored?.url).toBe("https://example.com/one");
  });

  test("a turn nobody photographed has no frame", async () => {
    expect(await store.load(computerId(), "call-missing")).toBe(null);
  });

  test("two turns on one computer keep their own frames", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-a",
      url: "https://a.example",
      frame: "A",
    });
    await store.save({
      computerId: id,
      toolCallId: "call-b",
      url: "https://b.example",
      frame: "B",
    });

    expect((await store.load(id, "call-a"))?.frame).toBe("A");
    expect((await store.load(id, "call-b"))?.frame).toBe("B");
  });

  /*
   * The whole reason the key is the turn. Two visits to one address are two turns and each keeps its
   * own picture; keyed on the page, the second rewrote the first and a past turn changed under the
   * person reading it.
   */
  test("visiting the same page again leaves the earlier turn alone", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-first",
      url: "https://news.example",
      title: "Before",
      frame: "OLD",
    });
    await store.save({
      computerId: id,
      toolCallId: "call-second",
      url: "https://news.example",
      title: "After",
      frame: "NEW",
    });

    expect((await store.load(id, "call-first"))?.frame).toBe("OLD");
    expect((await store.load(id, "call-second"))?.frame).toBe("NEW");
  });

  /* A turn happens once. A second write for it is a retry or a mistake, and neither may change it. */
  test("a turn's frame is written once and never rewritten", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-1",
      url: "https://example.com",
      frame: "FIRST",
    });
    await store.save({
      computerId: id,
      toolCallId: "call-1",
      url: "https://example.com",
      frame: "SECOND",
    });

    expect((await store.load(id, "call-1"))?.frame).toBe("FIRST");
  });

  /*
   * The computer is part of the key, not decoration. A caller who may reach one Bot must not be able
   * to read another Bot's screen by naming a turn.
   */
  test("one computer cannot read another computer's frame", async () => {
    const mine = computerId();
    const theirs = computerId();
    await store.save({
      computerId: theirs,
      toolCallId: "call-1",
      url: "https://payroll.example",
      frame: "SECRET",
    });

    expect(await store.load(mine, "call-1")).toBe(null);
  });

  /*
   * "Every login the Bot had is gone" is not true while pictures of the signed-in pages are still
   * readable from the transcript.
   */
  test("wiping a computer takes its pictures with it", async () => {
    const mine = computerId();
    const theirs = computerId();
    await store.save({
      computerId: mine,
      toolCallId: "call-1",
      url: "https://inbox.example",
      frame: "MINE",
    });
    await store.save({
      computerId: theirs,
      toolCallId: "call-1",
      url: "https://inbox.example",
      frame: "THEIRS",
    });

    expect(await store.clear(mine)).toBe(1);
    expect(await store.load(mine, "call-1")).toBe(null);
    // And nobody else's.
    expect((await store.load(theirs, "call-1"))?.frame).toBe("THEIRS");
  });

  /*
   * `purge` is deployment-wide and cannot be scoped by computer — it is the reaper's query, and the
   * reaper must not be narrowed to one Bot. So the sweep is proved with a window no sibling test's
   * rows reach: this row is aged ten years and the window is one, where every other test keeps its
   * frames inside ninety days. A plain `purge(0)` here would delete every other file's frames
   * mid-test, which is a fixed test corrupting its neighbours rather than testing the store.
   */
  test("frames past the retention window are swept", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-1",
      url: "https://example.com",
      frame: "AAAA",
    });

    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    // Nothing is that old yet, and nothing else in the suite ever is.
    expect(await store.purge(ONE_YEAR_MS)).toBe(0);

    await database
      .update(computerPageFrame)
      .set({ capturedAt: sql`now() - make_interval(days => 3650)` })
      .where(eq(computerPageFrame.computerId, id));
    expect(await store.purge(ONE_YEAR_MS)).toBe(1);
    expect(await store.load(id, "call-1")).toBe(null);
  });

  /*
   * Refused rather than truncated. Half a PNG is not a smaller picture, it is a broken one, and the
   * turn falls back to naming the page it opened.
   */
  test("a frame too large to be a screenshot is not kept", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "call-1",
      url: "https://huge.example",
      frame: "x".repeat(4 * 1024 * 1024 + 1),
    });

    expect(await store.load(id, "call-1")).toBe(null);
  });

  test("a frame with no turn to file it under is not kept", async () => {
    const id = computerId();
    await store.save({
      computerId: id,
      toolCallId: "",
      url: "https://example.com",
      frame: "AAAA",
    });

    expect(await store.load(id, "")).toBe(null);
  });
});
