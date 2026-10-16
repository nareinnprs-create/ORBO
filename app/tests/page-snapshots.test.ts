import { expect, test } from "bun:test";

interface Page {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  content: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  sourceThreadId: string | null;
}

/** A missing row in an older poll must not unmount a newly created document,
 * so absence never removes a page. Deletions are explicit: ids in `removed`
 * (tombstones kept by the caller) are ignored when a stale poll still lists them. */
function mergePageSnapshot(
  known: Page[],
  incoming: Page[],
  removed: ReadonlySet<string> = new Set(),
): Page[] {
  const pages = new Map(known.map((page) => [page.id, page]));
  for (const page of incoming) {
    if (removed.has(page.id)) continue;
    const previous = pages.get(page.id);
    if (!previous || page.revision > previous.revision)
      pages.set(page.id, page);
  }
  return [...pages.values()];
}

const base: Page = {
  id: "existing",
  spaceId: "space",
  parentId: null,
  title: "Existing",
  content: "",
  revision: 1,
  createdAt: 0,
  updatedAt: 0,
  sourceThreadId: null,
};

test("retains a newly created document when an earlier list response arrives after creation", async () => {
  let resolve!: (pages: Page[]) => void;
  const olderRead = new Promise<Page[]>((done) => {
    resolve = done;
  });
  let pages = [base];
  const created = { ...base, id: "new-page", title: "New page" };
  const pending = olderRead.then((snapshot) => {
    pages = mergePageSnapshot(pages, snapshot);
  });
  pages = [...pages, created];
  const selectedId = created.id;
  resolve([base]);
  await pending;
  expect(pages.find((page) => page.id === selectedId)).toBe(created);
  expect(pages).toHaveLength(2);
});

test("retains locally saved revisions while accepting newer remote pages", () => {
  const local = { ...base, revision: 3, content: "Saved locally" };
  const remote = { ...base, id: "remote", content: "Other page" };
  expect(mergePageSnapshot([local], [base, remote])).toEqual([local, remote]);
  expect(
    mergePageSnapshot([local], [{ ...base, revision: 4, content: "Latest" }])[0]
      .content,
  ).toBe("Latest");
});

test("ignores a stale poll that still lists a deleted page", () => {
  const gone = { ...base, id: "gone" };
  expect(mergePageSnapshot([base], [base, gone], new Set(["gone"]))).toEqual([
    base,
  ]);
});
