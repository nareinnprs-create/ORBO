import { expect, spyOn, test } from "bun:test";
import {
  type OrboMcpApproval,
  type ActionProposal,
  MCP_APPROVAL_TTL_MS,
  actionProposalToCandidate,
  approvalKindOf,
  assertProposalUnchanged,
  defaultMcpRequiresApproval,
  isMcpApprovalExpired,
  isProposalExpired,
  mapActionProposalStatus,
  mcpApprovalToCandidate,
  mcpReceiptKey,
  proposalDigest,
} from "../src/approvals/interop";
import { decideAction } from "../src/approvals/policy";
import {
  DECLINED_BY_PERSON,
  createApprovalService,
} from "../src/approvals/service";
import {
  type ApprovalAction,
  type ApprovalPolicyOutcome,
  type ApprovalPreferences,
  type ApprovalRecord,
  type ApprovalRule,
  type ApprovalStore,
  type ApprovalTeamRule,
  type ApprovalTeamSettings,
  ApprovalNotFoundError,
  ApprovalRefusedError,
  approvalAction,
} from "../src/approvals/types";

/**
 * WS-06 slice 1: one approval request → approve-and-run card → receipt, with a
 * decline that persists until the person speaks again — proven here for the
 * ORBO behavior plus one representative mapped case each for the legacy
 * `ActionProposal` and `mcp_approvals` shapes (08 §4).
 *
 * In-memory fakes only: no live database (Docker is down) and no leaking
 * `mock.module` — spies are restored with `mockRestore`.
 */

const userMessage = (id: string, content: string) => ({
  id,
  role: "user" as const,
  content,
});

const threadContext = (over: Record<string, unknown> = {}) => ({
  runId: "run-1",
  threadId: "thread-1",
  toolCallId: "call-1",
  toolName: "computer_click",
  args: { ref: "e1" },
  messages: [userMessage("u1", "Do the thing")],
  state: {},
  context: [],
  forwardedProps: {},
  ...over,
});

/** In-memory store with the policy surface, single-writer result semantics. */
function memoryStore(options: {
  preferences?: Partial<ApprovalPreferences>;
  team?: Partial<ApprovalTeamSettings>;
  teamRules?: ApprovalTeamRule[];
  rules?: ApprovalRule[];
}) {
  const requests = new Map<string, ApprovalRecord>();
  const decisions: ApprovalPolicyOutcome[] = [];
  let enabled = options.preferences?.enabled ?? false;
  const required = (owner: string, id: string) => {
    const row = requests.get(id);
    if (!row || row.ownerUserId !== owner) throw new ApprovalNotFoundError();
    return row;
  };
  const store: ApprovalStore = {
    enabled: async () => enabled,
    setEnabled: async (_owner, value) => {
      enabled = value;
    },
    open: async (action: ApprovalAction) => {
      const prior = [...requests.values()].find(
        (row) =>
          row.ownerUserId === action.actorId &&
          row.action.runId === action.runId &&
          row.action.toolCallId === action.toolCallId,
      );
      if (prior) {
        if (prior.action.actionDigest !== action.actionDigest)
          throw new ApprovalRefusedError("The approved action has changed.");
        return structuredClone(prior);
      }
      const row: ApprovalRecord = {
        id: `request-${requests.size + 1}`,
        ownerUserId: action.actorId,
        action: structuredClone(action),
        status: "pending",
        decision: null,
        result: null,
        createdAt: new Date(),
        decidedAt: null,
        consumedAt: null,
        completedAt: null,
      };
      requests.set(row.id, row);
      return structuredClone(row);
    },
    get: async (owner, id) => structuredClone(required(owner, id)),
    list: async (owner) =>
      [...requests.values()]
        .filter((row) => row.ownerUserId === owner)
        .map((row) => structuredClone(row)),
    decide: async (owner, id, decision) => {
      const row = required(owner, id);
      if (row.status !== "pending")
        throw new ApprovalRefusedError("This request was already decided.");
      const handOff = row.action.policy?.behaviour === "hand_off";
      if (handOff && decision !== "handled" && decision !== "deny")
        throw new ApprovalRefusedError("handed to you");
      row.decision = decision;
      row.status = decision === "deny" ? "denied" : "approved";
      row.decidedAt = new Date();
      return structuredClone(row);
    },
    consume: async (owner, id, digest) => {
      const row = required(owner, id);
      if (row.action.actionDigest !== digest)
        throw new ApprovalRefusedError("The approved action has changed.");
      if (row.status !== "approved") return false;
      row.status = "consumed";
      row.consumedAt = new Date();
      return true;
    },
    saveResult: async (owner, id, result) => {
      const row = required(owner, id);
      if (row.result) return false;
      row.result = result;
      return true;
    },
    finish: async (owner, id) => {
      const row = required(owner, id);
      row.status = "completed";
      row.completedAt = new Date();
    },
    rules: async (owner) =>
      structuredClone(
        (options.rules ?? []).filter(
          (rule) => rule.ownerUserId === owner && !rule.revokedAt,
        ),
      ),
    revoke: async () => undefined,
    policy: {
      preferences: async () => ({
        enabled: false,
        autoReview: false,
        hostCommands: "ask",
        ...options.preferences,
      }),
      setPreferences: async () => {
        throw new Error("unused");
      },
      teamSettings: async () => ({
        enforceAutoReview: false,
        customRulesEnabled: true,
        hostCommandsCap: "allow",
        ...options.team,
      }),
      setTeamSettings: async () => {
        throw new Error("unused");
      },
      teamRules: async () => options.teamRules ?? [],
      createRule: async () => {
        throw new Error("unused");
      },
      createTeamRule: async () => {
        throw new Error("unused");
      },
      revokeTeamRule: async () => undefined,
      updateRule: async () => {
        throw new Error("unused");
      },
      updateTeamRule: async () => {
        throw new Error("unused");
      },
      findEquivalent: async ({
        ownerUserId,
        threadId,
        equivalence,
        excludeToolCallId,
      }) =>
        [...requests.values()]
          .reverse()
          .find(
            (row) =>
              row.ownerUserId === ownerUserId &&
              row.action.threadId === threadId &&
              row.action.equivalence === equivalence &&
              row.action.toolCallId !== excludeToolCallId,
          ),
      withdrawPending: async () => [],
      recordDecision: async ({ outcome }) => {
        decisions.push(outcome);
      },
    },
  };
  return { store, requests, decisions };
}

