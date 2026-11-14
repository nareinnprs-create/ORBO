import { IconBinary } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Badge } from "@/components/gallery/frame";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import type { AgentProfile } from "@/lib/agents/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { setPluginGrantMutationOptions } from "@/lib/plugins/mutations";
import {
  type PluginTool,
  pluginsPageQueryOptions,
} from "@/lib/plugins/queries";
import { readToolName } from "@/lib/plugins/tool-name";
import { queryClient } from "@/query-client";

/** The server id REA's catalogue entry is filed under, and the prefix of every tool ref it grants. */
const SERVER_ID = "rea";

/**
 * The families REA's own documentation calls read-safe. Shown so an administrator can see at a
 * glance which groups only look; every tool is still granted and gated as a write.
 */
const READ_SAFE = new Set([
  "session",
  "native",
  "artifact",
  "application",
  "enhanced",
]);

/** Family prefix → the words a person reads. Unknown prefixes label themselves. */
const FAMILY_LABELS: Record<string, string> = {
  session: "Sessions",
  native: "Native binaries",
  artifact: "Artifacts",
  application: "Applications",
  enhanced: "Enhanced analysis",
  frida: "Frida injection",
  adb: "Devices",
  browser: "Browser control",
  electron: "Electron",
  javascript: "JavaScript runtime",
};

/** `session_open` → `session`: the family is the prefix before the underscore. */
function familyOf(toolName: string): string {
  return toolName.split("_")[0] ?? toolName;
}

function familyLabel(family: string): string {
  return (
    FAMILY_LABELS[family] ?? family.charAt(0).toUpperCase() + family.slice(1)
  );
}

/**
 * The reverse-engineering tools, grouped by REA's own tool families.
 *
 * Grants on an MCP tool are an administrator's decision — the server refuses anybody else — so an
 * administrator gets the switches and everybody else reads the same list without them. What is
 * granted is what the runtime offers; what a call may DO is still decided by the Bot's approval
 * rules, which is the note under the section.
 */
export function ReaSections({ agent }: { agent: AgentProfile }) {
  const agentId = agent.id;
  const me = useQuery(currentUserQueryOptions());
  const admin = me.data?.role === "admin";
  const page = useQuery(pluginsPageQueryOptions());
  const grant = useMutation(setPluginGrantMutationOptions(queryClient));

  const server = page.data?.servers.find((row) => row.id === SERVER_ID);
  const tools = server?.tools ?? [];
  const groups = new Map<string, PluginTool[]>();
  for (const tool of tools) {
    const family = familyOf(tool.name);
    groups.set(family, [...(groups.get(family) ?? []), tool]);
  }
  // Read-safe families first, then the rest, then anything unlabelled — the order an
  // administrator reads the risk in.
  const families = [...groups.keys()].sort((left, right) => {
    if (READ_SAFE.has(left) !== READ_SAFE.has(right)) {
      return READ_SAFE.has(left) ? -1 : 1;
    }
    return left.localeCompare(right);
  });

  return (
    <PageSection
      title="Reverse-engineering tools"
      description="Reads over binaries and installed apps: pseudocode, ASAR/JS analysis, version diffs and evidence bundles. Being granted a tool decides whether it is offered; every call still goes through this Bot's approval rules."
    >
      {grant.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {grant.error.message}
        </p>
      ) : null}
      {page.isPending ? (
        <LoadingState label="Reading the REA catalogue…" />
      ) : page.error ? (
        <ErrorState>The REA tools could not be loaded.</ErrorState>
      ) : !server ? (
        <PageEmpty>
          The REA server has not been added to this deployment yet. An
          administrator adds it from the Plugins screens.
        </PageEmpty>
      ) : tools.length === 0 ? (
        <PageEmpty>
          The REA server is added but advertises no tools. Check that it is
          running, then refresh it from the Plugins screens.
        </PageEmpty>
      ) : (
        <>
          {!admin ? (
            <p className="mt-4 text-muted-foreground text-sm">
              Grants are decided by an administrator, so this list is read-only.
            </p>
          ) : null}
          {families.map((family) => {
            const familyTools = groups.get(family) ?? [];
            return (
              <Fragment key={family}>
                <h3 className="mt-8 flex items-center gap-2 font-semibold text-sm">
                  {familyLabel(family)}
                  {READ_SAFE.has(family) ? (
                    <Badge tone="neutral">read-safe</Badge>
                  ) : null}
                </h3>
                <PageRows>
                  {familyTools.map((tool, index) => {
                    const granted = tool.grantedTo.includes(agentId);
                    return (
                      <Fragment key={tool.ref}>
                        {index > 0 ? <Separator /> : null}
                        <Item size="sm">
                          <ItemMedia variant="icon">
                            <IconBinary />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>
                              {readToolName(tool.name).label}
                            </ItemTitle>
                            <ItemDescription>
                              {tool.description}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Badge tone="caution">{tool.effect}</Badge>
                            {admin ? (
                              <Switch
                                aria-label={tool.name}
                                checked={granted}
                                disabled={grant.isPending}
                                onCheckedChange={(value) =>
                                  grant.mutate({
                                    agentId,
                                    granted: value,
                                    kind: "mcp",
                                    ref: tool.ref,
                                  })
                                }
                              />
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {granted ? "Granted" : "Not granted"}
                              </span>
                            )}
                          </ItemActions>
                        </Item>
                      </Fragment>
                    );
                  })}
                </PageRows>
              </Fragment>
            );
          })}
        </>
      )}
    </PageSection>
  );
}
