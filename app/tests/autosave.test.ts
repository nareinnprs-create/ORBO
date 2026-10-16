import { afterEach, expect, jest, mock, test } from "bun:test";

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

type PageDraft = Pick<Page, "title" | "content" | "parentId">;

type SaveState = {
  page?: Page;
  draft?: PageDraft;
  remote?: Page;
  status: "saved" | "dirty" | "saving" | "error" | "conflict";
  error?: string;
};

type SavePage = (
  id: string,
  patch: PageDraft & { expectedRevision: number },
  signal: AbortSignal,
) => Promise<Page>;

const fields = (page: Page): PageDraft => ({
  title: page.title,
  content: page.content,
  parentId: page.parentId,
});

const equal = (a: PageDraft, b: PageDraft) =>
  a.title === b.title && a.content === b.content && a.parentId === b.parentId;

class PageAutosave {
  private state: SaveState = { status: "saved" };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private pending?: Promise<boolean>;
  private generation = 0;
  constructor(private save: SavePage) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SaveState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private get changed() {
    return !!(
      this.state.page &&
      this.state.draft &&
      !equal(fields(this.state.page), this.state.draft)
    );
  }
  get dirty() {
    return (
      !!this.pending ||
      this.changed ||
      ["error", "conflict"].includes(this.state.status)
    );
  }
  receive(page: Page) {
    if (this.state.page?.id !== page.id) {
      this.generation++;
      clearTimeout(this.timer);
      this.controller?.abort();
      this.pending = undefined;
      this.publish({
        page,
        draft: fields(page),
        remote: page,
        status: "saved",
        error: undefined,
      });
      return;
    }
    if (page.revision <= (this.state.remote?.revision ?? 0)) return;
    if (this.pending) {
      this.publish({ remote: page });
      return;
    }
    if (this.dirty) {
      clearTimeout(this.timer);
      this.publish({
        remote: page,
        status: "conflict",
        error:
          "This page changed elsewhere. Your draft is safe. Copy it before loading the latest version.",
      });
    } else
      this.publish({
        page,
        remote: page,
        draft: fields(page),
        status: "saved",
        error: undefined,
      });
  }
  edit(patch: Partial<PageDraft>) {
    if (!this.state.draft) return;
    this.publish({ draft: { ...this.state.draft, ...patch } });
    if (["error", "conflict"].includes(this.state.status)) return;
    this.publish({
      status: this.pending ? "saving" : this.changed ? "dirty" : "saved",
      error: undefined,
    });
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (
      this.changed &&
      !this.pending &&
      !["error", "conflict"].includes(this.state.status)
    )
      this.timer = setTimeout(() => void this.flush(), 800);
  }
  async flush(retry = false): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.pending) {
      await this.pending;
      return this.changed ? this.flush(retry) : this.state.status === "saved";
    }
    if (!this.state.page || !this.state.draft) return false;
    if (
      this.state.status === "conflict" ||
      (this.state.status === "error" && !retry)
    )
      return false;
    if (!this.changed && this.state.status !== "error") {
      this.publish({ status: "saved", error: undefined });
      return true;
    }
    const page = this.state.page;
    const draft = { ...this.state.draft };
    const generation = this.generation;
    if (
      !draft.title.trim() ||
      draft.title.length > 160 ||
      draft.content.length > 100000
    ) {
      this.publish({
        status: "error",
        error:
          "Use a title up to 160 characters and a document up to 100,000 characters. Your draft is still here.",
      });
      return false;
    }
    this.controller = new AbortController();
    const controller = this.controller;
    this.publish({ status: "saving", error: undefined });
    const pending = (async () => {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          this.save(
            page.id,
            { ...draft, expectedRevision: page.revision },
            controller.signal,
          ),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => {
              controller.abort();
              reject(
                new Error(
                  "Saving timed out. Your draft is safe; retry when connected.",
                ),
              );
            }, 10000);
          }),
        ]);
        if (generation !== this.generation) return false;
        const unchanged = equal(this.state.draft!, draft);
        const remote =
          this.state.remote && this.state.remote.revision > result.revision
            ? this.state.remote
            : result;
        this.publish({
          page: result,
          remote,
          draft: unchanged ? fields(result) : this.state.draft,
        });
        this.publish({
          status:
            remote.revision > result.revision
              ? "conflict"
              : this.changed
                ? "dirty"
                : "saved",
          error:
            remote.revision > result.revision
              ? "A newer revision exists. Your draft is preserved."
              : undefined,
        });
        return this.state.status !== "conflict";
      } catch (error) {
        if (generation !== this.generation) return false;
        const conflict =
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 409;
        this.publish({
          status: conflict ? "conflict" : "error",
          error: conflict
            ? "This page changed elsewhere. Your draft is safe. Copy it before loading the latest version."
            : error instanceof Error
              ? error.message
              : "Could not save. Your draft is safe.",
        });
        return false;
      } finally {
        clearTimeout(deadline);
        if (generation === this.generation) {
          this.pending = undefined;
          this.publish({});
          this.schedule();
        }
      }
    })();
    this.pending = pending;
    const success = await pending;
    if (success && generation === this.generation && this.changed)
      return this.flush(retry);
    return success;
  }
  useLatest() {
    const page = this.state.remote;
    if (!page) return;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.pending = undefined;
    this.publish({
      page,
      draft: fields(page),
      remote: page,
      status: "saved",
      error: undefined,
    });
  }
  dispose() {
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.pending = undefined;
    this.listeners.clear();
  }
}

