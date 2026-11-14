import {
  IconChartBar,
  IconChevronRight,
  IconListDetails,
} from "@tabler/icons-react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import {
  attentionSummary,
  needsInput,
} from "@/components/bot-profile/attention";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/states";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  type BotAttention,
  botAttentionQueryOptions,
} from "@/lib/bot-lifecycle/queries";
import {
  type ChannelSummary,
  channelListQueryOptions,
} from "@/lib/channels/queries";
import {
  changeProactiveSettingMutationOptions,
  type ProactiveSetting,
  proactiveSettingsQueryOptions,
} from "@/lib/proactive";
import { relativeTime } from "@/lib/relative-time";

/**
 * The multi-Bot manager view: one screen that answers "what is happening, what needs me, and what
 * is each Bot up to", drawn entirely from data the app already fetches.
 *
 * WHAT IS DELIBERATELY NOT HERE. No stop or cancel: those live behind each Bot's own activity
 * endpoint, and one poller per Bot from a dashboard would be the cost of a feature for every
 * visitor. A nudge — the server's existing run-now for a Bot's background research — and a link
 * into the conversation are the two moves this screen can make without new endpoints.
 */
export function ManagerDashboard() {
  const agents = useQuery(agentListQueryOptions());
  const attention = useQuery(botAttentionQueryOptions());
  const proactive = useQuery(proactiveSettingsQueryOptions());
  const currentUser = useQuery(currentUserQueryOptions());
  // Same options the sidebar reads, so the socket that keeps it live is the one it opened.
  const channels = useInfiniteQuery(channelListQueryOptions());

  if (agents.isPending) return null;
  // Only when nothing ever loaded: a failed refetch keeps the rows it had.
  if (agents.data === undefined) {
    return <PageEmpty>Could not load your Bots.</PageEmpty>;
  }

  const byId = new Map((attention.data ?? []).map((bot) => [bot.agentId, bot]));
  const agentsById = new Map(agents.data.map((agent) => [agent.id, agent]));
  const busyChannels = (channels.data ?? []).filter(
    (channel) => channel.busy && channel.active,
  );
  const waiting = (attention.data ?? []).filter((bot) => needsInput(bot) > 0);
  // Recency order, so the first channel an agent appears in is its most recent one.
  const channelByAgent = new Map<string, ChannelSummary>();
  for (const channel of channels.data ?? []) {
    for (const agentId of channel.agentIds) {
      if (!channelByAgent.has(agentId)) channelByAgent.set(agentId, channel);
    }
  }
  const settingsByAgent = new Map(
    (proactive.data ?? []).map((setting) => [setting.agentId, setting]),
  );

  return (
    <>
      <PageSection
        description="A turn is running in these conversations right now."
        title="Working now"
      >
        {busyChannels.length ? (
          <PageRows>
            {busyChannels.map((channel, index) => (
              <Fragment key={channel.id}>
                {index > 0 ? <Separator /> : null}
                <Item
                  render={
                    <Link
                      params={{ channelId: channel.id }}
                      to="/channel/$channelId"
                    />
                  }
                  size="sm"
                >
                  <ItemMedia>
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 animate-pulse rounded-full bg-diya-rich-teal"
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{channel.name}</ItemTitle>
                    <ItemDescription>
                      {channel.summary ?? channel.lastMessage ?? ""}
                    </ItemDescription>
                  </ItemContent>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Item>
              </Fragment>
            ))}
          </PageRows>
        ) : (
          <PageEmpty>Nothing is running right now.</PageEmpty>
        )}
      </PageSection>

      <PageSection
        description="Questions, approvals and hand-offs only you can move forward."
        title="Needs you"
      >
        {waiting.length ? (
          <PageRows>
            {waiting.map((bot, index) => (
              <Fragment key={bot.agentId}>
                {index > 0 ? <Separator /> : null}
                <Item
                  render={
                    <Link
                      params={{ agentId: bot.agentId }}
                      to="/bots/$agentId"
                    />
                  }
                  size="sm"
                >
                  <ItemMedia>
                    <AbstractAvatar
                      name={bot.name}
                      seed={
                        agentsById.get(bot.agentId)?.avatarSeed ?? bot.agentId
                      }
                      size={28}
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{bot.name}</ItemTitle>
                    <ItemDescription>{attentionSummary(bot)}</ItemDescription>
                  </ItemContent>
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground tabular-nums">
                    {needsInput(bot)}
                  </span>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Item>
              </Fragment>
            ))}
          </PageRows>
        ) : (
          <PageEmpty>Nothing is waiting on you.</PageEmpty>
        )}
      </PageSection>

      <PageSection
        description="What each Bot is set to do on its own, and a way to ask it to start now."
        title="Your Bots"
      >
        {agents.data.length ? (
          <PageRows>
            {agents.data.map((agent, index) => (
              <Fragment key={agent.id}>
                {index > 0 ? <Separator /> : null}
                <BotRow
                  agent={agent}
                  attention={byId.get(agent.id)}
                  channel={channelByAgent.get(agent.id)}
                  setting={settingsByAgent.get(agent.id)}
                />
              </Fragment>
            ))}
          </PageRows>
        ) : (
          <PageEmpty>You have no Bots yet.</PageEmpty>
        )}
      </PageSection>

      <PageSection description="What your Bots spend." title="Usage">
        {/*
         * HONEST BY DEFAULT. There is no spend endpoint anywhere in the app's API, so anything
         * metered here would be invented. When the server grows one, this card is what it replaces.
         */}
        <EmptyState
          description="Spend reporting is not wired up on this deployment yet, so there is nothing to meter. Per-Bot usage will appear here once the server reports it."
          icon={IconChartBar}
          title="No usage data yet"
        />
      </PageSection>

      {currentUser.data?.role === "admin" ? (
        <PageSection
          description="What happened across this deployment."
          title="Analytics"
        >
          <PageRows>
            <Item render={<Link to="/admin/audit" />} size="sm">
              <ItemMedia>
                <IconListDetails className="size-4 text-muted-foreground" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Audit log</ItemTitle>
                <ItemDescription>
                  Every action taken in this deployment, and by whom.
                </ItemDescription>
              </ItemContent>
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Item>
          </PageRows>
        </PageSection>
      ) : null}
    </>
  );
}

