import { createFileRoute } from "@tanstack/react-router";
import { BotSubpage } from "@/components/bot-profile/bot-subpage";
import { ReaSections } from "@/components/bot-profile/rea";

export const Route = createFileRoute("/_authed/_app/bots/$agentId/rea")({
  component: ReaPage,
});

function ReaPage() {
  const { agentId } = Route.useParams();
  return (
    <BotSubpage
      agentId={agentId}
      description="The reverse-engineering tools this Bot may be offered, and what they may touch."
      title="Reverse engineering"
    >
      {(agent) => <ReaSections agent={agent} />}
    </BotSubpage>
  );
}
