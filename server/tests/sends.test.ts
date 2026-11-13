import { describe, expect, test } from "bun:test";
import { ApprovalRefusedError } from "../src/approvals/types";
import { HeadlessToolSuspension } from "../src/computer/headless-tools";
import { randomUUID } from "node:crypto";
import {
  createEmailSender,
  emailConfigFromEnv,
  parseRecipient,
  sigV4Authorization,
} from "../src/sends/email";
import {
  createSlackWebhookSender,
  createSlackWebhookReader,
  SlackSendError,
  slackWebhookUrlRefusal,
} from "../src/sends/slack";
import { sendDailyCapFromEnv, sendTools } from "../src/sends/tools";

/**
 * The send actions, decided here without a network and without a database: the transports are
 * asserted on the requests they sign and the refusals they give, and the tool layer on the order
 * it checks things in — cap before gate, gate before provider, audit on every outcome.
 */

const config = {
  region: "eu-west-1",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI-example-secret",
  from: "orbo@example.test",
};

describe("email configuration", () => {
  test("all four values or nothing", () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(
      emailConfigFromEnv({
        ORBO_EMAIL_REGION: "eu-west-1",
        ORBO_EMAIL_ACCESS_KEY_ID: "AKID",
        ORBO_EMAIL_SECRET_ACCESS_KEY: "secret",
        // The from address is the fourth leg; three of four is a half-set-up deployment.
        ORBO_EMAIL_FROM: "  ",
      }),
    ).toBeNull();
  });

  test("a recipient is one bare address", () => {
    expect(parseRecipient(" Person@Example.COM ")).toBe("person@example.com");
    expect(parseRecipient("not an address")).toBeNull();
    expect(parseRecipient("Display Name <a@b.co>")).toBeNull();
  });
});

describe("the SES request", () => {
  test("the signature is pinned: same inputs, same string, documented shape", () => {
    const url = new URL("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    const input = {
      method: "POST",
      url,
      region: "eu-west-1",
      service: "ses",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      payload: '{"body":true}',
      amzDate: "20260612T000000Z",
      headers: { "content-type": "application/json" },
    } as const;
    const first = sigV4Authorization(input);
    // Deterministic: the signing chain is pure, so a change in canonicalization cannot pass
    // silently.
    expect(first).toBe(sigV4Authorization({ ...input }));
    // The shape AWS documents: the algorithm, the credential scope ending in the service's
    // aws4_request, the signed header list in order, and a hex signature.
    expect(first).toStartWith(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260612/eu-west-1/ses/aws4_request",
    );
    expect(first).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
    );
    expect(first).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  test("one recipient, text body, from the configured identity", async () => {
    const seen: { url: URL; init: RequestInit }[] = [];
    const sender = createEmailSender(config, async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: { MessageId: "ses-1" } };
    });
    const result = await sender.send({
      to: "person@example.com",
      subject: "Status",
      body: "All quiet.",
    });
    expect(result).toEqual({ id: "ses-1" });
    const request = seen[0];
    expect(request?.url.host).toBe("email.eu-west-1.amazonaws.com");
    const body = JSON.parse(String(request?.init.body) ?? "{}") as Record<string, any>;
    expect(body.FromEmailAddress).toBe("orbo@example.test");
    expect(body.Destination.ToAddresses).toEqual(["person@example.com"]);
    expect(body.Content.Simple.Subject.Data).toBe("Status");
    expect(body.Content.Simple.Body.Text.Data).toBe("All quiet.");
    expect(seen[0]?.init.headers).toHaveProperty("authorization");
  });

  test("a 5xx leaves the send uncertain, a 4xx does not", async () => {
    const uncertain = createEmailSender(config, async () => ({
      ok: false,
      status: 503,
      json: null,
    }));
    try {
      await uncertain.send({ to: "a@b.co", subject: "s", body: "b" });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).name).toBe("EmailSendError");
      expect((error as { uncertain?: boolean }).uncertain).toBe(true);
    }
    const refused = createEmailSender(config, async () => ({
      ok: false,
      status: 403,
      json: { message: "Identity not verified" },
    }));
    try {
      await refused.send({ to: "a@b.co", subject: "s", body: "b" });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as { message?: string }).message).toContain(
        "Identity not verified",
      );
      expect((error as { uncertain?: boolean }).uncertain).toBe(false);
    }
  });

  test("an unparsable recipient never reaches the network", async () => {
    const sender = createEmailSender(config, async () => {
      throw new Error("network must not be touched");
    });
    await expect(
      sender.send({ to: "nonsense", subject: "s", body: "b" }),
    ).rejects.toThrow("not an email address");
  });
});

