/**
 * Slack sends for Bots, through a stored incoming webhook.
 *
 * WHY A WEBHOOK. Slack outbound already exists on this deployment for chat delivery, but it is the
 * OrboTag pairing: a bound person's bound channels, reached as that person's Bot. A Bot ACTION —
 * "post this to the team channel" — is a different thing: it posts where the webhook points, as
 * whatever identity created it, to people who may have no ORBO account at all. The Composio
 * adapter would be the other door, but this deployment's Composio surface is generic per-app
 * tooling and carries no Slack toolkit surface of its own, so the webhook is the minimal audited
 * path: one URL in the credential vault, one POST.
 *
 * THE WEBHOOK LIVES IN THE VAULT, never in the environment: an administrator stores it with
 * `POST /api/admin/credentials` (kind `connector`, provider `slack-webhook`), so rotation and
 * revocation are the vault's own audited acts and the URL is never in a config file or a log.
 * Reads happen per send, so a rotated webhook is used by the next send rather than after a restart.
 *
 * Fail closed on shape: anything that is not an https `hooks.slack.com/services/…` URL is refused
 * before the network, because a vault value is operator-supplied and a mistyped webhook must not
 * become a POST to somewhere else.
 */
import {
  type CredentialSecretReader,
  type CredentialStore,
  CredentialUnusableError,
  decryptCredentialForUse,
} from "../credentials";

export const SLACK_WEBHOOK_PROVIDER = "slack-webhook";
/** The deployment holds one team webhook under this key; more would need a channel chooser. */
export const SLACK_WEBHOOK_KEY_ID = "deployment";

const SLACK_WEBHOOK_HOST = "hooks.slack.com";
const SLACK_WEBHOOK_PATH = /^\/services\/[\w/]+$/;

export function slackWebhookUrlRefusal(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "The Slack webhook is not a URL.";
  }
  if (url.protocol !== "https:")
    return "The Slack webhook must be an https URL.";
  if (url.hostname !== SLACK_WEBHOOK_HOST)
    return "The Slack webhook must be on hooks.slack.com.";
  if (!SLACK_WEBHOOK_PATH.test(url.pathname))
    return "The Slack webhook must be a hooks.slack.com/services/ URL.";
  // The webhook path IS the credential; nothing of it belongs in a log or an audit row, and the
  // refusals above deliberately never quote it back.
  return null;
}

export type SlackPost = { text: string };

export type SlackWebhookReader = {
  /** The live webhook URL, or null when this deployment holds none. */
  readWebhook(): Promise<string | null>;
};

/** Production reader: one live `connector` credential out of the vault, decrypted per send. */
export function createSlackWebhookReader(input: {
  store: CredentialStore;
  reader: CredentialSecretReader;
  encryptionKey: string;
}): SlackWebhookReader {
  return {
    async readWebhook() {
      const found = await input.store.findLiveByKey({
        kind: "connector",
        provider: SLACK_WEBHOOK_PROVIDER,
        keyId: SLACK_WEBHOOK_KEY_ID,
      });
      if (!found) return null;
      try {
        return await decryptCredentialForUse(
          input.encryptionKey,
          input.reader,
          found.id,
        );
      } catch (error) {
        if (error instanceof CredentialUnusableError) return null;
        throw error;
      }
    },
  };
}

export class SlackSendError extends Error {
  override name = "SlackSendError";
}

export type SlackSender = {
  send(post: SlackPost): Promise<{ id: string }>;
};

export function createSlackWebhookSender(
  reader: SlackWebhookReader,
  postJson: (
    url: string,
    init: RequestInit,
  ) => Promise<{ ok: boolean; status: number; text: string }> = async (
    url,
    init,
  ) => {
    const response = await fetch(url, init);
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  },
): SlackSender {
  return {
    async send(post) {
      const webhook = await reader.readWebhook();
      if (!webhook)
        throw new SlackSendError(
          "No Slack webhook is stored on this deployment, so nothing was sent. An administrator can add one as a `slack-webhook` connector credential.",
        );
      const refusal = slackWebhookUrlRefusal(webhook);
      if (refusal) throw new SlackSendError(`${refusal} Nothing was sent.`);
      const answered = await postJson(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: post.text }),
      });
      // Slack answers the literal text `ok` on success and a JSON error otherwise; anything else
      // (a proxy page, an empty body) is a failure with a status, not a success.
      if (!answered.ok || answered.text.trim() !== "ok")
        throw new SlackSendError(
          `Slack refused the message (HTTP ${answered.status}).`,
        );
      // No provider id worth keeping: the webhook path IS the credential, so no fragment of it
      // belongs in the send ledger.
      return { id: "slack-webhook" };
    },
  };
}
