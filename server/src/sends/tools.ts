/**
 * Send actions for Bots: audited, approval-gated email and Slack, as ordinary Bot tools.
 *
 * This follows the same shape as every other outbound surface in this deployment: the grant is the
 * presence of the transport (a Bot gets the email tool only where SES is configured, the Slack tool
 * only where a webhook is stored), the policy is the approvals gateway this deployment already runs
 * for MCP writes, and every send is decided before it happens and audited after.
 *
 * THE APPROVAL TIER IS THE RECIPIENT. The candidate's `scope` is the email's recipient domain (or
 * the Slack webhook's credential key), so "always allow mail to our own domain, ask before anything
 * leaves it" is a personal approval rule the person writes once — `send/email` on
 * `example.com`, behaviour allow — and the gateway enforces it from then on. Without such a rule the
 * candidate is an ordinary write: the person's ask-before-changes setting, auto-review and the team
 * rules all apply exactly as they do to any other write, and the default is a waiting approval row.
 *
 * THE CAP COMES BEFORE THE GATE, and that order is not cosmetic: a person whose Bots have spent
 * today's allowance should not be shown an approval dialog for a send that cannot happen. The cap
 * is per person per day across every Bot, counted from the `bot_sends` ledger, so restarts and
 * replicas inherit it. Refused sends are audited — a refusal is one of the events an investigation
 * reaches for.
 *
 * Identities come from the run, never from model arguments: the person and the Bot are bound when
 * the tools are built, exactly as `../responsibilities/tools.ts` does.
 */
import { z } from "zod";
import type { ApprovalGate } from "../approvals/types";
import {
  ApprovalRefusedError,
  currentApprovalContext,
} from "../approvals/types";
import {
  type AuditEventType,
  type AuditInitiator,
  type AuditStore,
  recordAuditEvent,
} from "../audit";
import { HeadlessToolSuspension } from "../computer/headless-tools";
import type { GrantedTool } from "../plugins/tools";
import { REFUSAL_MARKER } from "../plugins/tools";
import { EmailSendError, type EmailSender, parseRecipient } from "./email";
import { SlackSendError, type SlackSender } from "./slack";
import type { SendsStore } from "./store";

/** Sends per person per day, per kind, before a deployment tunes the caps. */
export const DEFAULT_SEND_DAILY_CAP = 25;

export function sendDailyCapFromEnv(
  env: Record<string, string | undefined>,
  name: string,
): number {
  const raw = env[name]?.trim();
  if (!raw) return DEFAULT_SEND_DAILY_CAP;
  const parsed = z.coerce.number().int().min(0).safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SEND_DAILY_CAP;
}

export type SendToolsOptions = {
  store: SendsStore;
  /** Approval gateway; the same instance every governed tool in this deployment is judged by. */
  approvalGate: ApprovalGate;
  auditStore: AuditStore;
  ownerUserId: string;
  agentId: string;
  initiator?: AuditInitiator;
  email?: EmailSender;
  slack?: SlackSender;
  caps: { email: number; slack: number };
  now?: () => Date;
};

/** The audit vocabulary for sends. Failures and refusals land on `send.refused` with a reason. */
const SEND_EVENT: AuditEventType = "send.succeeded";
const SEND_REFUSED: AuditEventType = "send.refused";