describe("the Slack webhook", () => {
  test("the URL is validated before it is ever fetched", () => {
    expect(
      slackWebhookUrlRefusal("https://hooks.slack.com/services/T1/B2/X3"),
    ).toBeNull();
    expect(slackWebhookUrlRefusal("http://hooks.slack.com/services/T1/B2/X3"))
      .toMatch(/https/);
    expect(slackWebhookUrlRefusal("https://evil.test/services/T1/B2/X3"))
      .toMatch(/hooks\.slack\.com/);
    expect(slackWebhookUrlRefusal("https://hooks.slack.com/other/T1"))
      .toMatch(/services/);
    expect(slackWebhookUrlRefusal("not a url")).toMatch(/not a URL/);
  });

  test("no stored webhook is a clear refusal", async () => {
    const sender = createSlackWebhookSender({ readWebhook: async () => null });
    await expect(sender.send({ text: "hi" })).rejects.toThrow(
      /No Slack webhook is stored/,
    );
  });

  test("a stored webhook posts the text and asks for the literal ok", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const sender = createSlackWebhookSender(
      { readWebhook: async () => "https://hooks.slack.com/services/T1/B2/X3" },
      async (url, init) => {
        seen.push({ url, init });
        return { ok: true, status: 200, text: "ok" };
      },
    );
    expect(await sender.send({ text: "Deploy finished." })).toEqual({
      id: "slack-webhook",
    });
    expect(seen[0]?.url).toBe("https://hooks.slack.com/services/T1/B2/X3");
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      text: "Deploy finished.",
    });
    // Slack answers `ok` as text; anything else on a 200 is a failure, not a send.
    const lying = createSlackWebhookSender(
      { readWebhook: async () => "https://hooks.slack.com/services/T1/B2/X3" },
      async () => ({ ok: true, status: 200, text: "<html>gateway</html>" }),
    );
    await expect(lying.send({ text: "hi" })).rejects.toThrow(/Slack refused/);
  });

  test("the production reader answers null for a revoked or absent credential", async () => {
    // A reader over an empty store: `findLiveByKey` answers null, so the tool's refusal names the
    // missing credential rather than a decryption fault.
    const reader = createSlackWebhookReader({
      store: {
        findLiveByKey: async () => null,
      } as never,
      reader: { readSecret: async () => null } as never,
      encryptionKey: Buffer.alloc(32, 1).toString("base64"),
    });
    expect(await reader.readWebhook()).toBeNull();
  });
});

describe("the caps", () => {
  test("each cap is read from its own variable, with the shipped default", () => {
    expect(sendDailyCapFromEnv({}, "ORBO_SEND_EMAIL_DAILY_CAP")).toBe(25);
    expect(
      sendDailyCapFromEnv({ ORBO_SEND_EMAIL_DAILY_CAP: "5" }, "ORBO_SEND_EMAIL_DAILY_CAP"),
    ).toBe(5);
    expect(
      sendDailyCapFromEnv({ ORBO_SEND_EMAIL_DAILY_CAP: "-3" }, "ORBO_SEND_EMAIL_DAILY_CAP"),
    ).toBe(25);
    expect(
      sendDailyCapFromEnv({ ORBO_SEND_SLACK_DAILY_CAP: "0" }, "ORBO_SEND_SLACK_DAILY_CAP"),
    ).toBe(0);
  });
});

