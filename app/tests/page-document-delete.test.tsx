// Ported from upstream tests/page-document-delete.test.tsx (vitest)
// to bun:test. ORBO has no PageDocument editor yet (documents are planned per
// docs/planning/23-phase6-documents-inventory.md), so this ports the deletion
// handoff contract with a minimal document harness instead of
// react-test-renderer: deleting the open page navigates home after the delete
// resolves, while a stale deletion that finishes after the user left still
// records the delete + refresh but never navigates home or touches dirty
// state.
import { expect, test } from "bun:test";

type Page = { id: string; spaceId: string; title: string };

class PageDocument {
  private mounted = true;
  private deleting = false;
  readonly deleted: string[] = [];
  readonly refreshed: number[] = [];
  readonly homes: number[] = [];
  readonly dirtied: number[] = [];

  constructor(
    private readonly page: Page,
    private readonly remove: (pageId: string) => Promise<{ ok: boolean }>,
  ) {}

  unmount(): void {
    this.mounted = false;
  }

  /** The "Delete page" document-menu action behind a confirm gate. */
  async deletePage(confirmed: boolean): Promise<void> {
    if (!confirmed || this.deleting) return;
    this.deleting = true;
    try {
      const result = await this.remove(this.page.id);
      if (!result.ok) return;
      this.deleted.push(this.page.id);
      this.refreshed.push(1);
      if (!this.mounted) {
        // Stale completion: the user already left, so record the delete and
        // refresh but never navigate or touch editor state.
        return;
      }
      this.homes.push(1);
    } finally {
      this.deleting = false;
    }
  }
}

const page: Page = { id: "a", spaceId: "space", title: "A" };

test("leaves the page after its deletion finishes while it is still open", async () => {
  let calls = 0;
  const doc = new PageDocument(page, async () => {
    calls += 1;
    return { ok: true };
  });
  await doc.deletePage(true);
  expect(doc.deleted).toEqual(["a"]);
  expect(doc.refreshed).toHaveLength(1);
  expect(doc.homes).toHaveLength(1);
  expect(calls).toBe(1);
});

test("ignores a stale deletion that finishes after the user left the page", async () => {
  let finish!: (value: { ok: boolean }) => void;
  const doc = new PageDocument(
    page,
    () => new Promise<{ ok: boolean }>((resolve) => (finish = resolve)),
  );
  const pending = doc.deletePage(true);
  doc.unmount();
  const dirtyBefore = doc.dirtied.length;
  finish({ ok: true });
  await pending;
  expect(doc.deleted).toEqual(["a"]);
  expect(doc.refreshed).toHaveLength(1);
  expect(doc.homes).toHaveLength(0);
  expect(doc.dirtied.length).toBe(dirtyBefore);
});
