import { Stack } from "expo-router";

// TODO(phase-4): session guard + global drawers per
// docs/planning/03-route-tree.md §5. Placeholder only — no real guard yet.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