/** One Bot on the manager: its standing, its research, and the two moves this screen can make. */
function BotRow({
  agent,
  attention,
  channel,
  setting,
}: {
  agent: AgentProfile;
  attention: BotAttention | undefined;
  channel: ChannelSummary | undefined;
  setting: ProactiveSetting | undefined;
}) {
  const nudge = useMutation(
    changeProactiveSettingMutationOptions(useQueryClient()),
  );
  const parts: string[] = [];
  if (attention?.paused) parts.push("Paused");
  if (attention && needsInput(attention) > 0)
    parts.push(attentionSummary(attention));
  if (setting?.enabled) {
    parts.push(`Background research ${setting.lastStatus}`);
    if (setting.nextRunAt)
      parts.push(`next run ${relativeTime(setting.nextRunAt)}`);
  }

  return (
    <Item size="sm">
      <ItemMedia>
        <AbstractAvatar name={agent.name} seed={agent.avatarSeed} size={28} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{agent.name}</ItemTitle>
        <ItemDescription>{parts.join(" · ") || agent.title}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {setting?.enabled ? (
          <Button
            aria-label={`Run ${agent.name}'s background research now`}
            disabled={nudge.isPending}
            onClick={() =>
              nudge.mutate({
                setting: { id: setting.id, enabled: setting.enabled },
                change: { kind: "run" },
              })
            }
            size="sm"
            variant="outline"
          >
            {nudge.isPending ? "Nudging…" : "Nudge"}
          </Button>
        ) : null}
        <Button
          render={(props) => (
            <Link
              {...props}
              {...(channel
                ? {
                    params: { channelId: channel.id },
                    to: "/channel/$channelId",
                  }
                : { params: { agentId: agent.id }, to: "/bots/$agentId" })}
            />
          )}
          size="sm"
          variant="ghost"
        >
          Open
        </Button>
      </ItemActions>
    </Item>
  );
}
