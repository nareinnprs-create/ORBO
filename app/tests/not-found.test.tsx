import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { NotFoundPage } from "@/routes/__root";
import { settleReactWork } from "./settle-react-work";

/**
 * The 404. Unknown addresses used to `<Navigate replace to="/">` silently — the answer a stale
 * bookmark could not tell apart from "you are home". These pin the replacement: the page says the
 * address is unknown, offers home, and does not navigate anywhere on its own.
 *
 * THE HARNESS IS THIS REPOSITORY'S. `GlobalRegistrator` in `beforeAll`/`afterAll`, `cleanup` in
 * `afterEach`, matching `agent-roster-error.test.tsx` for the reason recorded there: bun walks
 * every file into one process, and a document another file tore down mid-run fails invisibly.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function renderAt(path: string) {
  /*
   * A root alone matches every address, so notFoundComponent would never fire — the same shape the
   * real tree has is what makes "/nope" actually unknown: one known child, and nothing else. The
   * root takes no component of its own, so its default Outlet renders the child (and the 404).
   */
  const rootRoute = createRootRoute({ notFoundComponent: NotFoundPage });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Home</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { router, view: render(<RouterProvider router={router as never} />) };
}

test("an unknown address says so instead of silently going home", async () => {
  const { router, view } = renderAt("/definitely/not/a/page");

  expect(await view.findByText("Page not found")).toBeTruthy();
  // The old behaviour was a replace-navigation home; staying put is the fix.
  expect(router.state.location.pathname).toBe("/definitely/not/a/page");
  expect(view.queryByText("Page not found")).toBeTruthy();
});

test("the way home is offered, and names itself", async () => {
  const { view } = renderAt("/nope");

  // Rendered through the Button primitive, so it is a button-shaped anchor with a real href.
  const home = await view.findByRole("button", { name: "Go home" });
  expect(home.getAttribute("href")).toBe("/");
});

test("a fresh visit offers no Back button that cannot go anywhere", async () => {
  const { view } = renderAt("/nope");

  await view.findByText("Page not found");
  // `canGoBack` is false on the first history entry, so the button is not drawn at all.
  expect(view.queryByRole("button", { name: "Go back" })).toBeNull();
});

test("a known address still renders its route, not the 404", async () => {
  const { view } = renderAt("/");

  expect(await view.findByText("Home")).toBeTruthy();
  expect(view.queryByText("Page not found")).toBeNull();
});
