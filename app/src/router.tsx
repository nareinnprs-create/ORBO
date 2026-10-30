import { createRouter } from "@tanstack/react-router";
import { RouteErrorScreen } from "@/components/app-error-boundary";
import type { RouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  /*
   * A route component that throws is answered here rather than by the router's raw default screen.
   * Crashes above the router are the `AppErrorBoundary`'s business, in `main.tsx`; the two share
   * one screen so wherever a render fails, what the person sees is the same.
   */
  defaultErrorComponent: RouteErrorScreen,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
