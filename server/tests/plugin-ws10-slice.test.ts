import { describe, expect, test } from "bun:test";
import type { McpCallResult } from "../src/plugins/mcp";
import {
  createWs10Slice,
  Ws10RefusedError,
  ws10RefFromToolName,
  ws10ToolNameFor,
  type Ws10Transport,
} from "../src/plugins/ws10-slice";

/**
 * WS-10 first slice (09 §4): one MCP server + one tool + per-agent allowlist.
 *
 * No network and no database: the transport is a recording stub installed by
 * injection (the established `useComposioClient` / `useRoutineTools` seam
 * shape), and the registry is per-test so nothing leaks between files under
 * Bun's single-process run. Composio brokering is deferred to slice 2 and
 * appears here only as the thing nothing imports.
 */

const SERVER = { id: "ws10demo", url: "https://mcp.ws10demo.example/mcp" };
const TOOL = {
  name: "lookup",
  description: "Look one record up by id.",
  inputSchema: { type: "object", properties: { id: { type: "string" } } },
};
const REF = `${SERVER.id}/${TOOL.name}`;

function recording(
  answer: McpCallResult = {
    text: "record-7",
    isError: false,
    truncated: false,
  },
): { transport: Ws10Transport; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    transport: {
      listTools: async () => [{ ...TOOL }],
      callTool: async (server, toolName, args) => {
        // Snapshotted rather than held by reference, so a transport that kept
        // the object and edited it later would not rewrite what was recorded.
        calls.push({
          server: { ...server },
          toolName,
          args: structuredClone(args),
        });
        return answer;
      },
    },
  };
}

function ready(options: { agentId?: string } = {}) {
  const slice = createWs10Slice({ transport: recording().transport });
  slice.registerServer(SERVER.id, SERVER.url);
  slice.exposeTool({ ...TOOL });
  if (options.agentId) slice.grant(options.agentId);
  return slice;
}

describe("registering the slice's one MCP server", () => {
  test("an https server registers", () => {
    const slice = createWs10Slice();
    expect(slice.registerServer(SERVER.id, SERVER.url)).toEqual(SERVER);
  });

  test("plaintext is refused and never registers", () => {
    const slice = createWs10Slice();
    expect(() =>
      slice.registerServer(SERVER.id, "http://mcp.example/mcp"),
    ).toThrow(/https/);
    // Still empty afterwards: the refused registration left nothing behind.
    expect(slice.registerServer(SERVER.id, SERVER.url)).toEqual(SERVER);
  });

  test("a second server is refused: this slice is one server", () => {
    const slice = ready();
    expect(() =>
      slice.registerServer("another", "https://mcp.other.example/mcp"),
    ).toThrow(Ws10RefusedError);
  });

  test("a tool cannot be exposed before its server", () => {
    const slice = createWs10Slice({ transport: recording().transport });
    expect(() => slice.exposeTool({ ...TOOL })).toThrow(/server/i);
  });

  test("a second tool is refused: this slice is one tool", () => {
    const slice = ready();
    expect(() => slice.exposeTool({ ...TOOL, name: "other" })).toThrow(
      Ws10RefusedError,
    );
  });
});

describe("the tool name the model is offered", () => {
  test("the ref maps to one stable model name and back", () => {
    // Pinned literally rather than against the function under test on both
    // sides: an assertion importing the mapping it is about cannot fail when
    // that mapping moves, because both sides move together.
    expect(ws10ToolNameFor(REF)).toBe("mcp__ws10demo__lookup");
    expect(ws10RefFromToolName("mcp__ws10demo__lookup")).toBe(REF);
  });

  test("anything the slice did not offer maps to nothing", () => {
    expect(ws10RefFromToolName("lookup")).toBeNull();
    expect(ws10RefFromToolName("mcp__noserver")).toBeNull();
    expect(ws10RefFromToolName("")).toBeNull();
  });

  test("the granted agent is offered the tool under its stable name", () => {
    const slice = ready({ agentId: "agent-allowed" });
    expect(slice.listForAgent("agent-allowed")).toEqual([
      {
        ref: REF,
        toolName: "mcp__ws10demo__lookup",
        description: TOOL.description,
        inputSchema: TOOL.inputSchema,
      },
    ]);
  });

  test("the unlisted agent is offered nothing", () => {
    const slice = ready({ agentId: "agent-allowed" });
    expect(slice.listForAgent("agent-stranger")).toEqual([]);
  });
});

describe("the per-agent allowlist", () => {
  test("the allowed agent executes through the transport", async () => {
    const { transport, calls } = recording();
    const slice = createWs10Slice({ transport });
    slice.registerServer(SERVER.id, SERVER.url);
    slice.exposeTool({ ...TOOL });
    slice.grant("agent-allowed");

    const result = await slice.execute({
      ref: REF,
      args: { id: "record-7" },
      agentId: "agent-allowed",
      actorId: "user-1",
    });

    expect(result).toEqual({
      text: "record-7",
      isError: false,
      truncated: false,
    });
    expect(calls).toEqual([
      {
        server: SERVER,
        toolName: "lookup",
        args: { id: "record-7" },
      },
    ]);
  });

  test("the unlisted agent is refused, audited, and never reaches the transport", async () => {
    const { transport, calls } = recording();
    const slice = createWs10Slice({ transport });
    slice.registerServer(SERVER.id, SERVER.url);
    slice.exposeTool({ ...TOOL });
    slice.grant("agent-allowed");

    const refused = slice.execute({
      ref: REF,
      args: { id: "record-7" },
      agentId: "agent-stranger",
      actorId: "user-1",
    });

    await expect(refused).rejects.toBeInstanceOf(Ws10RefusedError);
    await expect(refused).rejects.toThrow(
      `This Bot has not been given the tool ${REF}.`,
    );
    // The grant is checked before anything reaches the transport.
    expect(calls).toEqual([]);
    // And the refusal is in the trail before the throw, naming the rule.
    expect(slice.auditTrail).toEqual([
      {
        eventType: "mcp.call_rejected",
        targetType: "mcp_tool",
        targetId: REF,
        payload: {
          actor: "user-1",
          bot: "agent-stranger",
          server: SERVER.id,
          tool: TOOL.name,
          refusal: "not_granted",
          reason: `This Bot has not been given the tool ${REF}.`,
        },
      },
    ]);
  });

  test("a successful call is audited too", async () => {
    const slice = ready({ agentId: "agent-allowed" });
    await slice.execute({
      ref: REF,
      args: { id: "record-7" },
      agentId: "agent-allowed",
      actorId: "user-1",
    });

    expect(slice.auditTrail).toEqual([
      {
        eventType: "mcp.call",
        targetType: "mcp_tool",
        targetId: REF,
        payload: {
          actor: "user-1",
          bot: "agent-allowed",
          server: SERVER.id,
          tool: TOOL.name,
          isError: false,
        },
      },
    ]);
  });

  test("a tool nobody exposed is not a tool, and reaches nobody", async () => {
    const { transport, calls } = recording();
    const slice = createWs10Slice({ transport });
    slice.registerServer(SERVER.id, SERVER.url);
    slice.exposeTool({ ...TOOL });
    slice.grant("agent-allowed");

    await expect(
      slice.execute({
        ref: "ws10demo/invented-by-a-model",
        args: {},
        agentId: "agent-allowed",
        actorId: "user-1",
      }),
    ).rejects.toThrow("is not a tool.");
    expect(calls).toEqual([]);
    // A name the server never advertised is refused without an audit row
    // claiming a grant decision about it: there is no tool to decide on.
    expect(slice.auditTrail).toEqual([]);
  });
});
