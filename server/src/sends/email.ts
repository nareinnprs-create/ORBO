/**
 * Outbound email for Bots: Amazon SESv2, signed with SigV4 over plain fetch.
 *
 * WHY SES AND NOT ANOTHER TRANSPORT. The deployment already owns an AWS relationship for inbound
 * mail (see `../responsibilities/email.ts`, which receives through SES receipt rules), so the
 * sending domain is already verified in the same account and deliverability is the operator's
 * existing setup rather than a new one. SESv2's SendEmail is one HTTPS POST; the only hard part is
 * SigV4, which is written here rather than pulled in, because an AWS SDK dependency for one call
 * would drag a dependency tree behind one endpoint. The signing is the standard chain: a derived
 * signing key from the secret access key, a canonical request over method/path/query/headers/hashed
 * body, and a string-to-sign over the credential scope.
 *
 * CONFIGURED MEANS ALL FOUR. Region, access key id, secret access key and the from address come
 * from the environment (`ORBO_EMAIL_REGION`, `ORBO_EMAIL_ACCESS_KEY_ID`,
 * `ORBO_EMAIL_SECRET_ACCESS_KEY`, `ORBO_EMAIL_FROM`); any one without the rest is a deployment
 * half-set-up, and half a credential is worse than none, so `emailConfigFromEnv` refuses to answer
 * anything at all unless every value is present. An unconfigured deployment simply has no email
 * tool for its Bots.
 */
import { createHash, createHmac } from "node:crypto";

export type EmailConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The verified identity SES sends from, e.g. `orbo@example.com`. */
  from: string;
};

export function emailConfigFromEnv(
  env: Record<string, string | undefined>,
): EmailConfig | null {
  const names = [
    "ORBO_EMAIL_REGION",
    "ORBO_EMAIL_ACCESS_KEY_ID",
    "ORBO_EMAIL_SECRET_ACCESS_KEY",
    "ORBO_EMAIL_FROM",
  ] as const;
  const values = names.map((name) => env[name]?.trim() ?? "");
  // Fail closed on the half-configured deployment: any missing value disables the transport.
  return values.every(Boolean)
    ? {
        region: values[0],
        accessKeyId: values[1],
        secretAccessKey: values[2],
        from: values[3],
      }
    : null;
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value, "utf8").digest();

/**
 * The SigV4 `Authorization` header for one SES request, exposed for its own tests: the signing
 * chain is fixed by AWS's documentation, and a test can pin one canonical request end to end
 * without a network.
 */
export function sigV4Authorization(input: {
  method: string;
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The body, hashed into the canonical request. */
  payload: string;
  /** The x-amz-date value, `YYYYMMDDTHHMMSSZ`; injected so a test can pin the vector. */
  amzDate: string;
  /** Extra headers, lower-cased names, included in the signature. */
  headers: Record<string, string>;
}): string {
  const date = input.amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.payload);
  const sortedHeaders = Object.fromEntries(
    Object.entries({
      host: input.url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": input.amzDate,
      ...Object.fromEntries(
        Object.entries(input.headers).map(([name, value]) => [
          name.toLowerCase(),
          value.trim(),
        ]),
      ),
    }),
  );
  const signedHeaders = Object.keys(sortedHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(sortedHeaders)
    .sort()
    .map((name) => `${name}:${sortedHeaders[name]}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    input.url.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region),
      input.service,
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** One email, ready to hand to SES. One recipient: a Bot sends to a person, not to a list. */
export type OutgoingEmail = {
  to: string;
  subject: string;
  body: string;
};

export class EmailSendError extends Error {
  override name = "EmailSendError";
  constructor(
    readonly uncertain: boolean,
    message: string,
  ) {
    super(message);
  }
}

export type EmailSender = {
  config: EmailConfig;
  send(email: OutgoingEmail): Promise<{ id: string | null }>;
};

/** The recipient SES will be asked for, or a refusal reason. One address, no display names. */
export function parseRecipient(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]{2,}$/.test(value)
    ? value
    : null;
}

/**
 * The SES sender. `fetchJson` is injectable so tests assert the signed request rather than the
 * network; production hands over nothing and the global fetch is used.
 */
export function createEmailSender(
  config: EmailConfig,
  fetchJson: (
    url: URL,
    init: RequestInit,
  ) => Promise<{ ok: boolean; status: number; json: unknown }> = async (
    url,
    init,
  ) => {
    const response = await fetch(url, init);
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // A non-JSON error page is still a failure with a status; the message below carries it.
    }
    return { ok: response.ok, status: response.status, json };
  },
): EmailSender {
  return {
    config,
    async send(email) {
      const to = parseRecipient(email.to);
      if (!to)
        throw new EmailSendError(
          false,
          `"${email.to}" is not an email address.`,
        );
      const body = JSON.stringify({
        FromEmailAddress: config.from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: email.subject, Charset: "UTF-8" },
            Body: { Text: { Data: email.body, Charset: "UTF-8" } },
          },
        },
      });
      const amzDate = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
      const url = new URL(
        `https://email.${config.region}.amazonaws.com/v2/email/outbound-emails`,
      );
      let authorization: string;
      try {
        authorization = sigV4Authorization({
          method: "POST",
          url,
          region: config.region,
          service: "ses",
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          payload: body,
          amzDate,
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        throw new EmailSendError(
          false,
          `The email could not be signed: ${error instanceof Error ? error.message : "unknown error"}.`,
        );
      }
      const answered = await fetchJson(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-amz-date": amzDate,
          "x-amz-content-sha256": sha256Hex(body),
          authorization,
        },
        body,
      });
      if (!answered.ok) {
        const detail =
          answered.json && typeof answered.json === "object"
            ? (((answered.json as Record<string, unknown>).message as string) ??
              `HTTP ${answered.status}`)
            : `HTTP ${answered.status}`;
        // 4xx is SES refusing this request (unverified identity, bad address) and will refuse a
        // retry identically; 5xx and network answers leave the send uncertain, which the caller
        // must not treat as "not sent".
        throw new EmailSendError(
          answered.status >= 500,
          `SES refused the email (${detail}).`,
        );
      }
      const id =
        answered.json && typeof answered.json === "object"
          ? (((answered.json as Record<string, unknown>).MessageId as string) ??
            null)
          : null;
      return { id };
    },
  };
}