test("slice 1: one approval request → approve-and-run card → receipt, executed once", async () => {
  const { store } = memoryStore({ preferences: { enabled: true } });
  const service = createApprovalService(store);
  const candidate = {
    actorId: "owner",
    botId: "bot",
    toolRef: "computer_click",
    effect: "write",
    scope: "example.com",
    args: { ref: "e1", apiToken: "abc-secret" },
    target: { ref: "e1" },
    continuation: threadContext(),
  };
  await expect(service.gate(candidate)).rejects.toMatchObject({
    name: "HeadlessToolSuspension",
  });
  // The approve-and-run card: one pending request, sanitized, no continuation.
  const inbox = await service.inbox("owner");
  expect(inbox.requests).toHaveLength(1);
  expect(inbox.requests[0]).toMatchObject({ status: "pending" });
  const card = JSON.stringify(inbox.requests[0]);
  expect(card).toContain("e1");
  expect(card).not.toContain("abc-secret");
  expect(card).not.toContain("continuation");
  const [row] = await store.list("owner");
  if (!row) throw new Error("missing request");
  await service.decide("owner", row.id, "allow_once");
  const runner = {
    run: async (_action: ApprovalAction) => "clicked",
  };
  const execute = spyOn(runner, "run");
  try {
    const continued: unknown[] = [];
    const dependencies = {
      validate: async (action: ApprovalAction) => action,
      execute: (action: ApprovalAction) => execute(action),
      continue: async (input: unknown) => {
        continued.push(input);
      },
    };
    // Two replicas pick up the approved request: one run, one receipt.
    await Promise.all([
      service.resume("owner", row.id, dependencies),
      service.resume("owner", row.id, dependencies),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(continued).toHaveLength(1);
    expect(continued[0]).toMatchObject({
      continuation: { runId: "run-1", threadId: "thread-1" },
      result: { content: "clicked" },
    });
    expect((await store.get("owner", row.id)).status).toBe("completed");
  } finally {
    execute.mockRestore();
  }
});

test("a decline persists until the person speaks again", async () => {
  const { store, decisions } = memoryStore({
    preferences: { enabled: true },
  });
  const service = createApprovalService(store);
  const base = {
    actorId: "owner",
    botId: "bot",
    toolRef: "computer_click",
    effect: "write",
    scope: "example.com",
    args: { ref: "e1" },
    target: { ref: "e1" },
  };
  await expect(
    service.gate({
      ...base,
      continuation: threadContext({ toolCallId: "call-1" }),
    }),
  ).rejects.toMatchObject({ name: "HeadlessToolSuspension" });
  const [denied] = await store.list("owner");
  if (!denied) throw new Error("missing request");
  await service.decide("owner", denied.id, "deny");
  // Same conversation, person silent: the equivalent retry is refused and no
  // second request is opened.
  await expect(
    service.gate({
      ...base,
      continuation: threadContext({ runId: "run-2", toolCallId: "call-2" }),
    }),
  ).rejects.toThrow("declined");
  expect(await store.list("owner")).toHaveLength(1);
  expect(decisions).toContainEqual(
    expect.objectContaining({ source: "person_declined" }),
  );
  // The person speaks: the same action asks again.
  await expect(
    service.gate({
      ...base,
      continuation: threadContext({
        runId: "run-3",
        toolCallId: "call-3",
        messages: [
          userMessage("u1", "Do the thing"),
          userMessage("u2", "Yes, do it now"),
        ],
      }),
    }),
  ).rejects.toMatchObject({ name: "HeadlessToolSuspension" });
  expect(await store.list("owner")).toHaveLength(2);
  expect(DECLINED_BY_PERSON).toContain("declined");
});

const museProposal = (over: Partial<ActionProposal> = {}): ActionProposal => ({
  id: "proposal-1",
  kind: "email.send",
  data: { to: "sam@example.com", subject: "Notes", body: "Hello" },
  connectionId: "google-1",
  account: "owner@example.com",
  hash: "",
  status: "awaiting_review",
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  ...over,
});

test("Legacy ActionProposal: status vocabulary collapses, hash re-check refuses change", () => {
  expect(mapActionProposalStatus("awaiting_review")).toEqual({
    status: "pending",
    decision: null,
  });
  expect(mapActionProposalStatus("executing")).toEqual({
    status: "consumed",
    decision: "allow_once",
  });
  for (const status of ["succeeded", "failed", "outcome_unknown"] as const)
    expect(mapActionProposalStatus(status)).toEqual({
      status: "completed",
      decision: "allow_once",
    });
  for (const status of ["denied", "cancelled", "expired"] as const)
    expect(mapActionProposalStatus(status)).toEqual({
      status: "denied",
      decision: "deny",
    });
  const proposal = museProposal();
  proposal.hash = proposalDigest(proposal);
  expect(isProposalExpired(proposal)).toBe(false);
  assertProposalUnchanged(proposal, proposal.hash);
  expect(() =>
    assertProposalUnchanged(
      museProposal({ data: { ...proposal.data, body: "Changed" } }),
      proposal.hash,
    ),
  ).toThrow("changed");
  expect(
    isProposalExpired(
      museProposal({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    ),
  ).toBe(true);
});

test("Legacy action proposal: email.send proposal approves and runs exactly once", async () => {
  const proposal = museProposal();
  proposal.hash = proposalDigest(proposal);
  const { store } = memoryStore({ preferences: { enabled: true } });
  const service = createApprovalService(store);
  const candidate = actionProposalToCandidate("owner", proposal, {
    botId: "bot",
    continuation: threadContext({
      toolCallId: "muse-call-1",
      toolName: "email_send",
      args: proposal.data,
    }),
  });
  expect(approvalKindOf(candidate.toolRef)).toBe("action");
  await expect(service.gate(candidate)).rejects.toMatchObject({
    name: "HeadlessToolSuspension",
  });
  expect((await service.inbox("owner")).requests).toHaveLength(1);
  const [row] = await store.list("owner");
  if (!row) throw new Error("missing request");
  await service.decide("owner", row.id, "allow_once");
  const runner = {
    run: async (_action: ApprovalAction) => "sent",
  };
  const execute = spyOn(runner, "run");
  try {
    const continued: unknown[] = [];
    const dependencies = {
      validate: async (action: ApprovalAction) => action,
      execute: (action: ApprovalAction) => execute(action),
      continue: async (input: unknown) => {
        continued.push(input);
      },
    };
    await Promise.all([
      service.resume("owner", row.id, dependencies),
      service.resume("owner", row.id, dependencies),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(continued).toHaveLength(1);
    expect(continued[0]).toMatchObject({ result: { content: "sent" } });
  } finally {
    execute.mockRestore();
  }
});

const dotsApproval = (
  over: Partial<OrboMcpApproval> = {},
): OrboMcpApproval => ({
  id: "approval-1",
  threadId: "thread-1",
  dotId: "bot",
  connectionId: "conn-gmail",
  tool: "gmail/send",
  arguments: { to: "a@example.test" },
  createdAt: Date.now(),
  ...over,
});

const askRule = (toolRef: string): ApprovalRule => ({
  id: `rule-${toolRef}`,
  ownerUserId: "owner",
  botId: "*",
  toolRef,
  effect: "*",
  scope: "*",
  behaviour: "ask",
  revokedAt: null,
  createdAt: new Date(),
});

test("Legacy mcp approval: per-call binding, TTL, and per-tool defaults", async () => {
  const approval = dotsApproval();
  expect(isMcpApprovalExpired(approval)).toBe(false);
  expect(
    isMcpApprovalExpired(
      dotsApproval({ createdAt: Date.now() - MCP_APPROVAL_TTL_MS - 1 }),
    ),
  ).toBe(true);
  expect(defaultMcpRequiresApproval({ readOnly: true })).toBe(false);
  expect(defaultMcpRequiresApproval({ readOnly: false })).toBe(true);
  expect(
    defaultMcpRequiresApproval({ readOnly: true, requiresApproval: true }),
  ).toBe(true);
  // Mapped onto the rule engine, not a second mechanism: an ask rule on the
  // mapped ref suspends the exact per-call candidate.
  const outcome = await decideAction({
    candidate: mcpApprovalToCandidate("owner", approval),
    team: [],
    personal: [askRule("mcp/*")],
    customRulesEnabled: true,
    autoReview: false,
    askBeforeChanges: false,
  });
  expect(outcome).toMatchObject({ behaviour: "ask", source: "personal_rule" });
});

test("Legacy mcp representative: approved call runs once; tampered arguments never run", async () => {
  const { store } = memoryStore({ preferences: { enabled: true } });
  const service = createApprovalService(store);
  const continuationFor = (toolCallId: string, runId: string) =>
    threadContext({
      runId,
      toolCallId,
      toolName: "request_connection_action",
      args: { to: "a@example.test" },
    });
  const candidateFor = (toolCallId: string, runId: string) => {
    const candidate = mcpApprovalToCandidate("owner", dotsApproval(), {
      continuation: continuationFor(toolCallId, runId),
    });
    expect(approvalKindOf(candidate.toolRef)).toBe("mcp");
    return candidate;
  };
  // First request: approved, but the re-check sees changed arguments.
  await expect(
    service.gate(candidateFor("dots-call-1", "run-1")),
  ).rejects.toMatchObject({ name: "HeadlessToolSuspension" });
  const [first] = await store.list("owner");
  if (!first) throw new Error("missing request");
  expect(mcpReceiptKey(first.action.threadId, first.action.toolCallId)).toBe(
    mcpReceiptKey("thread-1", "dots-call-1"),
  );
  await service.decide("owner", first.id, "allow_once");
  const runner = {
    run: async (_action: ApprovalAction) => "delivered",
  };
  const execute = spyOn(runner, "run");
  try {
    const refused: { result: { error?: string } }[] = [];
    await service.resume("owner", first.id, {
      validate: async () =>
        approvalAction({
          ...candidateFor("dots-call-1", "run-1"),
          args: { to: "evil@example.test" },
        }),
      execute: (action: ApprovalAction) => execute(action),
      continue: async (input: { result: { error?: string } }) => {
        refused.push(input);
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(refused).toHaveLength(1);
    expect(refused[0]?.result.error).toContain("changed");
    // Second request, same exact call: concurrent resumes execute once.
    await expect(
      service.gate(candidateFor("dots-call-2", "run-2")),
    ).rejects.toMatchObject({ name: "HeadlessToolSuspension" });
    const second = (await store.list("owner")).find(
      (row) => row.action.toolCallId === "dots-call-2",
    );
    if (!second) throw new Error("missing second request");
    await service.decide("owner", second.id, "allow_once");
    const continued: unknown[] = [];
    const dependencies = {
      validate: async (action: ApprovalAction) => action,
      execute: (action: ApprovalAction) => execute(action),
      continue: async (input: unknown) => {
        continued.push(input);
      },
    };
    await Promise.all([
      service.resume("owner", second.id, dependencies),
      service.resume("owner", second.id, dependencies),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(continued).toHaveLength(1);
    expect(continued[0]).toMatchObject({
      result: { content: "delivered" },
    });
  } finally {
    execute.mockRestore();
  }
});
