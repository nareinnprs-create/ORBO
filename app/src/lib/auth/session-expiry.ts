/**
 * The one signal "this browser's session is no longer valid".
 *
 * A 401 used to be handled exactly once, by the auth gate's own read (`/api/me`, which reads the
 * status itself and answers "not signed in"). Every other 401 surfaced as an ordinary failed
 * request: the channel roster said it could not load, a save said it failed, and the app stayed up
 * pretending the person was still signed in while nothing they did would succeed.
 *
 * WHO CALLS THIS. Detection lives where responses are read — `lib/client.ts`, the one place the
 * browser talks to the API server — and in the query and mutation caches, which see errors from
 * anywhere. Both signal through this module rather than reacting themselves, because the reaction
 * needs the query client and the router, and importing either from here (or from the client) would
 * close a cycle through the route tree. The composition root (`main.tsx`) registers the reaction.
 *
 * WHY THE DEDUPE. One dead session does not fail one request. Every mounted query refetches on
 * focus, sockets and timers fire, mutations queue — a dozen 401s can land in the same second, and
 * each of them must not start its own cache clear and navigation. The first one wins; the guard
 * lifts when the redirect settles, so a session that expires again later still gets this same
 * treatment.
 */

/**
 * Whether this path manages or reports the session rather than using it.
 *
 * A 401 from these is an answer, not an expiry: `/api/me` is the initial gate asking "is anybody
 * there", `/api/capabilities` is read by the sign-in screen before anybody is, and `/api/auth/*` is
 * better-auth's own surface — sign-in and sign-out report their failures where the person can act
 * on them, and redirecting mid-sign-out would fight the person who just asked to leave.
 */
export function isSessionPath(path: string): boolean {
  return (
    path === "/api/me" ||
    path === "/api/capabilities" ||
    path.startsWith("/api/auth/")
  );
}

/** What happens when the session dies: clear what the session held, go to /sign. Set by the app's entry point. */
type SessionExpiredReaction = () => void | Promise<void>;

let reaction: SessionExpiredReaction | null = null;
let redirecting = false;

/** Register what a dead session does. Called once, from the composition root. */
export function onSessionExpired(next: SessionExpiredReaction): void {
  reaction = next;
}

/**
 * Report that a request came back 401. Idempotent per redirect: concurrent callers while the first
 * reaction is still running do nothing, and the guard lifts once it settles.
 */
export function sessionExpired(): void {
  if (redirecting || !reaction) {
    return;
  }
  redirecting = true;
  // Deferred so a throwing reaction cannot escape synchronously into whichever caller — a query's
  // error path — happened to signal first.
  void Promise.resolve()
    .then(reaction)
    .finally(() => {
      redirecting = false;
    });
}
