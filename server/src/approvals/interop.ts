import { createHash } from "node:crypto";
import {
  ApprovalRefusedError,
  type ApprovalCandidate,
  type ApprovalContinuation,
  type ApprovalDecision,
  type ApprovalRecord,
} from "./types";

/**
 * WS-06 slice 1 — upstream approval shapes mapped onto the ORBO gate, not ported.
 *
 * Per 08 §4 the superset starts as a mapping: the ORBO rule engine + inbox +
 * approve-and-run resume path in `service.ts` stays canonical, and the legacy
 * `ActionProposal` and legacy `mcp_approvals`/`mcp_actions` shapes below convert
 * to `ApprovalCandidate`s that pass through that same gate. One representative
 * case each is proven in `server/tests/approvals-interop.test.ts`.
 *
 * Deliberately not yet ported (later slices): widening `approval_requests` with
 * `approval_kind`/`connector_ref` columns (the kind is derived by
 * `approvalKindOf` instead — no schema change), a separate `approval_receipts`
 * table (the request `result` + `finish` is the receipt), and the
 * `/api/actions/:id/decide` + connection-approval adapters.
 *
 * Single-execution equivalence, so no second mechanism exists: the legacy
 * `claimAction` (INSERT OR IGNORE single-flight) is ORBO `consume`
 * (approved→consumed once) plus `saveResult` (first writer wins); the legacy
 * `executing`/`outcome_unknown` are ORBO's consume-once + unknown-outcome path
 * in `resume`; the legacy connection `fingerprint` invalidation is ORBO's
 * `validate` re-check before `execute`.
 */

/**
 * Which upstream family an approval belongs to, derived from the tool ref so no
 * schema change is needed for slice 1: `action/<kind>` (legacy action proposal),
 * `mcp/<tool>` (legacy per-call MCP approval), anything else (default tool call).
 */
export type ApprovalKind = "tool" | "mcp" | "action";

export function approvalKindOf(toolRef: string): ApprovalKind {
  if (toolRef.startsWith("action/")) return "action";
  if (toolRef.startsWith("mcp/")) return "mcp";
  return "tool";
}

/* Legacy `ActionProposal` (upstream domain + server actions). */

export const PROPOSAL_STATUSES = [
  "awaiting_review",
  "executing",
  "succeeded",
  "failed",
  "outcome_unknown",
  "denied",
  "cancelled",
  "expired",
] as const;

export type ActionProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type ActionProposal = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  connectionId?: string;
  account?: string;
  targetVersion?: string;
  hash: string;
  status: ActionProposalStatus;
  expiresAt: string;
};

export type ActionProposalMappedDecision = {
  status: ApprovalRecord["status"];
  decision: ApprovalDecision | null;
};

/**
 * Collapse the three status vocabularies without losing `expired` or
 * `outcome_unknown`: `executing` is consume-once, `outcome_unknown` completes
 * with an error result (the resume path saves "outcome is unknown" exactly like
 * the upstream recorder does), and `expired`/`cancelled` deny so the person re-asks —
 * an expired review is never executed.
 */
const PROPOSAL_STATUS_MAP: Record<
  ActionProposalStatus,
  ActionProposalMappedDecision
> = {
  awaiting_review: { status: "pending", decision: null },
  executing: { status: "consumed", decision: "allow_once" },
  succeeded: { status: "completed", decision: "allow_once" },
  failed: { status: "completed", decision: "allow_once" },
  outcome_unknown: { status: "completed", decision: "allow_once" },
  denied: { status: "denied", decision: "deny" },
  cancelled: { status: "denied", decision: "deny" },
  expired: { status: "denied", decision: "deny" },
};

export function mapActionProposalStatus(
  status: ActionProposalStatus,
): ActionProposalMappedDecision {
  return { ...PROPOSAL_STATUS_MAP[status] };
}

/** The 30-minute review window: an expired proposal maps to denied, never runs. */
export function isProposalExpired(
  proposal: Pick<ActionProposal, "expiresAt">,
  now: number = Date.now(),
): boolean {
  const expires = Date.parse(proposal.expiresAt);
  return Number.isNaN(expires) ? true : expires <= now;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  return value;
}

