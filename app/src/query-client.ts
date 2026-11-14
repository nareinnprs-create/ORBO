import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isSessionPath, sessionExpired } from "@/lib/auth/session-expiry";
import { RequestError } from "@/lib/client";

/*
 * A 401 that reaches a cache as an error is the session dying under the app, not a failed read:
 * every mounted query and queued mutation will fail the same way in the same second. `lib/client`
 * already signals the expiry at the response, where every authenticated call passes; these handlers
 * are the second pair of eyes, for errors that arrive carrying `RequestError` by any other route.
 * `sessionExpired` dedupes, so the two layers signalling the one dead session cost nothing.
 */
function isExpiredSession(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    error.status === 401 &&
    !isSessionPath(error.path)
  );
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isExpiredSession(error)) sessionExpired();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isExpiredSession(error)) sessionExpired();
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