const emailSchema = z
  .object({
    to: z.string().trim().min(3).max(320),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();

const slackSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

/**
 * The two send tools, or however many of them this deployment can actually perform. A tool whose
 * transport is not configured is worse than absent: a model that reaches for it collects a refusal
 * on every turn.
 */
export function sendTools(options: SendToolsOptions): GrantedTool[] {
  const {
    store,
    approvalGate,
    auditStore,
    ownerUserId,
    agentId,
    initiator,
    email,
    slack,
    caps,
  } = options;
  const now = options.now ?? (() => new Date());

  async function underCap(kind: "email" | "slack"): Promise<string | null> {
    const sent = await store.countToday(ownerUserId, kind, now());
    return sent >= caps[kind]
      ? `This person's Bots have already sent ${sent} ${kind} messages today, at the deployment's cap of ${caps[kind]}. The message was not sent.`
      : null;
  }

  async function audit(
    eventType: AuditEventType,
    payload: Record<string, unknown>,
  ) {
    try {
      await recordAuditEvent(auditStore, {
        eventType,
        targetType: "send",
        targetId: agentId,
        actorUserId: ownerUserId,
        ...(initiator ? { initiator } : {}),
        payload,
      });
    } catch (error) {
      // The audit trail is not allowed to become the thing that breaks a send that was already
      // approved; a failed audit write is loud in the process log instead.
      console.error(
        JSON.stringify({
          type: "send-audit-write-failed",
          eventType,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  /**
   * How a throw from the governed path becomes the model's answer, in the same vocabulary
   * `../plugins/tools.ts` uses: a pause propagates so the run can wait for the person; the
   * gateway's own refusals (a declined action, a policy denial) read as refusals; anything else
   * is a failure to send, which is a different fact about the world.
   */
  function sendFailure(error: unknown, fallback: string): string {
    if (error instanceof ApprovalRefusedError)
      return `${REFUSAL_MARKER} ${error.message}`;
    if (error instanceof EmailSendError || error instanceof SlackSendError)
      return `${REFUSAL_MARKER} ${error.message}`;
    return `${REFUSAL_MARKER} ${fallback}`;
  }

  const tools: GrantedTool[] = [];

  if (email) {
    tools.push({
      name: "send_email",
      ref: "send/email",
      description:
        "Send one plain-text email from this deployment's own address as a message on the person's behalf. The recipient's approval rules apply: without a rule allowing the recipient's domain, this waits for their approval.",
      parameters: emailSchema,
      async execute(args) {
        const parsed = emailSchema.safeParse(args);
        if (!parsed.success)
          return `${REFUSAL_MARKER} ${parsed.error.issues[0]?.message ?? "Invalid arguments."}`;
        const { to, subject, body } = parsed.data;
        const recipient = parseRecipient(to);
        if (!recipient)
          return `${REFUSAL_MARKER} "${to}" is not an email address. Nothing was sent.`;
        const cap = await underCap("email");
        if (cap) {
          await audit(SEND_REFUSED, {
            actor: ownerUserId,
            bot: agentId,
            kind: "email",
            target: recipient,
            refusal: "rate_limited",
          });
          return `${REFUSAL_MARKER} ${cap}`;
        }
        try {
          // The gateway decides: a matching personal allow-rule proceeds, anything else opens a
          // request and this suspension pauses the run until the person answers.
          const approval = await approvalGate({
            actorId: ownerUserId,
            botId: agentId,
            toolRef: "send/email",
            effect: "write",
            // The recipient domain, so a pre-approval is about WHO may be mailed.
            scope: recipient.split("@")[1] ?? recipient,
            args: { to: recipient, subject, body },
            target: { kind: "email", to: recipient, from: email.config.from },
            continuation: currentApprovalContext(),
          });
          if (approval && "replay" in approval)
            return `Already handled by the person: ${JSON.stringify(approval.replay)}`;
          const result = await email.send({
            to: recipient,
            subject,
            body,
          });
          await store.record({
            ownerUserId,
            agentId,
            kind: "email",
            target: recipient,
            providerId: result.id,
          });
          await audit(SEND_EVENT, {
            actor: ownerUserId,
            bot: agentId,
            kind: "email",
            target: recipient,
            // What was sent, named for the trail. The body never is: the trail records that a
            // message went out and what it was about, not a second copy of the message.
            subject: subject.slice(0, 200),
            providerId: result.id,
          });
          return JSON.stringify({ sent: true, to: recipient });
        } catch (error) {
          // A waiting approval is not a failure: the run pauses and the answer comes back as this
          // tool's result when the person decides. Everything recorded below is a real refusal.
          if (error instanceof HeadlessToolSuspension) throw error;
          await audit(SEND_REFUSED, {
            actor: ownerUserId,
            bot: agentId,
            kind: "email",
            target: recipient,
            refusal:
              error instanceof ApprovalRefusedError
                ? "policy"
                : "provider_error",
            failure: sendFailure(error, "The email could not be sent.").slice(
              0,
              400,
            ),
          });
          return sendFailure(error, "The email could not be sent.");
        }
      },
    });
  }

  if (slack) {
    tools.push({
      name: "send_slack_message",
      ref: "send/slack",
      description:
        "Post one message to this deployment's Slack through its stored incoming webhook. Without a rule allowing Slack sends, this waits for the person's approval.",
      parameters: slackSchema,
      async execute(args) {
        const parsed = slackSchema.safeParse(args);
        if (!parsed.success)
          return `${REFUSAL_MARKER} ${parsed.error.issues[0]?.message ?? "Invalid arguments."}`;
        const cap = await underCap("slack");
        if (cap) {
          await audit(SEND_REFUSED, {
            actor: ownerUserId,
            bot: agentId,
            kind: "slack",
            refusal: "rate_limited",
          });
          return `${REFUSAL_MARKER} ${cap}`;
        }
        try {
          const approval = await approvalGate({
            actorId: ownerUserId,
            botId: agentId,
            toolRef: "send/slack",
            effect: "write",
            scope: "slack-webhook",
            args: parsed.data,
            target: { kind: "slack", webhook: "slack-webhook" },
            continuation: currentApprovalContext(),
          });
          if (approval && "replay" in approval)
            return `Already handled by the person: ${JSON.stringify(approval.replay)}`;
          const result = await slack.send(parsed.data);
          await store.record({
            ownerUserId,
            agentId,
            kind: "slack",
            target: "slack-webhook",
            providerId: result.id,
          });
          await audit(SEND_EVENT, {
            actor: ownerUserId,
            bot: agentId,
            kind: "slack",
            target: "slack-webhook",
            providerId: result.id,
          });
          return JSON.stringify({ sent: true });
        } catch (error) {
          if (error instanceof HeadlessToolSuspension) throw error;
          await audit(SEND_REFUSED, {
            actor: ownerUserId,
            bot: agentId,
            kind: "slack",
            refusal:
              error instanceof ApprovalRefusedError
                ? "policy"
                : "provider_error",
            failure: sendFailure(
              error,
              "The Slack message could not be posted.",
            ).slice(0, 400),
          });
          return sendFailure(error, "The Slack message could not be posted.");
        }
      },
    });
  }

  return tools;
}
