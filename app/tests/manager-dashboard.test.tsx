import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import type { AgentProfile } from "@/lib/agents/queries";
import type { BotAttention } from "@/lib/bot-lifecycle/queries";
import type { ChannelSummary } from "@/lib/channels/queries";
import type { ProactiveSetting } from "@/lib/proactive";
import { settleReactWork } from "./settle-react-work";

/**
 * The manager dashboard, drawn from the endpoints the app already has: agents, attention,
 * channels, proactive settings and the current user. The harness is this repository's:
 * `GlobalRegistrator` around the file, `cleanup` after each test, a `QueryClient` per test with
 * `retry: false`, and `fetch` stubbed per test.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function bot(overrides: Partial<AgentProfile> & { id: string }): AgentProfile {
  return {
    name: overrides.id,
    title: "Title",
    roleDescription: "Role",
    avatarSeed: "seed",
    visibility: "private",
    endpoint: null,
    builtIn: true,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    systemOwned: false,
    canManage: true,
    mine: true,
    ...overrides,
  };
}

function channel(
  overrides: Partial<ChannelSummary> & { id: string },
): ChannelSummary {
  return {
    name: overrides.id,
    agentIds: [],
    threadId: overrides.id,
    active: true,
    lastMessageAt: null,
    summary: null,
    lastMessage: null,
    lastMessageAgentId: null,
    createdAt: "2026-01-01T00:00:00Z",
    pinned: false,
    lastReadAt: null,
    ...overrides,
  };
}

function setting(
  overrides: Partial<ProactiveSetting> & { id: string; agentId: string },
): ProactiveSetting {
  return {
    channelId: "channel-1",
    focus: "Focus",
    enabled: true,
    intervalMinutes: 60,
    nextRunAt: "2026-02-02T00:00:00Z",
    lastRunAt: null,
    lastStatus: "succeeded",
    lastError: null,
    ...overrides,
  };
}

/** Captured requests, for asserting what the Nudge button did. */
let requests: { url: string; method: string }[] = [];

/**
 * Serves every query the dashboard reads. `user` picks the signed-in role, which gates the
 * Analytics section.
 */
function serving(options: {
  agents?: AgentProfile[];
  attention?: BotAttention[];
  channels?: ChannelSummary[];
  settings?: ProactiveSetting[];
  role?: "admin" | "user";
}) {
  const {
    agents = [],
    attention = [],
    channels = [],
    settings = [],
    role = "user",
  } = options;
  requests = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/api/bots/attention"))
      return Response.json({ bots: attention });
    if (url.includes("/api/channels"))
      return Response.json({ channels, nextCursor: null });
    if (url.includes("/api/proactive/settings"))
      return Response.json({ settings });
    if (url.includes("/api/me"))
      return Response.json({ user: { id: "u1", email: "u@x.io", role } });
    return Response.json({ agents });
  }) as unknown as typeof fetch;
}

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

function draw(client: QueryClient = queryClient) {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: ManagerDashboard,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/channel/$channelId",
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/bots/$agentId",
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/admin/audit",
      component: () => null,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("a busy channel is under Working now, and opens the conversation", async () => {
  serving({
    agents: [bot({ id: "a1" })],
    channels: [
      channel({ id: "live", name: "Live", busy: true, agentIds: ["a1"] }),
      channel({ id: "quiet", name: "Quiet" }),
    ],
  });
  const view = draw();
  const live = (await view.findByText("Live")).closest("a");
  expect(live?.getAttribute("href")).toBe("/channel/live");
  expect(view.queryByText("Quiet")).toBeNull();
});

test("with nothing running, Working now says so", async () => {
  serving({
    agents: [bot({ id: "a1" })],
    channels: [channel({ id: "quiet", name: "Quiet" })],
  });
  const view = draw();
  expect(await view.findByText("Nothing is running right now.")).toBeTruthy();
  expect(view.queryByText("Quiet")).toBeNull();
});

test("Bots waiting on you show their count under Needs you", async () => {
  serving({
    agents: [bot({ id: "a1" })],
    attention: [
      {
        agentId: "a1",
        name: "Helper",
        questions: 1,
        approvals: 1,
        handoffs: 0,
        unread: 0,
        paused: false,
        notify: "all",
      },
    ],
  });
  const view = draw();
  expect(await view.findByText("Helper")).toBeTruthy();
  expect(view.getByText("2")).toBeTruthy();
  const row = view.getByText("Helper").closest("a");
  expect(row?.getAttribute("href")).toBe("/bots/a1");
});

test("with nothing waiting, Needs you says so", async () => {
  serving({ agents: [bot({ id: "a1" })] });
  const view = draw();
  expect(await view.findByText("Nothing is waiting on you.")).toBeTruthy();
});

test("Nudge asks the server to run that Bot's research now", async () => {
  serving({
    agents: [bot({ id: "a1" })],
    settings: [setting({ id: "s1", agentId: "a1" })],
  });
  const view = draw();
  fireEvent.click(
    await view.findByRole("button", { name: /background research now/ }),
  );
  await waitFor(() => {
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.url.includes("/api/proactive/settings/s1/run"),
      ),
    ).toBe(true);
  });
});

test("a Bot without research enabled has no Nudge, only Open", async () => {
  serving({
    agents: [bot({ id: "a1" })],
    settings: [setting({ id: "s1", agentId: "a1", enabled: false })],
  });
  const view = draw();
  expect(await view.findByText("a1")).toBeTruthy();
  expect(
    view.queryByRole("button", { name: /background research now/ }),
  ).toBeNull();
  expect(view.getByRole("button", { name: /Open/ })).toBeTruthy();
});

test("Usage is honest: no metered spend to show", async () => {
  serving({ agents: [bot({ id: "a1" })] });
  const view = draw();
  expect(await view.findByText("No usage data yet")).toBeTruthy();
});

test("Analytics is for admins only", async () => {
  serving({ agents: [bot({ id: "a1" })], role: "admin" });
  const admin = draw();
  expect(await admin.findByText("Audit log")).toBeTruthy();
  cleanup();

  // A fresh client, so the admin role cached above cannot leak into the user's render.
  serving({ agents: [bot({ id: "a1" })], role: "user" });
  const user = draw(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  expect(await user.findByText("a1")).toBeTruthy();
  expect(user.queryByText("Audit log")).toBeNull();
});
