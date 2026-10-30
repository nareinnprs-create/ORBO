/// <reference types="vite/client" />

// Vite's own ambient types, which is where `import.meta.glob` is declared. Needed because the
// component gallery discovers its files rather than listing them (see lib/copilot/gallery-registry).

/*
 * What rides in history state. TanStack declares it as an empty interface, so every key must be
 * added here or `navigate({ state })` refuses it. Right now that is one thing: the sidebar's log
 * out telling the sign-in screen that the server refused to end the session (see `app-sidebar`).
 */
declare module "@tanstack/history" {
  interface HistoryState {
    signOutFailed?: boolean;
  }
}