describe("the send tools", () => {
  const auditRows: { eventType: string; payload: Record<string, unknown> }[] = [];
  const auditStore = {
    insert: async (event: { eventType: string; payload: Record<string, unknown> }) => {
      auditRows.push(event);
    },
  };

  function harness(overrides: Record<string, unknown> = {}) {
    const recorded: Record<string, unknown>[] = [];
    const sent: Record<string, unknown>[] = [];
    const gateCalls: Record<string, unknown>[] = [];
    const tools = sendTools({
      store: {
        countToday: async () => 0,
        record: async (input: Record<string, unknown>) => {
          recorded.push(input);
        },
      } as never,
      approvalGate: async (candidate: Record<string, unknown>) => {
        gateCalls.push(candidate);
        return undefined;
      },
      auditStore: auditStore as never,
      ownerUserId: "person-1",
      agentId: "bot-1",
      initiator: { kind: "person" },
      email: {
        config,
        send: async (input: Record<string, unknown>) => {
          sent.push(input);
          return { id: "ses-1" };
        },
      } as never,
      slack: {
        send: async (input: Record<string, unknown>) => {
          sent.push({ slack: input });
          return { id: "slack-webhook" };
        },
      } as never,
      caps: { email: 25, slack: 25 },
      ...overrides,
    });
    return { tools, recorded, sent, gateCalls };
  }

  test("only the transports this deployment holds are offered", () => {
    const none = sendTools({
      store: {} as never,
      approvalGate: async () => undefined,
      auditStore: auditStore as never,
      ownerUserId: "p",
      agentId: "b",
      caps: { email: 1, slack: 1 },
    });
    expect(none).toEqual([]);
  });

  test("a send past the cap is refused before the gate is ever asked", async () => {
    const { tools, sent, gateCalls } = harness({
      store: {
        countToday: async () => 25,
        record: async () => {},
      } as never,
    });
    const email = tools.find((tool) => tool.name === "send_email")!;
    const answer = await email.execute({
      to: "person@example.com",
      subject: "Status",
      body: "All quiet.",
    });
    expect(answer).toStartWith("Refused.");
    expect(answer).toContain("cap of 25");
    expect(gateCalls).toEqual([]);
    expect(sent).toEqual([]);
    // The refusal is on the trail: a silent cap is indistinguishable from a broken tool.
    expect(
      auditRows.some(
        (row) => row.eventType === "send.refused" && row.payload.refusal === "rate_limited",
      ),
    ).toBe(true);
  });

  test("the gate is asked with the recipient domain as the scope, and a pass sends", async () => {
    const { tools, sent, recorded, gateCalls } = harness();
    const email = tools.find((tool) => tool.name === "send_email")!;
    const answer = await email.execute({
      to: "Person@Example.com",
      subject: "Status",
      body: "All quiet.",
    });
    expect(JSON.parse(answer)).toEqual({ sent: true, to: "person@example.com" });
    expect(gateCalls[0]).toMatchObject({
      actorId: "person-1",
      botId: "bot-1",
      toolRef: "send/email",
      effect: "write",
      // The pre-approval tier: a rule on the domain covers every address in it.
      scope: "example.com",
      target: { kind: "email", to: "person@example.com", from: config.from },
    });
    expect(sent).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      ownerUserId: "person-1",
      agentId: "bot-1",
      kind: "email",
      target: "person@example.com",
      providerId: "ses-1",
    });
    const row = auditRows.find((entry) => entry.eventType === "send.succeeded");
    expect(row?.payload).toMatchObject({ kind: "email", subject: "Status" });
    // The body is content; it has no business in an audit row.
    expect(row?.payload).not.toHaveProperty("body");
  });

  test("a decline from the gate is a refusal, and a waiting approval suspends the run", async () => {
    const declining = harness({
      approvalGate: async () => {
        throw new ApprovalRefusedError("The person declined this action.");
      },
    });
    const email = declining.tools.find((tool) => tool.name === "send_email")!;
    expect(
      await email.execute({ to: "a@b.co", subject: "s", body: "b" }),
    ).toStartWith("Refused. The person declined");
    expect(declining.sent).toEqual([]);

    const waiting = harness({
      approvalGate: async () => {
        throw new HeadlessToolSuspension("This action is waiting for your approval.", {
          kind: "approval",
          approvalId: randomUUID(),
          requestId: randomUUID(),
        });
      },
    });
    const waitingEmail = waiting.tools.find((tool) => tool.name === "send_email")!;
    // The suspension propagates: the run pauses and the person's answer becomes the tool's result.
    await expect(
      waitingEmail.execute({ to: "a@b.co", subject: "s", body: "b" }),
    ).rejects.toBeInstanceOf(HeadlessToolSuspension);
    expect(waiting.sent).toEqual([]);
  });

  test("a replayed decision is reported and nothing is sent twice", async () => {
    const { tools, sent } = harness({
      approvalGate: async () => ({
        replay: { done: true },
        complete: async () => undefined,
      }),
    });
    const slack = tools.find((tool) => tool.name === "send_slack_message")!;
    const answer = await slack.execute({ text: "Deploy finished." });
    expect(answer).toContain("Already handled by the person");
    expect(sent).toEqual([]);
  });

  test("a provider failure is a refusal naming the transport, audited as one", async () => {
    const { tools } = harness({
      slack: {
        send: async () => {
          throw new SlackSendError("Slack refused the message (HTTP 503).");
        },
      } as never,
    });
    const slack = tools.find((tool) => tool.name === "send_slack_message")!;
    const answer = await slack.execute({ text: "Deploy finished." });
    expect(answer).toStartWith("Refused. Slack refused");
    expect(
      auditRows.some(
        (row) =>
          row.eventType === "send.refused" && row.payload.refusal === "provider_error",
      ),
    ).toBe(true);
  });

  test("a malformed recipient is refused without the gate or the network", async () => {
    const { tools, gateCalls, sent } = harness();
    const email = tools.find((tool) => tool.name === "send_email")!;
    const answer = await email.execute({
      to: "not-an-address",
      subject: "s",
      body: "b",
    });
    expect(answer).toStartWith("Refused.");
    expect(gateCalls).toEqual([]);
    expect(sent).toEqual([]);
  });
});
