// Ported from _sources/OpenDots/tests/page-routes.test.ts (vitest) to
// bun:test. ORBO has no pages routes yet (planned per
// docs/planning/21-phase5-opendots-backend.md row 13), so this ports the HTTP
// contract with a minimal Hono app over an in-memory store: owner-token auth,
// browser origin checks, page CRUD with validation/CAS-conflict statuses,
// reviewed-page idempotency + changed-draft conflicts + deleted-page receipts,
// malformed-JSON handling, unknown-conversation 404s, and sanitized 503s for
// real provider failures. No network; app.request is in-process.
import { expect, test } from "bun:test";
import { Hono } from "hono";

type Page = {
  id: string;
  spaceId: string;
  title: string;
  content: string;
  revision: number;
};

type ReviewDraft = { title: string; content: string; spaceId: string };

const CONTAINER_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const validContainer = (value: unknown): value is string =>
  typeof value === "string" &&
  CONTAINER_RE.test(value) &&
  !value.includes("--");

function build(configuredOwnerToken?: string) {
  let seq = 1;
  const spaces = new Map<string, { id: string }>([
    ["space-a", { id: "space-a" }],
  ]);
  const dots = new Map([
    [
      "dot-a",
      {
        id: "dot-a",
        name: "Scout",
        spaceId: "space-a",
        spaceIds: ["space-a"],
        researchAllowed: true,
        memoryAllowed: true,
        learningContainerId: "research",
        skillDeliveryEnabled: true,
      },
    ],
  ]);
  const pages = new Map<string, Page>();
  const threads = new Map<string, { dotId: string }>([
    ["thread-a", { dotId: "dot-a" }],
  ]);
  const reviews = new Map<string, { page: Page; draft: ReviewDraft }>();
  let saveConversation: (() => Promise<unknown>) | undefined;

  const app = new Hono();
  const ownerToken = configuredOwnerToken ?? "owner-secret";
  const authRequired = configuredOwnerToken !== undefined;
  const authed = (c: { req: { header: (n: string) => string | undefined } }) =>
    c.req.header("authorization") === `Bearer ${ownerToken}`;

  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (
      origin &&
      new URL(origin).hostname !== new URL("https://example.com").hostname
    )
      return c.json({ error: "Forbidden origin." }, 403);
    if (
      c.req.method !== "GET" &&
      c.req.header("content-type") !== "application/json"
    )
      return c.json({ error: "JSON only." }, 400);
    await next();
  });

  const needAuth = async (
    c: {
      req: { header: (n: string) => string | undefined };
      json: (b: unknown, s?: number) => Response;
    },
    next: () => Promise<void>,
  ) => {
    if (!authRequired) {
      await next();
      return;
    }
    if (!authed(c)) return c.json({ error: "Unauthorized." }, 401);
    await next();
  };

  app.put("/api/dots/:id", needAuth, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON." }, 400);
    }
    const dot = dots.get(c.req.param("id"));
    if (!dot) return c.json({ error: "Not found." }, 404);
    const container = body.learningContainerId;
    if (!validContainer(container))
      return c.json({ error: "Invalid container id." }, 400);
    Object.assign(dot, {
      name: body.name,
      researchAllowed: body.researchAllowed,
      memoryAllowed: body.memoryAllowed,
      learningContainerId: container,
      skillDeliveryEnabled: body.skillDeliveryEnabled,
    });
    return c.json(dot);
  });

  app.post("/api/dots", needAuth, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON." }, 400);
    }
    const spaceId = body.spaceId;
    if (typeof spaceId !== "string" || !spaces.has(spaceId))
      return c.json({ error: "Unknown Space." }, 400);
    const id = `dot-${seq++}`;
    const dot = {
      id,
      name: body.name,
      spaceId,
      spaceIds: [spaceId],
      researchAllowed: body.researchAllowed,
      memoryAllowed: body.memoryAllowed,
      learningContainerId: body.learningContainerId,
      skillDeliveryEnabled: body.skillDeliveryEnabled,
    };
    dots.set(id, dot as typeof dots extends Map<string, infer V> ? V : never);
    return c.json(dot, 201);
  });

  // Manual pages need no credentials; only dot settings are owner-gated.
  app.get("/api/spaces/:spaceId/pages", needAuth, (c) => {
    if (!spaces.has(c.req.param("spaceId")))
      return c.json({ error: "Space not found." }, 404);
    return c.json(
      [...pages.values()].filter((p) => p.spaceId === c.req.param("spaceId")),
    );
  });

  app.post("/api/spaces/:spaceId/pages", async (c) => {
    const spaceId = c.req.param("spaceId");
    if (!spaces.has(spaceId)) return c.json({ error: "Space not found." }, 404);
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON." }, 400);
    }
    if (typeof body.title !== "string" || !body.title.trim())
      return c.json({ error: "A title is required." }, 400);
    const page: Page = {
      id: `page-${seq++}`,
      spaceId,
      title: body.title,
      content: "",
      revision: 1,
    };
    pages.set(page.id, page);
    return c.json(page, 201);
  });

  app.patch("/api/spaces/:spaceId/pages/:pageId", async (c) => {
    const page = pages.get(c.req.param("pageId"));
    if (!page || page.spaceId !== c.req.param("spaceId"))
      return c.json({ error: "Page not found in this Space." }, 404);
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON." }, 400);
    }
    if (body.expectedRevision !== page.revision)
      return c.json({ error: "The page changed since you read it." }, 409);
    if (typeof body.content === "string") page.content = body.content;
    page.revision += 1;
    return c.json(page);
  });

  app.delete("/api/spaces/:spaceId/pages/:pageId", (c) => {
    const spaceId = c.req.param("spaceId");
    if (!spaces.has(spaceId)) return c.json({ error: "Space not found." }, 404);
    const page = pages.get(c.req.param("pageId"));
    if (!page || page.spaceId !== spaceId)
      return c.json({ error: "Page not found in this Space." }, 404);
    pages.delete(page.id);
    return c.json({ ok: true });
  });

  app.post("/api/spaces/:spaceId/pages/:pageId/conversation", async (c) => {
    if (saveConversation) await saveConversation().catch(() => null);
    return c.json({ error: "Intelligence unavailable." }, 503);
  });

  app.post("/api/conversations/:threadId/reviewed-page", async (c) => {
    const threadId = c.req.param("threadId");
    const binding = threads.get(threadId);
    if (!binding)
      return c.json(
        { error: "Conversation does not belong to this Dot and owner." },
        404,
      );
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON." }, 400);
    }
    const draft = {
      title: body.title,
      content: body.content,
      spaceId: body.spaceId,
    } as ReviewDraft;
    const dot = dots.get(binding.dotId)!;
    if (!dot.spaceIds.includes(draft.spaceId))
      return c.json({ error: "Forbidden." }, 403);
    const key = `${threadId}/${body.toolCallId}`;
    const existing = reviews.get(key);
    if (existing) {
      if (
        existing.draft.title !== draft.title ||
        existing.draft.content !== draft.content ||
        existing.draft.spaceId !== draft.spaceId
      )
        return c.json(
          { error: "A different draft was already reviewed." },
          409,
        );
      return c.json(existing.page);
    }
    if (!pages.has(key)) {
      const page: Page = {
        id: `page-${seq++}`,
        spaceId: draft.spaceId,
        title: String(draft.title),
        content: String(draft.content),
        revision: 1,
      };
      pages.set(key, page);
      reviews.set(key, { page, draft: { ...draft } });
      return c.json({ ...page, reviewDraft: draft }, 201);
    }
    return c.json(pages.get(key));
  });

  app.get("/api/conversations/:threadId/reviewed-page/:callId", (c) => {
    const key = `${c.req.param("threadId")}/${c.req.param("callId")}`;
    const receipt = reviews.get(key);
    if (!receipt)
      return c.json(
        { error: "Conversation does not belong to this Dot and owner." },
        404,
      );
    const live = [...pages.values()].find((p) => p.id === receipt.page.id);
    if (!live)
      return c.json({
        deleted: true,
        pageId: receipt.page.id,
        spaceId: receipt.page.spaceId,
        reviewDraft: receipt.draft,
      });
    return c.json({ ...live, reviewDraft: receipt.draft });
  });

  app.post("/api/conversations/:threadId/page", async (c) => {
    if (!threads.get(c.req.param("threadId")))
      return c.json(
        { error: "Conversation does not belong to this Dot and owner." },
        404,
      );
    try {
      if (saveConversation) await saveConversation();
      return c.json({ ok: true });
    } catch {
      return c.json(
        {
          error:
            "Page operation could not complete. Check Intelligence setup or retry; your draft has not been discarded.",
        },
        503,
      );
    }
  });

  app.get("/api/conversations/:threadId/capture", (c) => {
    if (!threads.get(c.req.param("threadId")))
      return c.json(
        { error: "Conversation does not belong to this Dot and owner." },
        404,
      );
    return c.json({ ok: true });
  });

  app.get("/api/voice/calls/:id", (c) => {
    if (c.req.param("id") !== "call-a")
      return c.json({ error: "Call not found." }, 404);
    return c.json({ id: "call-a" });
  });

  return {
    app,
    dots,
    spaces,
    pages,
    threads,
    reviews,
    failConversations(error: Error) {
      saveConversation = () => Promise.reject(error);
    },
  };
}

