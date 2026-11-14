import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { type AgentProfile, agentKeys } from "@/lib/agents/queries";
import { type AuthenticatedUser, authKeys } from "@/lib/auth/queries";
import { healthKeys } from "@/lib/health/queries";
import { Route as OnboardingRoute } from "@/routes/_authed/onboarding";
import { settleReactWork } from "./settle-react-work";

/**
 * The first-run wizard, as it actually branches.
 *
 * Three steps, and the interesting one is the middle: provider keys are an administrator's
 * deployment-side configuration, so the step branches on /health — the one endpoint that answers
 * for the Intelligence runtime — between "you're set" and who connects it. The last step carries a
 * chosen first Bot out of the wizard as the app's opening conversation.
 *
 * THE HARNESS IS THIS REPOSITORY'S. `GlobalRegistrator` in `beforeAll`/`afterAll`, `cleanup` in
 * `afterEach`, matching `agent-roster-error.test.tsx` for the reason recorded there.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "u1",
    email: "person@example.com",
    name: "Person",
    image: null,
    role: "user",
    onboarding: { step: 0, completedAt: null },
    ...overrides,
  };
}

function agent(
  overrides: Partial<AgentProfile> & { id: string },
): AgentProfile {
  return {
    name: "Agent",
    title: "Title",
    roleDescription: "Role",
    avatarSeed: "seed",
    visibility: "public",
    endpoint: null,
    builtIn: true,
    hasAuth: false,
    hasCallbackToken: false,
    hidden: false,
    pinned: false,
    systemOwned: false,
    canManage: true,
    mine: false,
    ...overrides,
  };
}

const connectedHealth = { ok: true, degraded: [] };
const degradedHealth = {
  ok: false,
  degraded: [{ name: "intelligence", error: "No answer from Intelligence." }],
};

/**
 * Seeds everything the wizard reads so the fetch mock below only has to answer the two calls the
 * wizard itself makes — the roster refetch on mount, and the completion POST.
 */
function seededClient(options: {
  user: AuthenticatedUser;
  health?: typeof connectedHealth | typeof degradedHealth;
  agents?: AgentProfile[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(authKeys.currentUser(), options.user);
  if (options.health) {
    queryClient.setQueryData(healthKeys.report(), options.health);
  }
  queryClient.setQueryData(agentKeys.list(false), options.agents ?? []);
  return queryClient;
}

/** Routes what the wizard itself asks for; anything else is a 500 the test wants to see. */
let posts: Array<{ path: string; body: unknown }> = [];
/** What `GET /api/agents` answers — the refetch-on-mount has to see the same roster the seed did. */
let servedAgents: AgentProfile[] = [];

function mockFetch(agents: AgentProfile[] = []) {
  posts = [];
  servedAgents = agents;
  global.fetch = (async (path: string, init?: RequestInit) => {
    if (path === "/api/me/onboarding" && init?.method === "POST") {
      posts.push({ path, body: JSON.parse(init.body as string) });
      return Response.json({ step: 2, completedAt: "2026-01-01T00:00:00Z" });
    }
    if (path.startsWith("/api/agents")) {
      return Response.json({ agents: servedAgents });
    }
    return new Response(null, { status: 500 });
  }) as unknown as typeof fetch;
}

function renderWizard(queryClient: QueryClient) {
  const rootRoute = createRootRoute({
    component: OnboardingRoute.options.component,
  });
  const router = createRouter({
    routeTree: rootRoute,
    // "/" because a bare root's own path is "/": an "/onboarding" entry would match nothing and
    // render the default empty not-found. The component is the route's, whatever the address.
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return {
    router,
    view: render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    ),
  };
}

test("the welcome step wears the brand and both taglines", async () => {
  mockFetch();
  const { view } = renderWizard(seededClient({ user: user() }));

  expect(await view.findByText("Welcome to ORBO")).toBeTruthy();
  expect(view.getByText("Your Personal AI Companion.")).toBeTruthy();
  expect(view.getByText("Think. Remember. Plan. Act.")).toBeTruthy();
  // The Diya wordmark, drawn as images the theme swaps between.
  const marks = view.getAllByAltText("");
  expect(
    marks.some((img) =>
      img.getAttribute("src")?.includes("orbo_diya_horizontal"),
    ),
  ).toBe(true);
});

test("a connected model runtime makes the provider step say you're set", async () => {
  mockFetch();
  const { view } = renderWizard(
    seededClient({ user: user(), health: connectedHealth }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  expect(await view.findByText("No keys to enter")).toBeTruthy();
  expect(
    await view.findByText(
      "This deployment's model runtime is connected — you're set.",
    ),
  ).toBeTruthy();
});

test("a degraded model runtime points at whoever connects it, by role", async () => {
  mockFetch();
  const { view } = renderWizard(
    seededClient({ user: user(), health: degradedHealth }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  expect(
    await view.findByText(
      "The model runtime isn't answering yet. If Bots can't answer, your administrator is the one who connects it.",
    ),
  ).toBeTruthy();
});

test("an administrator is told where the connection belongs instead", async () => {
  mockFetch();
  const { view } = renderWizard(
    seededClient({
      user: user({ role: "admin" }),
      health: degradedHealth,
    }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  expect(
    await view.findByText(
      "The model runtime isn't answering yet. As an administrator, connect Intelligence in the deployment's environment — /health will say when it answers.",
    ),
  ).toBeTruthy();
});

test("the provider step holds nothing to enter, and Back returns to welcome", async () => {
  mockFetch();
  const { view } = renderWizard(
    seededClient({ user: user(), health: connectedHealth }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  // Nothing was entered here, so the way back is the same Back every step has.
  fireEvent.click(await view.findByRole("button", { name: "Back" }));
  expect(await view.findByText("Welcome to ORBO")).toBeTruthy();
});

test("a chosen first Bot completes onboarding into its conversation", async () => {
  const chosen = agent({ id: "bot-1", name: "Scout", title: "Researcher" });
  const roster = [chosen, agent({ id: "bot-2", name: "Other" })];
  mockFetch(roster);
  const { router, view } = renderWizard(
    seededClient({ user: user(), health: connectedHealth, agents: roster }),
  );

  // Forward through both steps.
  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  fireEvent.click(await view.findByRole("button", { name: "Continue" }));

  const pick = await view.findByRole("button", { name: /Scout/ });
  fireEvent.click(pick);
  expect(pick.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(view.getByRole("button", { name: "Get started" }));
  await waitFor(() => {
    expect(posts).toEqual([
      { path: "/api/me/onboarding", body: { completed: true } },
    ]);
  });

  // The wizard fades, then lands in the chosen Bot's compose screen — the first channel is
  // created by the first message sent there, which is the only way this server makes one.
  await waitFor(
    () => {
      expect(router.state.location.pathname).toBe("/channel/new");
    },
    { timeout: 4000 },
  );
  expect(router.state.location.search).toEqual({ agent: "bot-1" });
});

test("finishing without a choice lands at home, as it always has", async () => {
  mockFetch();
  const { router, view } = renderWizard(
    seededClient({ user: user(), health: connectedHealth, agents: [] }),
  );

  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  fireEvent.click(await view.findByRole("button", { name: "Continue" }));
  fireEvent.click(await view.findByRole("button", { name: "Get started" }));

  await waitFor(
    () => {
      expect(router.state.location.pathname).toBe("/");
    },
    { timeout: 4000 },
  );
});
