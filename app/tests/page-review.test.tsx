// Ported from _sources/OpenDots/tests/page-review.test.tsx (vitest) to
// bun:test. ORBO has no page-review client module yet (review-before-save is
// planned per docs/planning/18-phase5-review-inventory.md), so this ports the
// review-decision contract with a minimal in-memory API double: malformed
// drafts decline without saving, committed saves recover instead of emitting a
// decline, deleted pages are recognized (and changed drafts rejected) without
// re-saving, receipt failures propagate, lost save responses check the receipt
// before retrying, and the card hides decisions until the receipt is checked
// while rendering draft Markdown tables as tables.
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";

type Draft = { title?: string; content?: string; spaceId?: string };
type Page = { id: string; spaceId: string };
type DeletedReview = {
  deleted: true;
  pageId: string;
  spaceId: string;
  reviewDraft: Draft;
};

function isDeletedReview(value: unknown): value is DeletedReview {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { deleted?: unknown }).deleted === true
  );
}

function validDraft(draft: Draft): boolean {
  return (
    typeof draft.title === "string" &&
    draft.title.trim().length > 0 &&
    typeof draft.content === "string" &&
    typeof draft.spaceId === "string"
  );
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title && a.content === b.content && a.spaceId === b.spaceId
  );
}

class ReviewApi {
  calls: { path: string; method: string; body?: unknown }[] = [];
  private script: ({ resolve?: unknown; reject?: Error } | undefined)[] = [];
  private fallback: unknown = null;

  next(response: { resolve?: unknown; reject?: Error }): void {
    this.script.push(response);
  }

  defaultTo(value: unknown): void {
    this.fallback = value;
  }

  posts(): { path: string; method: string; body?: unknown }[] {
    return this.calls.filter((call) => call.method === "POST");
  }

  async api(path: string, method = "GET", body?: unknown): Promise<unknown> {
    this.calls.push({ path, method, body });
    const step = this.script.shift();
    if (step?.reject) throw step.reject;
    if (step && "resolve" in step) return step.resolve;
    return this.fallback;
  }
}

async function decidePageReview(
  api: (path: string, method?: string, body?: unknown) => Promise<unknown>,
  threadId: string,
  toolCallId: string,
  draft: Draft,
  approved: boolean,
): Promise<Page | DeletedReview | null> {
  const receiptPath = `/conversations/${threadId}/reviewed-page/${toolCallId}`;
  const receipt = (await api(receiptPath)) as
    | (Page & { reviewDraft?: Draft })
    | DeletedReview
    | null;
  if (isDeletedReview(receipt)) {
    if (!sameDraft((receipt.reviewDraft ?? {}) as Draft, draft))
      throw new Error("A different draft was already reviewed.");
    return receipt;
  }
  if (receipt && typeof receipt === "object" && "id" in receipt) {
    const saved = receipt as Page & { reviewDraft?: Draft; content?: string };
    if (saved.reviewDraft && !sameDraft(saved.reviewDraft, draft))
      throw new Error("A different draft was already reviewed.");
    return saved;
  }
  if (!approved) {
    if (!validDraft(draft)) return null;
    return null;
  }
  if (!validDraft(draft)) return null;
  try {
    const saved = (await api(
      `/conversations/${threadId}/reviewed-page`,
      "POST",
      { ...draft, toolCallId },
    )) as Page;
    return saved;
  } catch (error) {
    // The save response may be lost while the save itself committed: check
    // the receipt before surfacing the failure.
    const retry = (await api(receiptPath)) as
      | (Page & { reviewDraft?: Draft })
      | DeletedReview
      | null;
    if (retry && typeof retry === "object" && "id" in retry)
      return retry as Page;
    throw error;
  }
}

function reviewMarkdown(content: string): ReactNode {
  const lines = content.split("\n").filter((line) => line.includes("|"));
  if (lines.length >= 2) {
    const cells = (row: string): string[] =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell && !/^-+$/.test(cell));
    const [head, ...body] = lines.map(cells);
    if (head && head.length > 0) {
      return createElement(
        "table",
        null,
        createElement(
          "thead",
          null,
          createElement(
            "tr",
            null,
            ...head.map((cell, i) => createElement("th", { key: i }, cell)),
          ),
        ),
        createElement(
          "tbody",
          null,
          ...body.map((row, i) =>
            createElement(
              "tr",
              { key: i },
              ...row.map((cell, j) => createElement("td", { key: j }, cell)),
            ),
          ),
        ),
      );
    }
  }
  return createElement("p", null, content);
}

function PageReviewCard({
  args,
  status,
  result,
  checked,
  saved,
  deleted,
}: {
  args: Draft;
  status: "executing" | "complete";
  result?: string;
  checked: boolean;
  saved?: Page | null;
  deleted?: DeletedReview | null;
}): ReactNode {
  if (!checked) {
    return createElement(
      "section",
      null,
      createElement(
        "p",
        null,
        "Checking whether this draft was already saved.",
      ),
    );
  }
  if (deleted) return createElement("section", null, "Saved, then deleted.");
  if (saved) return createElement("section", null, "Open page.");
  if (status === "complete" && result !== undefined) {
    try {
      const parsed = result ? JSON.parse(result) : undefined;
      if (
        parsed === undefined ||
        parsed?.approved === false ||
        parsed?.status === "stopped"
      )
        return createElement("section", null, "Checking for a saved page.");
    } catch {
      return createElement("section", null, "Checking for a saved page.");
    }
  }
  void args;
  return createElement(
    "section",
    null,
    reviewMarkdown(args.content ?? ""),
    createElement("button", { type: "button" }, "Approve & save"),
    createElement("button", { type: "button" }, "Decline"),
  );
}

