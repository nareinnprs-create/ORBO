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
import { ReaSections } from "@/components/bot-profile/rea";
import type { AgentProfile } from "@/lib/agents/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * The Bot's reverse-engineering tools: an administrator's switches on REA's tool families, a
 * read-only list for everybody else, and the missing-server answer.
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

const BOT: AgentProfile = {
  id: "expenses",
  name: "Expenses",
  title: "Finance",
  roleDescription: "Receipts.",
  avatarSeed: "e",
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
};

const tool = (name: string, grantedTo: string[]) => ({
  serverId: "rea",
  name,
  description: `${name} description`,
  inputSchema: {},
  ref: `rea/${name}`,
  effect: "write",
  destructive: false,
  grantedTo,
});

const REA_SERVER = {
  id: "rea",
  title: "REA Agents",
  vendor: "REA",
  url: "http://127.0.0.1:3111/mcp",
  summary: "",
  docsUrl: "",
  provenance: "first-party",
  hasCredential: true,
  toolsRefreshedAt: null,
  lastError: null,
  addedBy: null,
  dynamicClient: false,
  authScheme: null,
  tools: [
    tool("session_open", ["expenses"]),
    tool("native_decompile", []),
    tool("frida_attach", []),
  ],
  withdrawn: [],
  accountMode: null,
  sharedVendorConnected: false,
};

const grants: string[] = [];
function serving(role: "admin" | "user", servers: unknown[] = [REA_SERVER]) {
  grants.length = 0;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/plugins/grants")) {
      grants.push(
        `${init?.method ?? "GET"} ${url} ${String(init?.body ?? "")}`,
      );
      return Response.json({ ok: true });
    }
    if (url.endsWith("/api/plugins")) {
      return Response.json({
        catalogue: [],
        servers,
        skills: [],
        botsMayCallBack: true,
        redirectUri: null,
        composioConfigured: false,
      });
    }
    if (url.includes("/api/plugins/for/")) {
      return Response.json({ tools: [], skills: [] });
    }
    if (url.includes("/api/me")) {
      return Response.json({
        user: {
          id: "me",
          email: "me@example.test",
          name: "Me",
          role,
          onboarding: null,
        },
      });
    }
    return Response.json({});
  }) as unknown as typeof fetch;
}

function draw() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute({
      component: () => <ReaSections agent={BOT} />,
    }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

test("an administrator gets switches, and turning one on grants the rea ref", async () => {
  serving("admin");
  const view = draw();
  const on = await view.findByRole("switch", { name: "session_open" });
  const off = view.getByRole("switch", { name: "native_decompile" });
  expect(on.getAttribute("aria-checked")).toBe("true");
  expect(off.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(off);
  await waitFor(() => expect(grants).toHaveLength(1));
  expect(grants[0]).toContain("POST");
  expect(grants[0]).toContain("rea/native_decompile");
  expect(grants[0]).toContain("expenses");
  expect(grants[0]).toContain("mcp");
  // Grouped by family, read-safe first.
  expect(await view.findByText("Sessions")).toBeTruthy();
  expect(view.getByText("Native binaries")).toBeTruthy();
  expect(view.getByText("Frida injection")).toBeTruthy();
});

test("for anybody else the list is read-only", async () => {
  serving("user");
  const view = draw();
  expect(
    await view.findByText(/Grants are decided by an administrator/),
  ).toBeTruthy();
  expect(view.queryByRole("switch")).toBeNull();
  expect(view.getByText("Granted")).toBeTruthy();
  expect(view.getAllByText("Not granted")).toHaveLength(2);
});

test("without the REA server the page says what is missing", async () => {
  serving("admin", []);
  const view = draw();
  expect(
    await view.findByText(/has not been added to this deployment/),
  ).toBeTruthy();
  expect(view.queryByRole("switch")).toBeNull();
});
