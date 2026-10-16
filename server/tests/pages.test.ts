// Ported from _sources/OpenDots/tests/pages.test.ts (vitest) to bun:test.
//
// ORBO has no pages module yet (new server/src/pages/ is planned work per
// docs/planning/21-phase5-opendots-backend.md row 11), so this ports the page
// store contract with a minimal in-memory implementation: nested pages with
// revision CAS, cross-space/cycle guards, idempotent review receipts that
// survive restarts and page deletes, and delete reparenting. The source proves
// restart durability with file DBs; those cases run here through an in-memory
// serialize/restore round trip because Docker is down (no file-DB cases).
import { expect, test } from "bun:test";

type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  content: string;
  revision: number;
};

type ReviewDraft = { title: string; content: string; spaceId: string };

type ReviewReceipt = {
  pageId: string;
  spaceId: string;
  draft: ReviewDraft | null;
};

class PageStore {
  private pages = new Map<string, Page>();
  private threads = new Map<string, { threadId: string; ready: boolean }>();
  private reviews = new Map<string, ReviewReceipt>();
  private spaces = new Set<string>();
  private seq = 1;

  constructor(spaces: string[] = ["space-a"]) {
    for (const space of spaces) this.spaces.add(space);
  }

  private key(spaceId: string, pageId: string): string {
    return `${spaceId}/${pageId}`;
  }

  create(
    spaceId: string,
    input: { title: string; content?: string; parentId?: string },
  ): Page {
    if (!this.spaces.has(spaceId)) throw new Error("Space not found.");
    if (input.parentId !== undefined) {
      const parent = this.pages.get(this.key(spaceId, input.parentId));
      if (!parent) throw new Error("Parent page not found in this Space.");
      if (parent.id === `page-${this.seq}`) throw new Error("Page cycle.");
    }
    const page: Page = {
      id: `page-${this.seq++}`,
      spaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      content: input.content ?? "",
      revision: 1,
    };
    this.pages.set(this.key(spaceId, page.id), page);
    return { ...page };
  }

  get(spaceId: string, pageId: string): Page {
    const page = this.pages.get(this.key(spaceId, pageId));
    if (!page || page.spaceId !== spaceId)
      throw new Error("Page not found in this Space.");
    return { ...page };
  }

  list(spaceId: string): Page[] {
    return [...this.pages.values()]
      .filter((page) => page.spaceId === spaceId)
      .map((page) => ({ ...page }));
  }

  update(
    spaceId: string,
    pageId: string,
    patch: {
      expectedRevision: number;
      title?: string;
      content?: string;
      parentId?: string | null;
    },
  ): Page {
    const page = this.pages.get(this.key(spaceId, pageId));
    if (!page || page.spaceId !== spaceId)
      throw new Error("Page not found in this Space.");
    if (patch.expectedRevision !== page.revision)
      throw new Error("The page changed since you read it.");
    if (patch.parentId !== undefined && patch.parentId !== null) {
      if (patch.parentId === page.id) throw new Error("Page cycle.");
      const parent = this.pages.get(this.key(spaceId, patch.parentId));
      if (!parent) throw new Error("Parent page not found in this Space.");
      let cursor: Page | undefined = parent;
      while (cursor) {
        if (cursor.id === page.id) throw new Error("Page cycle.");
        cursor = cursor.parentId
          ? this.pages.get(this.key(spaceId, cursor.parentId))
          : undefined;
      }
      page.parentId = patch.parentId;
    }
    if (patch.title !== undefined) page.title = patch.title;
    if (patch.content !== undefined) page.content = patch.content;
    page.revision += 1;
    return { ...page };
  }

  delete(spaceId: string, pageId: string): boolean {
    const page = this.pages.get(this.key(spaceId, pageId));
    if (!page) {
      if (!this.spaces.has(spaceId)) throw new Error("Space not found.");
      return false;
    }
    if (page.spaceId !== spaceId) throw new Error("Space not found.");
    this.pages.delete(this.key(spaceId, pageId));
    for (const child of this.pages.values()) {
      if (child.spaceId === spaceId && child.parentId === pageId) {
        child.parentId = page.parentId;
        child.revision += 1;
      }
    }
    for (const key of [...this.threads.keys()]) {
      if (key.startsWith(`${pageId}/`)) this.threads.delete(key);
    }
    return true;
  }

  reserveThread(pageId: string, dotId: string, threadId: string): void {
    this.threads.set(`${pageId}/${dotId}`, { threadId, ready: false });
  }

  finishThread(pageId: string, dotId: string): void {
    const binding = this.threads.get(`${pageId}/${dotId}`);
    if (binding) binding.ready = true;
  }

  thread(pageId: string, dotId: string): { threadId: string } | undefined {
    const binding = this.threads.get(`${pageId}/${dotId}`);
    return binding ? { threadId: binding.threadId } : undefined;
  }

  createReviewed(
    spaceId: string,
    draft: ReviewDraft,
    threadId: string,
    toolCallId: string,
  ): Page {
    const receiptKey = `${threadId}/${toolCallId}`;
    const existing = this.reviews.get(receiptKey);
    if (existing) {
      if (
        !existing.draft ||
        existing.draft.title !== draft.title ||
        existing.draft.content !== draft.content
      )
        throw new Error("A different draft was already reviewed.");
      const page = this.pages.get(this.key(existing.spaceId, existing.pageId));
      if (!page) throw new Error("Page not found in this Space.");
      return { ...page };
    }
    const page = this.create(spaceId, {
      title: draft.title,
      content: draft.content,
    });
    this.reviews.set(receiptKey, {
      pageId: page.id,
      spaceId,
      draft: { ...draft },
    });
    return { ...page };
  }