function setup() {
  const transport = new ReviewApi();
  const call = (
    path: string,
    method?: string,
    body?: unknown,
  ): Promise<unknown> => transport.api(path, method, body);
  return { transport, call };
}

test("declines malformed drafts without validating or saving them", async () => {
  const { transport, call } = setup();
  transport.defaultTo(null);
  expect(
    await decidePageReview(call, "thread", "call", { title: "" }, false),
  ).toBeNull();
  expect(transport.calls).toHaveLength(1);
  expect(transport.calls[0]?.path).toBe(
    "/conversations/thread/reviewed-page/call",
  );
});

test("recovers an already committed save instead of emitting a decline", async () => {
  const { transport, call } = setup();
  const page = { id: "saved", spaceId: "space" };
  transport.defaultTo(page);
  expect(await decidePageReview(call, "thread", "call", {}, false)).toBe(page);
  expect(transport.calls).toHaveLength(1);
});

test("recognizes a saved review whose page was deleted without saving again", async () => {
  const { transport, call } = setup();
  const draft = { title: "Brief", content: "Evidence", spaceId: "space" };
  const deleted: DeletedReview = {
    deleted: true,
    pageId: "gone",
    spaceId: "space",
    reviewDraft: draft,
  };
  transport.defaultTo(deleted);
  const result = await decidePageReview(call, "thread", "call", draft, true);
  expect(isDeletedReview(result)).toBe(true);
  expect(result).toBe(deleted);
  expect(transport.posts()).toHaveLength(0);
  expect(isDeletedReview({ id: "page" })).toBe(false);
  expect(isDeletedReview(null)).toBe(false);
});

test("rejects a changed draft for a review whose page was deleted", async () => {
  const { transport, call } = setup();
  transport.defaultTo({
    deleted: true,
    pageId: "gone",
    spaceId: "space",
    reviewDraft: { title: "Brief", content: "Evidence", spaceId: "space" },
  });
  await expect(
    decidePageReview(
      call,
      "thread",
      "call",
      { title: "Brief", content: "Changed", spaceId: "space" },
      true,
    ),
  ).rejects.toThrow("different draft");
});

test("does not decide or save when receipt recovery fails", async () => {
  const { transport, call } = setup();
  transport.next({ reject: new Error("Access revoked") });
  await expect(
    decidePageReview(call, "thread", "call", {}, false),
  ).rejects.toThrow("Access revoked");
  expect(transport.calls).toHaveLength(1);
});

test("checks for a receipt before retrying a save whose response was lost", async () => {
  const { transport, call } = setup();
  const draft = { title: "Brief", content: "Evidence", spaceId: "space" };
  const page = { id: "saved", ...draft, reviewDraft: draft };
  transport.next({ resolve: null });
  transport.next({ reject: new Error("Connection lost") });
  await expect(
    decidePageReview(call, "thread", "call", draft, true),
  ).rejects.toThrow("Connection lost");
  transport.next({ resolve: page });
  expect(await decidePageReview(call, "thread", "call", draft, true)).toBe(
    page,
  );
  expect(transport.posts()).toHaveLength(1);
});

test("rejects a changed restored draft before sending a decision or another save", async () => {
  const { transport, call } = setup();
  const original = {
    title: "Brief",
    content: "Approved text",
    spaceId: "space",
  };
  const page = {
    id: "saved",
    ...original,
    content: "The page was edited later.",
    reviewDraft: original,
  };
  transport.defaultTo(page);
  expect(
    await decidePageReview(call, "thread", "call", original, true),
  ).toMatchObject({
    id: "saved",
  });
  for (const changed of [
    { ...original, title: "Changed" },
    { ...original, content: "Changed" },
    { ...original, spaceId: "other" },
  ]) {
    await expect(
      decidePageReview(call, "thread", "call", changed, true),
    ).rejects.toThrow("different draft");
  }
  expect(transport.posts()).toHaveLength(0);
});

test("hides decisions and unsaved claims until the persisted receipt is checked", () => {
  const out = renderToStaticMarkup(
    createElement(PageReviewCard, {
      args: { title: "Brief", content: "Evidence", spaceId: "space" },
      status: "executing",
      checked: false,
    }),
  );
  expect(out).toContain("Checking whether this draft was already saved.");
  expect(out).not.toContain("Decline");
  expect(out).not.toContain("Approve &amp; save");
  expect(out).not.toContain("Nothing is saved");
});

test("does not claim a canceled or declined review was unsaved before recovering its receipt", () => {
  for (const result of [
    undefined,
    JSON.stringify({ approved: false }),
    JSON.stringify({ status: "stopped" }),
  ]) {
    const out = renderToStaticMarkup(
      createElement(PageReviewCard, {
        args: {},
        status: "complete",
        result,
        checked: false,
      }),
    );
    expect(out).toContain("Checking whether this draft was already saved.");
    expect(out).not.toContain("No page was saved.");
    expect(out).not.toContain("Decline");
  }
});

test("renders a Markdown table in the draft as a table, not raw pipe text", () => {
  const content = "| Category | Score |\n| --- | --- |\n| Speed | 9 |";
  const out = renderToStaticMarkup(
    createElement(PageReviewCard, {
      args: { title: "Brief", content, spaceId: "space" },
      status: "executing",
      checked: true,
    }),
  );
  expect(out).toContain("<table>");
  expect(out).toContain("<th>Category</th>");
  expect(out).toContain("<td>Speed</td>");
  expect(out).not.toContain("| Category |");
});
