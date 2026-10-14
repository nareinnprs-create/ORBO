import { Stack } from "expo-router";

// TODO(phase-4): root providers (QueryClient, theme, session bootstrap,
// deep-link + push wiring) per docs/planning/03-route-tree.md §5.
// Placeholder only — no real providers yet.
export default function RootLayout() {
  return <Stack screenOptions={{ headerBackTitle: "Back" }} />;
}