  reviewReceipt(
    threadId: string,
    toolCallId: string,
  ):
    | { draft: ReviewDraft | null; pageId: string; spaceId: string }
    | undefined {
    const receipt = this.reviews.get(`${threadId}/${toolCallId}`);
    return receipt ? { ...receipt } : undefined;
  }

  snapshot(): string {
    return JSON.stringify({
      pages: [...this.pages.values()],
      threads: [...this.threads],
      reviews: [...this.reviews],
      seq: this.seq,
    });
  }

  static restore(data: string): PageStore {
    const parsed = JSON.parse(data) as {
      pages: Page[];
      threads: [string, { threadId: string; ready: boolean }][];
      reviews: [string, ReviewReceipt][];
      seq: number;
    };
    const store = new PageStore();
    store.pages = new Map(
      parsed.pages.map((page) => [store.key(page.spaceId, page.id), page]),
    );
    store.threads = new Map(parsed.threads);
    store.reviews = new Map(parsed.reviews);
    store.seq = parsed.seq;
    return store;
  }
}

test("persists nested page content and revision across restart", () => {
  const store = new PageStore();
  const space = "space-a";
  const parent = store.create(space, { title: "Plan", content: "A plan" });
  const child = store.create(space, { title: "Detail", parentId: parent.id });
  store.update(space, child.id, {
    expectedRevision: 1,
    title: "New detail",
    content: "Markdown **body**",
  });
  const restarted = PageStore.restore(store.snapshot());
  expect(restarted.get(space, child.id)).toMatchObject({
    title: "New detail",
    content: "Markdown **body**",
    revision: 2,
    parentId: parent.id,
  });
});

test("rejects cross-space parents, cycles and stale writes without losing content", () => {
  const store = new PageStore(["space-a", "space-b"]);
  const root = store.create("space-a", { title: "Root" });
  const child = store.create("space-a", { title: "Child", parentId: root.id });
  expect(() =>
    store.create("space-b", { title: "Wrong", parentId: root.id }),
  ).toThrow();
  expect(() =>
    store.update("space-a", root.id, {
      expectedRevision: 1,
      parentId: child.id,
    }),
  ).toThrow();
  store.update("space-a", root.id, { expectedRevision: 1, content: "New" });
  expect(() =>
    store.update("space-a", root.id, { expectedRevision: 1, content: "Stale" }),
  ).toThrow(/changed/);
  expect(store.get("space-a", root.id).content).toBe("New");
  expect(() => store.get("space-b", root.id)).toThrow();
});

test("keeps idempotent review receipts with their original draft after restart", () => {
  const store = new PageStore();
  const space = "space-a";
  store.createReviewed(
    space,
    { title: "Original", content: "Reviewed content", spaceId: space },
    "thread",
    "call",
  );
  const restarted = PageStore.restore(store.snapshot());
  expect(restarted.reviewReceipt("thread", "call")?.draft).toMatchObject({
    title: "Original",
    content: "Reviewed content",
    spaceId: space,
  });
  expect(() =>
    restarted.createReviewed(
      space,
      { title: "Changed", content: "Reviewed content", spaceId: space },
      "thread",
      "call",
    ),
  ).toThrow("different draft");
});

test("deletes a page and reparents descendants safely", () => {
  const store = new PageStore();
  const space = "space-a";
  const root = store.create(space, { title: "Root" });
  const child = store.create(space, { title: "Child", parentId: root.id });
  const grandChild = store.create(space, {
    title: "Grandchild",
    parentId: child.id,
  });

  expect(store.delete(space, child.id)).toBe(true);
  expect(store.delete(space, child.id)).toBe(false);
  expect(() => store.get(space, child.id)).toThrow();
  expect(store.get(space, grandChild.id).parentId).toBe(root.id);
  expect(store.get(space, grandChild.id).revision).toBe(
    grandChild.revision + 1,
  );

  expect(store.delete(space, root.id)).toBe(true);
  expect(store.get(space, grandChild.id).parentId).toBeNull();
  expect(store.list(space)).toHaveLength(1);
  expect(store.list(space)[0]?.id).toBe(grandChild.id);

  expect(() => store.delete("non-existent-space", grandChild.id)).toThrow(
    /Space not found/,
  );
});

test("drops page thread bindings on delete and never recreates a page from a retried review", () => {
  const store = new PageStore();
  const space = "space-a";
  const page = store.create(space, { title: "Draft" });
  store.reserveThread(page.id, "dot", "thread-1");
  store.finishThread(page.id, "dot");
  expect(store.thread(page.id, "dot")).toBeDefined();
  expect(store.delete(space, page.id)).toBe(true);
  expect(store.thread(page.id, "dot")).toBeUndefined();

  const reviewed = store.createReviewed(
    space,
    { title: "Reviewed", content: "Reviewed content", spaceId: space },
    "review-thread",
    "call-1",
  );
  expect(store.delete(space, reviewed.id)).toBe(true);
  expect(store.reviewReceipt("review-thread", "call-1")).toMatchObject({
    pageId: reviewed.id,
    spaceId: space,
  });
  expect(() =>
    store.createReviewed(
      space,
      { title: "Reviewed", content: "Reviewed content", spaceId: space },
      "review-thread",
      "call-1",
    ),
  ).toThrow(/Page not found/);
  expect(store.list(space)).toHaveLength(0);
});
