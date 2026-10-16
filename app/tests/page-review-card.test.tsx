// Ported from _sources/OpenDots/tests/page-review-card.test.tsx (vitest) to
// bun:test. ORBO has no PageReviewCard yet (review-before-save is planned per
// docs/planning/18-phase5-review-inventory.md), so this ports the
// receipt-refresh contract with a minimal card harness instead of
// react-test-renderer: an approved draft shows its saved page ("Open page"),
// and when a refreshed receipt reports the page deleted the card drops the
// saved view ("Saved, then deleted", no "Open page") and responds with
// { approved: true, deleted: true }.
import { expect, test } from "bun:test";

type Draft = { title: string; content: string; spaceId: string };

type SavedPage = {
  id: string;
  spaceId: string;
  parentId: null;
  title: string;
  content: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  sourceThreadId: null;
  reviewDraft: Draft;
};

type DeletedReceipt = {
  deleted: true;
  pageId: string;
  spaceId: string;
  reviewDraft: Draft;
};

class PageReviewCard {
  private saved: SavedPage | null = null;
  private deleted: DeletedReceipt | null = null;
  private checked = false;
  readonly responded: { approved: boolean; deleted?: boolean }[] = [];

  constructor(
    private readonly api: () => Promise<SavedPage | DeletedReceipt>,
    private readonly respond: (result: {
      approved: boolean;
      deleted?: boolean;
    }) => Promise<void>,
  ) {}

  /** The receipt check every card performs before showing decisions. */
  async mount(): Promise<void> {
    const receipt = await this.api();
    this.checked = true;
    if ("deleted" in receipt && receipt.deleted) this.deleted = receipt;
    else this.saved = receipt as SavedPage;
  }

  async continue(): Promise<void> {
    const receipt = await this.api();
    if ("deleted" in receipt && receipt.deleted) {
      this.deleted = receipt;
      this.saved = null;
      await this.respond({ approved: true, deleted: true });
    }
  }

  view(): string {
    if (!this.checked) return "Checking whether this draft was already saved.";
    if (this.deleted) return "Saved, then deleted.";
    if (this.saved) return "Open page.";
    return "Checking whether this draft was already saved.";
  }
}

const draft: Draft = { title: "Brief", content: "Evidence", spaceId: "space" };

test("drops the saved page when a refreshed receipt reports it deleted", async () => {
  const saved: SavedPage = {
    id: "page",
    spaceId: "space",
    parentId: null,
    title: "Brief",
    content: "Evidence",
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    sourceThreadId: null,
    reviewDraft: draft,
  };
  const answers: (SavedPage | DeletedReceipt)[] = [
    saved,
    { deleted: true, pageId: "page", spaceId: "space", reviewDraft: draft },
  ];
  const responded: { approved: boolean; deleted?: boolean }[] = [];
  const card = new PageReviewCard(
    async () => answers.shift()!,
    async (result) => {
      responded.push(result);
    },
  );
  await card.mount();
  expect(card.view()).toContain("Open page");
  await card.continue();
  expect(card.view()).toContain("Saved, then deleted");
  expect(card.view()).not.toContain("Open page");
  expect(responded).toEqual([{ approved: true, deleted: true }]);
});
