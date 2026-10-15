import {
  Avatar,
  Badge,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  PageRows,
  PageShell,
} from "@orbo/ui";

// TODO(data-binding): replace this static roster with the agents query once the
// Expo data layer lands — DIYA pinned first, then specialists — plus the E/L/X
// states from docs/planning/07-visual-design.md §2.5 A1 (catalog load, Skeleton
// rows, retry), and wire "New agent" to (tabs)/agents/new. No hooks, providers,
// or logic until then.

// A1 Agents list (DIYA pinned) per docs/planning/07-visual-design.md §2.5 and
// docs/planning/03-route-tree.md §5 — static composition only.
export default function AgentsIndexScreen() {
  return (
    <PageShell
      action={<Button size="lg">New agent</Button>}
      description="Every agent you can reach, with DIYA pinned first."
      title="Agents"
    >
      <PageRows>
        <Item size="sm">
          <ItemMedia>
            <Avatar name="DIYA" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>DIYA</ItemTitle>
            <ItemDescription>
              Your personal boss agent, pinned to the top of this list.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge>Pinned</Badge>
          </ItemActions>
        </Item>
        <ItemSeparator />
        <Item size="sm">
          <ItemMedia>
            <Avatar name="General Assistant" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>General Assistant</ItemTitle>
            <ItemDescription>
              Everyday help with writing, planning, and follow-through.
            </ItemDescription>
          </ItemContent>
        </Item>
        <ItemSeparator />
        <Item size="sm">
          <ItemMedia>
            <Avatar name="Knowledge" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Knowledge</ItemTitle>
            <ItemDescription>
              Answers grounded in your spaces and memory.
            </ItemDescription>
          </ItemContent>
        </Item>
      </PageRows>
    </PageShell>
  );
}
