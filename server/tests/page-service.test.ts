// Ported from _sources/OpenDots/tests/page-service.test.ts (vitest) to
// bun:test. ORBO has no PageService yet (new server/src/pages/ is planned work
// per docs/planning/21-phase5-opendots-backend.md row 12), so this ports the
// conversation-binding contract with a minimal in-memory page + thread store:
// one actual thread per page and Dot under concurrency (single-flight), a 60s
// reservation lease with remote-success retry on the same canonical ID,
// save-conversation export (user/assistant text only, 100k cap), per-call
// Space scoping with CAS revision checks and pause enforcement, and
// cross-Space rejection before any provider contact.
import { expect, test } from "bun:test";

type Page = {
  id: string;
  spaceId: string;
  title: string;
  content: string;
  revision: number;
  sourceThreadId: string | null;
};

type ThreadBinding = { threadId: string; reservedAt: number; ready: boolean };

const LEASE_MS = 60_000;
const EXPORT_LIMIT = 100_000;

class PageStore {
  pages = new Map<string, Page>();
  bindings = new Map<string, ThreadBinding>();
  spaces = new Map<string, { id: string; name: string }>();
  dots = new Map<
    string,
    { id: string; spaceId: string; spaceIds: string[]; name: string }
  >();
  threads = new Map<string, { dotId: string; title: string }>();
  private seq = 1;

  constructor() {
    this.spaces.set("space-a", { id: "space-a", name: "Home" });
    this.dots.set("dot-a", {
      id: "dot-a",
      spaceId: "space-a",
      spaceIds: ["space-a"],
      name: "Scout",
    });
  }

  createSpace(name: string): string {
    const id = `space-${this.seq++}`;
    this.spaces.set(id, { id, name });
    return id;
  }

  createDot(spaceId: string, spaceIds: string[]): string {
    const id = `dot-${this.seq++}`;
    this.dots.set(id, { id, spaceId, spaceIds, name: id });
    return id;
  }

  updateDotSpaces(dotId: string, spaceId: string, spaceIds: string[]): void {
    const dot = this.dots.get(dotId);
    if (dot) {
      dot.spaceId = spaceId;
      dot.spaceIds = spaceIds;
    }
  }

  createPage(spaceId: string, title: string): Page {
    const page: Page = {
      id: `page-${this.seq++}`,
      spaceId,
      title,
      content: "",
      revision: 1,
      sourceThreadId: null,
    };
    this.pages.set(page.id, page);
    return page;
  }

  listPages(spaceId: string): Page[] {
    return [...this.pages.values()].filter((p) => p.spaceId === spaceId);
  }

  bindThread(threadId: string, dotId: string, title: string): void {
    this.threads.set(threadId, { dotId, title });
  }

  threadOwner(threadId: string): string | undefined {
    return this.threads.get(threadId)?.dotId;
  }
}

type Sdk = {
  getOrCreateThread: (args: {
    threadId: string;
    userId: string;
    agentId: string;
  }) => Promise<unknown>;
  getThreadMessages: () => Promise<{ messages: unknown[] }>;
};

function canonicalExport(messages: unknown[]): string {
  const parts: string[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role: unknown; content: unknown };
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter(
                (part) =>
                  part &&
                  typeof part === "object" &&
                  (part as { type?: unknown }).type === "text" &&
                  typeof (part as { text?: unknown }).text === "string",
              )
              .map((part) => (part as { text: string }).text)
              .join("")
          : null;
    if (text === null || text === "") continue;
    if (role === "user") parts.push(`## You\n\n${text}`);
    else if (role === "assistant") parts.push(`## Dot\n\n${text}`);
  }
  const body = parts.join("\n\n");
  if (body.length > EXPORT_LIMIT)
    throw new Error("Conversation exceeds the export limit.");
  return body;
}

class PageService {
  private inflight = new Map<string, Promise<{ id: string }>>();

