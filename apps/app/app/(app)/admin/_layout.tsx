import { Stack } from "expo-router";

// TODO(phase-4): admin gate + stack layout per
// docs/planning/03-route-tree.md §5. Placeholder only — no real guard yet.
export default function AdminLayout() {
  return <Stack screenOptions={{ headerBackTitle: "Back" }} />;
}
