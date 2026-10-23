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
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import type { PluginSkill, PluginsPage } from "@/lib/plugins/queries";
import { Route as SkillsRoute } from "@/routes/_authed/_app/skills";

/**
 * The administrator's `/skills` page draws what it was handed, in all three groups.
 *
 * The server answers an administrator with every skill in the deployment; this page's job is only
 * to sort what arrived. "Your skills" and "Workspace skills" come first; "Others' skills" carries
 * everything that belongs to neither — the group that used to be in the response and on no screen.
 *
 * THE OWNERS ARE THE IDS THE RESPONSE CARRIES, because that is all it carries: the skills payload
 * has no person name on it, so the row says `Owner <id>`, which is what a wave replacing these
 * strings with names will have to change after the server grows the field.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const path = String(input).split("?")[0];
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      if (path === "/api/plugins") return json(pluginsPage());
      if (path === "/api/me") {
        return json({
          user: {
            id: "user-1",
            email: "person@example.com",
            role: "admin",
            onboarding: null,
          },
        });
      }
      return json({});
    },
    { preconnect: originalFetch.preconnect },
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

const OTHER_ID = "user-other";

function skill(overrides: Partial<PluginSkill> & { id: string }): PluginSkill {
  return {
    slug: "triage",
    ownerUserId: null,
    title: "Triage",
    summary: "Sort what arrived.",
    instructions: "Sort it.",
    origin: "learned",
    installedBy: "user-other",
    grantedTo: [],
    tools: [],
    ...overrides,
  };
}

/** One of each kind on the page: the admin's own, the workspace's, and somebody else's. */
function pluginsPage(): PluginsPage {
  return {
    catalogue: [],
    servers: [],
    skills: [
      skill({
        id: "mine",
        slug: "house-style",
        ownerUserId: "user-1",
        title: "House style",
      }),
      skill({ id: "workspace", title: "Starter notes" }),
      skill({
        id: "other",
        slug: "handover",
        ownerUserId: OTHER_ID,
        title: "Handover",
      }),
    ],
    botsMayCallBack: true,
    redirectUri: null,
    composioConfigured: false,
  };
}

function renderSkills(client: QueryClient) {
  const rootRoute = createRootRoute({ component: Outlet });
  const authedRoute = createRoute({
    id: "/_authed",
    getParentRoute: () => rootRoute,
    component: Outlet,
  });
  const appRoute = createRoute({
    id: "/_app",
    getParentRoute: () => authedRoute,
    component: Outlet,
  });
  const skills = (
    SkillsRoute as unknown as { update: (options: unknown) => unknown }
  ).update({
    path: "/skills",
    getParentRoute: () => appRoute,
  });
  const tree = rootRoute.addChildren([
    authedRoute.addChildren([appRoute.addChildren([skills as never])]),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/skills"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("the admin's /skills page shows other people's skills, named by the owner id the server carries", async () => {
  global.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0]) => {
      const path = String(input).split("?")[0];
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      if (path === "/api/plugins") return json(pluginsPage());
      if (path === "/api/me") {
        return json({
          user: {
            id: "user-1",
            email: "person@example.com",
            role: "admin",
            onboarding: null,
          },
        });
      }
      return json({});
    },
    { preconnect: originalFetch.preconnect },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = renderSkills(client);

  // The other person's skill is on the page now, not read into the process and dropped.
  expect(await view.findByText("Others' skills")).toBeTruthy();
  expect(view.getByText("Handover")).toBeTruthy();
  expect(view.getByText("Starter notes")).toBeTruthy();
  expect(view.getByText("House style")).toBeTruthy();
  // The owner stands as the response carries them: the skills payload names nobody by name.
  expect(view.getByText(`Owner ${OTHER_ID}`)).toBeTruthy();
});