/**
 * The ORBO-side analogue of the proposal hash: once admitted, the gate's own
 * `actionDigest` carries the same guarantee, so this only pins the content at
 * the boundary. Never a secret: proposals carry mail/calendar drafts, and
 * `approvalPreview` still masks secret-looking values in the inbox.
 */
export function proposalDigest(
  proposal: Pick<
    ActionProposal,
    "kind" | "data" | "connectionId" | "targetVersion"
  >,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableJson({
          kind: proposal.kind,
          data: proposal.data,
          connectionId: proposal.connectionId ?? null,
          targetVersion: proposal.targetVersion ?? null,
        }),
      ),
    )
    .digest("hex");
}

/**
 * The 409-on-change re-check at the boundary: a proposal whose content no
 * longer matches its hash is refused before it ever reaches the gate.
 */
export function assertProposalUnchanged(
  proposal: Pick<
    ActionProposal,
    "hash" | "kind" | "data" | "connectionId" | "targetVersion"
  >,
  hash: string,
): void {
  if (proposal.hash !== hash || proposalDigest(proposal) !== hash)
    throw new ApprovalRefusedError(
      "This proposal changed. Open its latest review before deciding.",
    );
}

/**
 * Admit an `ActionProposal` as a per-call approval: the exact kind + draft +
 * connection it was reviewed for, so a changed draft is a different action and
 * the identity re-check before execution refuses it.
 */
export function actionProposalToCandidate(
  ownerUserId: string,
  proposal: ActionProposal,
  options: { botId?: string; continuation?: ApprovalContinuation } = {},
): ApprovalCandidate {
  return {
    actorId: ownerUserId,
    botId: options.botId ?? "orbo",
    toolRef: `action/${proposal.kind}`,
    effect: "write",
    scope: proposal.connectionId ?? proposal.account ?? "google",
    args: proposal.data,
    target: {
      ...(proposal.connectionId ? { connectionId: proposal.connectionId } : {}),
      ...(proposal.targetVersion
        ? { targetVersion: proposal.targetVersion }
        : {}),
    },
    ...(options.continuation ? { continuation: options.continuation } : {}),
  };
}

/* Legacy `mcp_approvals`/`mcp_actions` (upstream connection store). */

/** How long a per-call approval stays usable from its own conversation. */
export const MCP_APPROVAL_TTL_MS = 60 * 60 * 1000;

export type OrboMcpApproval = {
  id: string;
  threadId: string;
  dotId: string;
  connectionId: string;
  tool: string;
  arguments: Record<string, unknown>;
  /** Epoch milliseconds, as stored. */
  createdAt: number;
};

export function isMcpApprovalExpired(
  approval: Pick<OrboMcpApproval, "createdAt">,
  now: number = Date.now(),
  ttlMs: number = MCP_APPROVAL_TTL_MS,
): boolean {
  return now - approval.createdAt > ttlMs;
}

/**
 * Bind a gated call to its exact connection, tool, and arguments: the resumed
 * run executes this record's call and nothing supplied alongside the approval.
 * Arguments are normalized by never storing secrets — tokens stay vault-side.
 */
export function mcpApprovalToCandidate(
  ownerUserId: string,
  approval: OrboMcpApproval,
  options: { continuation?: ApprovalContinuation } = {},
): ApprovalCandidate {
  return {
    actorId: ownerUserId,
    botId: approval.dotId,
    toolRef: `mcp/${approval.tool}`,
    effect: "write",
    scope: approval.connectionId,
    args: approval.arguments,
    target: { connectionId: approval.connectionId, tool: approval.tool },
    ...(options.continuation ? { continuation: options.continuation } : {}),
  };
}

/**
 * The receipt key preserving `mcp_actions(thread_id, tool_call_id)`: a saved
 * result is returned only for the approval that produced it, and an
 * already-running key answers 409 instead of executing twice.
 */
export function mcpReceiptKey(threadId: string, toolCallId: string): string {
  return JSON.stringify([threadId, toolCallId]);
}

/**
 * Per-tool approval defaults: the server's read-only hint means no approval
 * unless the owner says otherwise — approval is the owner's call.
 */
export function defaultMcpRequiresApproval(tool: {
  readOnly: boolean;
  requiresApproval?: boolean;
}): boolean {
  return tool.requiresApproval ?? !tool.readOnly;
}
