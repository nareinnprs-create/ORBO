import type { McpCallResult } from "./mcp";

/**
 * WS-10 first slice (09 §4): one MCP server + one tool with a per-agent allowlist.
 *
 * A deliberately small, in-memory governed path: a server is registered, a single
 * tool is exposed on it, and each agent either holds a grant for that tool or it
 * does not. An agent holding the grant executes through the injected transport; an
 * agent without one is refused and the refusal is written to the audit sink before
 * the throw, so the trail names the rule the same way the DB-backed store does
 * (`mcp.call_rejected` with `refusal: "not_granted"`).
 *
 * No network here: the transport arrives by injection and the tests install a
 * recording stub, the same seam shape as `useComposioClient` / `useRoutineTools`.
 * Composio brokering is deferred to slice 2 — nothing in this module names it.
 */

/** One exposed tool, as the transport listed it. */
export type Ws10Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * The remote side of the slice, stubbed in tests and wired to MCP in slice 2.
 *
 * Narrower than `VendorTransport` on purpose: this slice has one server and one
 * tool, so the transport is asked to list that server and call that tool, and
 * nothing else.
 */
export type Ws10Transport = {
  listTools(server: { id: string; url: string }): Promise<Ws10Tool[]>;
  callTool(
    server: { id: string; url: string },
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpCallResult>;
};

/** One audit row, mirroring the store's `mcp.call*` payload shape. */
export type Ws10AuditEvent = {
  eventType: "mcp.call" | "mcp.call_rejected";
  targetType: "mcp_tool";
  targetId: string;
  payload: Record<string, unknown>;
};

/**
 * A refusal this slice authored: the agent was not granted the tool.
 *
 * Mirrors `PluginRefusedError`'s shape (`rule: null` — no policy rule refused
 * this, the allowlist simply has no row) so callers can treat both alike when
 * the DB-backed grants land in slice 2.
 */
export class Ws10RefusedError extends Error {
  readonly rule: null = null;
  constructor(message: string) {
    super(message);
    this.name = "Ws10RefusedError";
  }
}

/**
 * A model-callable tool name for a `<serverId>/<toolName>` ref.
 *
 * The same rule as the store's `toolNameFor`: a slash reads well to a person and
 * cannot appear in either half, while a model tool name may not contain one, so
 * the offered name joins with `__` under the `mcp__` prefix. Defined here rather
 * than imported so this slice stays free of the DB layer; the test pins the
 * literal mapping, which is what keeps the two spellings from drifting.
 */
export function ws10ToolNameFor(ref: string): string {
  return `mcp__${ref.replace("/", "__")}`;
}

/** The inverse of {@link ws10ToolNameFor}; null for anything this slice did not offer. */
export function ws10RefFromToolName(toolName: string): string | null {
  if (!toolName.startsWith("mcp__")) return null;
  const rest = toolName.slice("mcp__".length);
  const separator = rest.indexOf("__");
  if (separator <= 0) return null;
  return `${rest.slice(0, separator)}/${rest.slice(separator + 2)}`;
}

export type Ws10Server = {
  id: string;
  url: string;
};

export type Ws10SliceOptions = {
  /** Where audit rows go; kept in memory when absent. */
  auditSink?: (event: Ws10AuditEvent) => void;
  /** The remote side; calls fail closed until one is installed. */
  transport?: Ws10Transport | null;
};

/**
 * The slice's own state: one server, one tool, and the per-agent allowlist.
 *
 * A factory rather than module-level bindings so each test owns its registry
 * and nothing leaks between files under Bun's single-process run.
 */
export function createWs10Slice(options: Ws10SliceOptions = {}) {
  let server: Ws10Server | null = null;
  let tool: Ws10Tool | null = null;
  /** `<agentId>/<ref>` pairs, the allowlist itself. */
  const grants = new Set<string>();
  const auditTrail: Ws10AuditEvent[] = [];
  let transport: Ws10Transport | null = options.transport ?? null;

  const audit = (event: Ws10AuditEvent) => {
    auditTrail.push(event);
    options.auditSink?.(event);
  };

  const grantKey = (agentId: string, ref: string) => `${agentId}/${ref}`;

  return {
    /** The audit rows written so far, oldest first. */
    auditTrail,

    /** Swap the transport; null uninstalls it and calls fail closed again. */
    useTransport(next: Ws10Transport | null): void {
      transport = next;
    },

    /**
     * Register the slice's one MCP server.
     *
     * The address floor is the same blunt one the catalogue applies to a typed
     * URL: it must parse and it must be https, because the credential is a
     * bearer token and plaintext is not negotiable. A second server is refused:
     * this slice is one server, and a second registration is a caller that has
     * outgrown it rather than a state to hold.
     */
    registerServer(id: string, url: string): Ws10Server {
      if (server !== null) {
        throw new Ws10RefusedError(
          "This slice holds one MCP server, which is already registered.",
        );
      }
      if (id.trim() === "" || id.includes("/")) {
        throw new Ws10RefusedError(
          "A server id names the grant, so it must be a non-empty string with no slash in it.",
        );
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Ws10RefusedError("That is not a URL.");
      }
      if (parsed.protocol !== "https:") {
        throw new Ws10RefusedError("An MCP server must be reached over https.");
      }
      server = { id, url };
      return server;
    },

    /**
     * Expose the slice's one tool on the registered server.
     *
     * Exactly one, and only after the server: the ref `<serverId>/<toolName>`
     * is what a grant names, so a tool without a server behind it is a name
     * nothing can resolve.
     */
    exposeTool(input: Ws10Tool): Ws10Tool {
      if (server === null) {
        throw new Ws10RefusedError(
          "Register the MCP server before exposing its tool.",
        );
      }
      if (tool !== null) {
        throw new Ws10RefusedError(
          "This slice exposes one tool, which is already exposed.",
        );
      }
      if (input.name.trim() === "" || input.name.includes("/")) {
        throw new Ws10RefusedError(
          "A tool name joins its server with a slash, so it must be a non-empty string with no slash in it.",
        );
      }
      tool = {
        name: input.name,
        description: input.description,
        inputSchema: input.inputSchema,
      };
      return tool;
    },

    /** Grant one agent the slice's tool. */
    grant(agentId: string): { ref: string; agentId: string } {
      if (server === null || tool === null) {
        throw new Ws10RefusedError(
          "There is no tool to grant until the server is registered and its tool exposed.",
        );
      }
      if (agentId.trim() === "") {
        throw new Ws10RefusedError("A grant names the agent it is for.");
      }
      const ref = `${server.id}/${tool.name}`;
      grants.add(grantKey(agentId, ref));
      return { ref, agentId };
    },

    /** Whether this agent holds the tool. */
    isAllowed(agentId: string): boolean {
      if (server === null || tool === null) return false;
      return grants.has(grantKey(agentId, `${server.id}/${tool.name}`));
    },

    /**
     * What one agent is offered: the tool with its stable model name, or
     * nothing when the allowlist has no row for it.
     */
    listForAgent(agentId: string): {
      ref: string;
      toolName: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }[] {
      if (server === null || tool === null) return [];
      const ref = `${server.id}/${tool.name}`;
      if (!grants.has(grantKey(agentId, ref))) return [];
      return [
        {
          ref,
          toolName: ws10ToolNameFor(ref),
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
      ];
    },

    /**
     * Call the tool on one agent's behalf: allowlist first, then the transport.
     *
     * Decide, record, then act — the grant is checked before anything reaches
     * the transport, so a tool the agent was never given never touches the
     * network. The refusal is audited before the throw, because every way out
     * of that branch is the throw and a row written after it is never written.
     */
    async execute(input: {
      ref: string;
      args: Record<string, unknown>;
      agentId: string;
      actorId: string;
    }): Promise<McpCallResult> {
      if (server === null || tool === null) {
        throw new Ws10RefusedError(
          "There is no tool to call until the server is registered and its tool exposed.",
        );
      }
      const expected = `${server.id}/${tool.name}`;
      if (input.ref !== expected) {
        throw new Ws10RefusedError(`${input.ref} is not a tool.`);
      }
      const actor =
        input.actorId.trim() === "" ? "unattributed" : input.actorId;
      if (!grants.has(grantKey(input.agentId, expected))) {
        const reason = `This Bot has not been given the tool ${expected}.`;
        audit({
          eventType: "mcp.call_rejected",
          targetType: "mcp_tool",
          targetId: expected,
          payload: {
            actor,
            bot: input.agentId,
            server: server.id,
            tool: tool.name,
            refusal: "not_granted",
            reason,
          },
        });
        throw new Ws10RefusedError(reason);
      }
      if (transport === null) {
        throw new Ws10RefusedError(
          "No transport is installed, so the tool cannot be reached.",
        );
      }
      const result = await transport.callTool(server, tool.name, input.args);
      audit({
        eventType: "mcp.call",
        targetType: "mcp_tool",
        targetId: expected,
        payload: {
          actor,
          bot: input.agentId,
          server: server.id,
          tool: tool.name,
          isError: result.isError,
        },
      });
      return result;
    },
  };
}

export type Ws10Slice = ReturnType<typeof createWs10Slice>;