const page: Page = {
  id: "a",
  spaceId: "space",
  parentId: null,
  title: "Title",
  content: "Original",
  revision: 1,
  createdAt: 0,
  updatedAt: 0,
  sourceThreadId: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Bun has no `advanceTimersByTimeAsync`: fire due timers synchronously, then
 * drain the promise continuations they scheduled. */
async function tick(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

afterEach(() => {
  jest.useRealTimers();
});

test("does not serialize or save on initial load or unchanged polling", async () => {
  jest.useFakeTimers();
  const save = mock<SavePage>();
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.receive({ ...page });
  await tick(2000);
  expect(save).not.toHaveBeenCalled();
  expect(autosave.getSnapshot().draft?.content).toBe("Original");
  autosave.dispose();
});

test("debounces saves and serializes fresh typing behind the in-flight revision", async () => {
  jest.useFakeTimers();
  const first = deferred<Page>();
  const save = mock<SavePage>();
  save.mockReturnValueOnce(first.promise);
  save.mockImplementationOnce(async (_id, patch) => ({
    ...page,
    ...patch,
    revision: 3,
  }));
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.edit({ content: "First" });
  await tick(800);
  expect(save).toHaveBeenCalledTimes(1);
  autosave.edit({ content: "Second" });
  await tick(1000);
  expect(save).toHaveBeenCalledTimes(1);
  first.resolve({ ...page, content: "First", revision: 2 });
  await tick(800);
  expect(save.mock.calls[1][1]).toMatchObject({
    content: "Second",
    expectedRevision: 2,
  });
  expect(autosave.getSnapshot()).toMatchObject({
    status: "saved",
    draft: { content: "Second" },
  });
  autosave.dispose();
});

test("preserves drafts after failure and requires explicit retry; conflicts freeze automatic saves", async () => {
  jest.useFakeTimers();
  const save = mock<SavePage>();
  save.mockRejectedValueOnce(new Error("Offline"));
  save.mockRejectedValueOnce(
    Object.assign(new Error("Changed"), { status: 409 }),
  );
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.edit({ content: "Keep this" });
  await tick(800);
  expect(autosave.getSnapshot()).toMatchObject({
    status: "error",
    draft: { content: "Keep this" },
  });
  autosave.edit({ content: "Keep this too" });
  await tick(2000);
  expect(save).toHaveBeenCalledTimes(1);
  await autosave.flush(true);
  expect(autosave.getSnapshot().status).toBe("conflict");
  autosave.edit({ content: "Still kept" });
  await tick(2000);
  expect(save).toHaveBeenCalledTimes(2);
  expect(autosave.getSnapshot().draft?.content).toBe("Still kept");
  autosave.dispose();
});

test("ignores stale completion after navigation and retains dirty work during remote polling", async () => {
  jest.useFakeTimers();
  const pending = deferred<Page>();
  const autosave = new PageAutosave(() => pending.promise);
  autosave.receive(page);
  autosave.edit({ content: "Unsaved A" });
  await tick(800);
  autosave.receive({ ...page, id: "b", content: "Page B" });
  pending.resolve({ ...page, content: "Unsaved A", revision: 2 });
  await tick(1000);
  expect(autosave.getSnapshot().draft?.content).toBe("Page B");
  autosave.edit({ content: "My B draft" });
  autosave.receive({ ...page, id: "b", revision: 2, content: "Other B edit" });
  expect(autosave.getSnapshot()).toMatchObject({
    status: "conflict",
    draft: { content: "My B draft" },
    remote: { content: "Other B edit" },
  });
  autosave.dispose();
});

test("bounds a hung save, preserves the ambiguous draft, and does not retry automatically", async () => {
  jest.useFakeTimers();
  const save = mock<SavePage>(() => new Promise<Page>(() => {}));
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.edit({ content: "Keep after timeout" });
  await tick(10800);
  expect(autosave.getSnapshot()).toMatchObject({
    status: "error",
    draft: { content: "Keep after timeout" },
    page: { revision: 1 },
  });
  expect(save.mock.calls[0][2].aborted).toBe(true);
  await tick(50000);
  expect(save).toHaveBeenCalledTimes(1);
  autosave.dispose();
});

test("keeps navigation guarded when typing reverts to the old content during a save, then flushes the revert", async () => {
  jest.useFakeTimers();
  const first = deferred<Page>();
  const save = mock<SavePage>();
  save.mockReturnValueOnce(first.promise);
  save.mockImplementationOnce(async (_id, patch) => ({
    ...page,
    ...patch,
    revision: 3,
  }));
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.edit({ content: "Temporary" });
  await tick(800);
  autosave.edit({ content: "Original" });
  expect(autosave.dirty).toBe(true);
  first.resolve({ ...page, content: "Temporary", revision: 2 });
  await tick(800);
  expect(save.mock.calls[1][1]).toMatchObject({
    content: "Original",
    expectedRevision: 2,
  });
  expect(autosave.getSnapshot().status).toBe("saved");
  autosave.dispose();
});

test("preserves a reverted draft when polling finds a save whose response was lost", async () => {
  jest.useFakeTimers();
  const pending = deferred<Page>();
  const save = mock<SavePage>(() => pending.promise);
  const autosave = new PageAutosave(save);
  autosave.receive(page);
  autosave.edit({ content: "Temporary" });
  await tick(800);
  autosave.edit({ content: "Original" });
  pending.reject(new Error("Connection lost after the server committed"));
  await tick(0);
  expect(autosave.getSnapshot()).toMatchObject({
    status: "error",
    draft: { content: "Original" },
  });

  autosave.receive({ ...page, content: "Temporary", revision: 2 });
  expect(autosave.getSnapshot()).toMatchObject({
    status: "conflict",
    draft: { content: "Original" },
    remote: { content: "Temporary", revision: 2 },
  });
  expect(autosave.dirty).toBe(true);
  await tick(2000);
  expect(save).toHaveBeenCalledTimes(1);

  autosave.useLatest();
  expect(autosave.getSnapshot()).toMatchObject({
    status: "saved",
    draft: { content: "Temporary" },
    page: { revision: 2 },
  });
  expect(autosave.dirty).toBe(false);
  autosave.dispose();
});