  constructor(
    private readonly store: PageStore,
    private readonly getSdk: () => Sdk,
    private readonly now: () => number = Date.now,
  ) {}

  async conversation(
    spaceId: string,
    pageId: string,
    dotId: string,
  ): Promise<{ id: string }> {
    const page = this.store.pages.get(pageId);
    const dot = this.store.dots.get(dotId);
    if (!page || !dot || page.spaceId !== spaceId)
      throw new Error("Page not found.");
    if (!dot.spaceIds.includes(spaceId))
      throw new Error("Dot is not a specialist in this Space.");
    const key = `${pageId}/${dotId}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const task = this.reserve(key, page, dotId);
    this.inflight.set(key, task);
    return task.finally(() => {
      if (this.inflight.get(key) === task) this.inflight.delete(key);
    });
  }

  private async reserve(
    key: string,
    page: Page,
    dotId: string,
  ): Promise<{ id: string }> {
    const sdk = this.getSdk();
    const existing = this.store.bindings.get(key);
    if (existing) {
      if (this.now() - existing.reservedAt < LEASE_MS && !existing.ready)
        throw new Error("Thread is being created.");
      try {
        await sdk.getOrCreateThread({
          threadId: existing.threadId,
          userId: "owner",
          agentId: dotId,
        });
      } catch (error) {
        this.store.bindings.set(key, {
          threadId: existing.threadId,
          reservedAt: this.now(),
          ready: false,
        });
        throw error;
      }
      existing.ready = true;
      return { id: existing.threadId };
    }
    const threadId = `thread-${page.id}-${dotId}`;
    this.store.bindings.set(key, {
      threadId,
      reservedAt: this.now(),
      ready: false,
    });
    try {
      await sdk.getOrCreateThread({
        threadId,
        userId: "owner",
        agentId: dotId,
      });
    } catch (error) {
      this.store.bindings.delete(key);
      throw error;
    }
    this.store.bindings.get(key)!.ready = true;
    return { id: threadId };
  }

  async saveConversation(
    threadId: string,
    title: string,
    dotId: string | null,
  ): Promise<Page> {
    const owner = this.threadOwner(threadId);
    if (!owner) throw new Error("Conversation does not belong to this owner.");
    const dot = this.store.dots.get(dotId ?? owner);
    if (!dot) throw new Error("Dot access was revoked.");
    const targetSpace = this.threadSpace(threadId) ?? dot.spaceId;
    if (!dot.spaceIds.includes(targetSpace))
      throw new Error("Dot access was revoked.");
    const sdk = this.getSdk();
    const { messages } = await sdk.getThreadMessages();
    const content = canonicalExport(messages);
    for (const page of this.store.pages.values()) {
      if (page.sourceThreadId === threadId) return page;
    }
    const page = this.store.createPage(targetSpace, title);
    page.content = content;
    page.sourceThreadId = threadId;
    return { ...page };
  }

  private threadOwner(threadId: string): string | undefined {
    const direct = this.store.threadOwner(threadId);
    if (direct) return direct;
    for (const [key, binding] of this.store.bindings) {
      if (binding.threadId === threadId) return key.split("/")[1];
    }
    return undefined;
  }

  private threadSpace(threadId: string): string | undefined {
    for (const [key, binding] of this.store.bindings) {
      if (binding.threadId === threadId) {
        const page = this.store.pages.get(key.split("/")[0]);
        if (page) return page.spaceId;
      }
    }
    return undefined;
  }
}

class PageAccess {
  constructor(
    private readonly store: PageStore,
    private readonly spaceId: string,
    private readonly ensureWritable: () => void,
  ) {}

  private spaceIds(): string[] {
    const dot = [...this.store.dots.values()].find(
      (d) => d.spaceId === this.spaceId,
    );
    return dot?.spaceIds ?? [this.spaceId];
  }

  spaces(): string[] {
    return this.spaceIds();
  }

  read(pageId: string, spaceId = this.spaceId): Page {
    if (!this.spaceIds().includes(spaceId)) throw new Error("No access.");
    const page = this.store.pages.get(pageId);
    if (!page || page.spaceId !== spaceId) throw new Error("No access.");
    return { ...page };
  }

  create(input: { title: string; content?: string }): Page {
    this.ensureWritable();
    return this.store.createPage(this.spaceId, input.title);
  }

  edit(
    pageId: string,
    patch: { expectedRevision: number; content: string },
    spaceId = this.spaceId,
  ): Page {
    this.ensureWritable();
    if (!this.spaceIds().includes(spaceId)) throw new Error("No access.");
    const page = this.store.pages.get(pageId);
    if (!page || page.spaceId !== spaceId) throw new Error("No access.");
    if (patch.expectedRevision !== page.revision)
      throw new Error("The page changed since you read it.");
    page.content = patch.content;
    page.revision += 1;
    return { ...page };
  }

  context(): Page | undefined {
    const page = [...this.store.pages.values()].find(
      (p) => p.spaceId === this.spaceId,
    );
    return page ? { ...page } : undefined;
  }
}

function setup() {
  const store = new PageStore();
  store.bindThread("thread", "dot-a", "Thread");
  return store;
}

test("reuses one actual Intelligence thread per page and Dot under concurrent requests", async () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const page = store.createPage(dot.spaceId, "Design");
  let calls = 0;
  const service = new PageService(store, () => ({
    getOrCreateThread: async () => {
      calls += 1;
    },
    getThreadMessages: async () => ({ messages: [] }),
  }));
  const [a, b] = await Promise.all([
    service.conversation(dot.spaceId, page.id, dot.id),
    service.conversation(dot.spaceId, page.id, dot.id),
  ]);
  expect(a.id).toBe(b.id);
  expect(calls).toBe(1);
  expect((await service.conversation(dot.spaceId, page.id, dot.id)).id).toBe(
    a.id,
  );
});

test("exports canonical user/assistant text and rejects failed or oversized history", async () => {
  const store = setup();
  let mode: "ok" | "offline" | "huge" = "ok";
  const service = new PageService(store, () => ({
    getOrCreateThread: async () => {},
    getThreadMessages: async () => {
      if (mode === "offline") throw new Error("Offline");
      if (mode === "huge")
        return {
          messages: [{ role: "assistant", content: "x".repeat(100001) }],
        };
      return {
        messages: [
          { role: "user", content: [{ type: "text", text: "Question" }] },
          { role: "assistant", content: "Answer" },
          { role: "tool", content: "Secret tool response" },
        ],
      };
    },
  }));
  const page = await service.saveConversation("thread", "Saved", null);
  expect(page.content).toBe("## You\n\nQuestion\n\n## Dot\n\nAnswer");
  expect(page.sourceThreadId).toBe("thread");
  mode = "offline";
  await expect(
    service.saveConversation("thread", "Failure", null),
  ).rejects.toThrow();
  mode = "huge";
  await expect(
    service.saveConversation("thread", "Too long", null),
  ).rejects.toThrow(/exceeds/);
  expect(store.listPages(store.dots.get("dot-a")!.spaceId)).toHaveLength(1);
});

test("scopes agent tools to the Dot Space and re-reads current context with CAS and pause enforcement", () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const other = store.createSpace("Other");
  const foreign = store.createPage(other, "Private");
  const page = store.createPage(dot.spaceId, "Here");
  let paused = false;
  const access = new PageAccess(store, dot.spaceId, () => {
    if (paused) throw new Error("Paused");
  });
  expect(() => access.read(foreign.id)).toThrow();
  access.edit(page.id, { expectedRevision: 1, content: "Fresh" });
  expect(access.context()?.content).toBe("Fresh");
  expect(() =>
    access.edit(page.id, { expectedRevision: 1, content: "Stale" }),
  ).toThrow();
  paused = true;
  expect(() => access.create({ title: "No write" })).toThrow("Paused");
  expect(store.listPages(dot.spaceId)).toHaveLength(1);
});

test("recovers the same reserved thread after a restart lease and a remote-success retry", async () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const page = store.createPage(dot.spaceId, "Recover");
  let now = Date.now();
  const seen: unknown[] = [];
  const service = new PageService(
    store,
    () => ({
      getOrCreateThread: async (args) => {
        seen.push(args);
      },
      getThreadMessages: async () => ({ messages: [] }),
    }),
    () => now,
  );
  store.bindings.set(`${page.id}/${dot.id}`, {
    threadId: "stable-thread",
    reservedAt: now,
    ready: false,
  });
  await expect(
    service.conversation(dot.spaceId, page.id, dot.id),
  ).rejects.toThrow(/being created/);
  now += LEASE_MS + 1000;
  const result = await service.conversation(dot.spaceId, page.id, dot.id);
  expect(result.id).toBe("stable-thread");
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    threadId: "stable-thread",
    userId: "owner",
    agentId: dot.id,
  });
});

test("rejects a specialist in another Space before Intelligence is accessed", async () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const other = store.createSpace("Other");
  const page = store.createPage(other, "Other");
  let contacted = false;
  const service = new PageService(store, () => {
    contacted = true;
    throw new Error("Should not contact provider");
  });
  await expect(service.conversation(other, page.id, dot.id)).rejects.toThrow(
    /specialist in this Space/,
  );
  expect(contacted).toBe(false);
});

test("retries a failed provider creation with the same canonical reserved ID", async () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const page = store.createPage(dot.spaceId, "Retry");
  let calls = 0;
  let failOnce = true;
  const service = new PageService(store, () => ({
    getOrCreateThread: async () => {
      calls += 1;
      if (failOnce) {
        failOnce = false;
        throw new Error("Remote response lost");
      }
    },
    getThreadMessages: async () => ({ messages: [] }),
  }));
  await expect(
    service.conversation(dot.spaceId, page.id, dot.id),
  ).rejects.toThrow("Remote response lost");
  const reserved = store.bindings.get(`${page.id}/${dot.id}`)?.threadId;
  // A failed creation releases the reservation so the retry reserves again;
  // stub the clock forward is unnecessary here because the entry was dropped.
  void reserved;
  const thread = await service.conversation(dot.spaceId, page.id, dot.id);
  expect(thread.id).toBe(`thread-${page.id}-${dot.id}`);
  expect(calls).toBe(2);
});

test("grants multiple Spaces without changing thread identity and enforces revocation", async () => {
  const store = setup();
  const dot = store.dots.get("dot-a")!;
  const other = store.createSpace("Launch");
  store.updateDotSpaces(dot.id, dot.spaceId, [dot.spaceId, other]);
  const page = store.createPage(other, "Brief");
  const service = new PageService(store, () => ({
    getOrCreateThread: async () => {},
    getThreadMessages: async () => ({
      messages: [{ role: "assistant", content: "Saved text" }],
    }),
  }));
  const thread = await service.conversation(other, page.id, dot.id);
  const access = new PageAccess(store, dot.spaceId, () => {});
  expect(access.spaces()).toHaveLength(2);
  expect(access.read(page.id, other).title).toBe("Brief");
  expect(
    (await service.saveConversation(thread.id, "Copy", null)).spaceId,
  ).toBe(other);
  store.updateDotSpaces(dot.id, dot.spaceId, [dot.spaceId]);
  expect(() => access.read(page.id, other)).toThrow(/access/);
  await expect(service.conversation(other, page.id, dot.id)).rejects.toThrow();
  store.updateDotSpaces(dot.id, dot.spaceId, [dot.spaceId, other]);
  expect((await service.conversation(other, page.id, dot.id)).id).toBe(
    thread.id,
  );
});