const json = (body: unknown, method = "POST", auth = false) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: "Bearer owner-secret" } : {}),
  },
  body: JSON.stringify(body),
});

test("manual pages return validation, scope and conflict statuses", async () => {
  const { app, spaces } = build();
  const space = [...spaces.keys()][0]!;
  const path = `/api/spaces/${space}/pages`;
  expect((await app.request(path, json({ title: "" }))).status).toBe(400);
  expect((await app.request("/api/spaces/missing/pages")).status).toBe(404);
  const created = await app.request(path, json({ title: "Document" }));
  expect(created.status).toBe(201);
  const page = (await created.json()) as { id: string };
  expect(
    (
      await app.request(
        `${path}/${page.id}`,
        json({ expectedRevision: 1, content: "First" }, "PATCH"),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(
        `${path}/${page.id}`,
        json({ expectedRevision: 1, content: "Stale" }, "PATCH"),
      )
    ).status,
  ).toBe(409);
  expect(
    (await app.request(`${path}/${page.id}/conversation`, json({}))).status,
  ).toBe(503);
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
});

test("keeps page routes behind owner authentication and browser origin checks", async () => {
  const { app, spaces } = build("owner-secret");
  const path = `/api/spaces/${[...spaces.keys()][0]!}/pages`;
  expect((await app.request(path)).status).toBe(401);
  expect(
    (
      await app.request(path, {
        headers: { Authorization: "Bearer owner-secret" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(path, {
        ...json({ title: "Cross-origin" }),
        headers: {
          Authorization: "Bearer owner-secret",
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
      })
    ).status,
  ).toBe(403);
});

test("saves reviewed drafts once and rechecks Space access", async () => {
  const { app, dots } = build();
  const dot = dots.get("dot-a")!;
  const draft = {
    title: "Launch brief",
    content: "A reviewed draft.",
    spaceId: dot.spaceId,
    toolCallId: "review-1",
  };
  const path = "/api/conversations/thread-a/reviewed-page";
  const first = await app.request(path, json(draft));
  expect(first.status).toBe(201);
  const saved = (await first.json()) as { id: string };
  const retry = await app.request(path, json(draft));
  expect(((await retry.json()) as { id: string }).id).toBe(saved.id);
  for (const changed of [
    { ...draft, title: "Different title" },
    { ...draft, content: "Different content." },
  ]) {
    const conflict = await app.request(path, json(changed));
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { error: string }).error).toMatch(
      /different draft/,
    );
  }
  dot.spaceIds = ["elsewhere"];
  expect((await app.request(path, json(draft))).status).toBe(403);
});

test("reports a deleted reviewed page instead of failing or recreating it", async () => {
  const { app, pages, reviews } = build();
  const key = "thread-a/call";
  const page = {
    id: "page-gone",
    spaceId: "space-a",
    title: "Saved",
    content: "Evidence",
    revision: 1,
  };
  pages.set(key, page);
  reviews.set(key, {
    page,
    draft: { title: "Saved", content: "Evidence", spaceId: "space-a" },
  });
  pages.delete(key);
  const receipt = await (
    await app.request("/api/conversations/thread-a/reviewed-page/call")
  ).json();
  expect(receipt).toMatchObject({ deleted: true, pageId: "page-gone" });
});

test("deletes pages through the API and returns 404 for missing pages or spaces", async () => {
  const { app, spaces, pages } = build();
  const space = [...spaces.keys()][0]!;
  pages.set("page-x", {
    id: "page-x",
    spaceId: space,
    title: "To Delete",
    content: "",
    revision: 1,
  });
  const path = `/api/spaces/${space}/pages/page-x`;
  const res = await app.request(path, json(undefined, "DELETE", true));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const missing = await app.request(path, json(undefined, "DELETE", true));
  expect(missing.status).toBe(404);
  const missingSpace = await app.request(
    "/api/spaces/missing-space/pages/page-x",
    json(undefined, "DELETE", true),
  );
  expect(missingSpace.status).toBe(404);
});

test("returns 404 for an unknown conversation", async () => {
  const { app } = build();
  for (const path of [
    "/api/conversations/missing/capture",
    "/api/voice/calls/missing",
  ]) {
    const response = await app.request(path);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toMatch(
      /not found|does not belong/,
    );
  }
});

test("keeps real Intelligence failures as 503 without exposing details", async () => {
  const state = build();
  state.failConversations(new Error("Provider secret"));
  const response = await state.app.request(
    "/api/conversations/thread-a/page",
    json({ title: "Draft" }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error:
      "Page operation could not complete. Check Intelligence setup or retry; your draft has not been discarded.",
  });
});

test("saves Learning settings through the owner API and rejects malformed container IDs", async () => {
  const { app, dots } = build();
  const dot = dots.get("dot-a")!;
  const body = {
    name: dot.name,
    researchAllowed: true,
    memoryAllowed: true,
    learningContainerId: "research",
    skillDeliveryEnabled: true,
  };
  expect(
    (await app.request(`/api/dots/${dot.id}`, json(body, "PUT", true))).status,
  ).toBe(200);
  expect(dot.learningContainerId).toBe("research");
  const gated = build("owner-secret");
  const gatedDot = gated.dots.get("dot-a")!;
  expect(
    (await gated.app.request(`/api/dots/${gatedDot.id}`, json(body, "PUT")))
      .status,
  ).toBe(401);
  expect(
    (
      await app.request(
        `/api/dots/${dot.id}`,
        json({ ...body, learningContainerId: "bad--id" }, "PUT", true),
      )
    ).status,
  ).toBe(400);
});
