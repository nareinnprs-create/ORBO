import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./components/app-error-boundary";
import { onSessionExpired } from "./lib/auth/session-expiry";
import { queryClient } from "./query-client";
import { router } from "./router";
import "@copilotkit/react-core/v2/styles.css";
import "./styles.css";

/*
 * What a dead session does, registered here because it needs both singletons and neither may import
 * the other's side of the graph (see `lib/auth/session-expiry`). Like the sign-out flow, the cache
 * is cleared before the redirect: nothing in it outlives the session it was fetched under.
 */
onSessionExpired(() => {
  queryClient.clear();
  return router.navigate({ to: "/sign" });
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("ORBO could not find the application root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
