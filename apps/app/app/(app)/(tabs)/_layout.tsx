import { Tabs } from "expo-router";

// TODO(phase-4): bottom tabs on native / side rail on web per
// docs/planning/03-route-tree.md §5. Placeholder only — no real chrome yet.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="spaces" options={{ title: "Spaces" }} />
      <Tabs.Screen name="work" options={{ title: "Work" }} />
      <Tabs.Screen name="agents" options={{ title: "Agents" }} />
    </Tabs>
  );
}
