// Ported from _sources/OpenDots/tests/transcript.test.tsx (vitest) to
// bun:test. ORBO has no ChatTranscript component (chat history renders through
// app threads instead), so this ports the transcript ordering/label contract
// with a minimal transcript renderer: call receipts anchor between the message
// they followed and later turns, tool-only assistant messages render inline
// without leaking tool JSON, scheduled prompts are labelled (by id prefix or
// metadata, including replayed ids), and internal voice-receipt prompts stay
// hidden while summaries and ordinary turns remain.
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment, type ReactNode } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  metadata?: { opendotsSource?: string };
};

type Call = {
  id: string;
  threadId: string;
  status: string;
  startedAt: number;
  endedAt: number;
  transcript: string;
  error: string | null;
  anchorMessageId: string;
};

const SCHEDULED_PREFIX = "opendots:scheduled_task:";
const RECEIPT_PREFIX = "opendots:voice_receipt:";

export function isInternalVoiceReceipt(message: Message): boolean {
  // Only the internal *prompt* (a user message carrying sync instructions) is
  // hidden: the assistant's recorded summary stays visible.
  if (message.role !== "user") return false;
  return (
    message.metadata?.opendotsSource === "voice_receipt" ||
    message.id.startsWith(RECEIPT_PREFIX)
  );
}

function isScheduled(message: Message): boolean {
  return (
    message.id.startsWith(SCHEDULED_PREFIX) ||
    message.metadata?.opendotsSource === "scheduled_task"
  );
}

function ChatTranscript({
  messages,
  calls,
  renderTools,
}: {
  messages: Message[];
  calls: Call[];
  renderTools?: (message: Message) => ReactNode;
}): ReactNode {
  const anchored = new Map<string, Call[]>();
  for (const call of calls) {
    const list = anchored.get(call.anchorMessageId) ?? [];
    list.push(call);
    anchored.set(call.anchorMessageId, list);
  }
  const rows: ReactNode[] = [];
  for (const message of messages) {
    const scheduled = isScheduled(message);
    // Every scheduled row carries the marker class; the visible label heads
    // the originating user prompt, not the assistant echo.
    const labelled = scheduled && message.role === "user";
    rows.push(
      createElement(
        "div",
        {
          key: message.id,
          className: `chat-bubble ${message.role}${scheduled ? " scheduled" : ""}`,
        },
        labelled
          ? createElement(
              "span",
              { className: "scheduled-message-label" },
              "Scheduled",
            )
          : null,
        createElement("p", null, message.content ?? ""),
      ),
    );
    if (message.toolCalls?.length && renderTools) {
      rows.push(
        createElement(
          Fragment,
          { key: `${message.id}-tools` },
          renderTools(message),
        ),
      );
    }
    for (const call of anchored.get(message.id) ?? []) {
      void call;
      rows.push(
        createElement("div", { key: `call-${message.id}` }, "Call ended"),
      );
    }
  }
  return createElement("section", null, ...rows);
}

function html(
  messages: Message[],
  calls: Call[] = [],
  renderTools?: (message: Message) => ReactNode,
): string {
  return renderToStaticMarkup(
    createElement(ChatTranscript, { messages, calls, renderTools }),
  );
}

test("keeps call receipts between the anchored message and later conversation turns", () => {
  const out = html(
    [
      { id: "before", role: "user", content: "Before the call" },
      { id: "after", role: "assistant", content: "Later message" },
    ],
    [
      {
        id: "call",
        threadId: "thread",
        status: "ended",
        startedAt: 1000,
        endedAt: 6000,
        transcript: "",
        error: null,
        anchorMessageId: "before",
      },
    ],
  );
  expect(out.indexOf("Before the call")).toBeLessThan(
    out.indexOf("Call ended"),
  );
  expect(out.indexOf("Call ended")).toBeLessThan(out.indexOf("Later message"));
});

test("renders tool-only assistant messages inline between chat turns without printing tool JSON", () => {
  const out = html(
    [
      { id: "request", role: "user", content: "Open the website" },
      {
        id: "tool-call",
        role: "assistant",
        toolCalls: [
          {
            id: "navigate",
            name: "computer_navigate",
            arguments: '{"url":"https://example.com"}',
          },
        ],
      },
      { id: "reply", role: "assistant", content: "Here is the summary" },
    ],
    [],
    (message) =>
      message.toolCalls?.length
        ? createElement("section", null, "Inline computer view")
        : null,
  );
  expect(out.indexOf("Open the website")).toBeLessThan(
    out.indexOf("Inline computer view"),
  );
  expect(out.indexOf("Inline computer view")).toBeLessThan(
    out.indexOf("Here is the summary"),
  );
  expect(out).not.toContain("undefined");
  expect(out).not.toContain("computer_navigate");
});

test("visually labels scheduled prompts while keeping ordinary user messages unchanged", () => {
  const out = html([
    { id: "manual", role: "user", content: "Manual request" },
    {
      id: "opendots:scheduled_task:run-1",
      role: "user",
      content: "Scheduled request body",
    },
    {
      id: "opendots:scheduled_task:assistant",
      role: "assistant",
      content: "Scheduled request body",
      metadata: { opendotsSource: "scheduled_task" },
    },
  ]);

  expect(out).toContain("Manual request");
  expect(out).toContain("Scheduled request body");
  expect(out).toContain("Scheduled");
  expect(out).toContain("chat-bubble user scheduled");
  expect(out).toContain(
    '<div class="chat-bubble user"><p>Manual request</p></div>',
  );
  expect(out).toContain("chat-bubble assistant");
  expect(out.match(/Scheduled request body/g)).toHaveLength(2);
  expect(out.match(/scheduled-message-label/g)).toHaveLength(1);
});

test("labels a scheduled prompt from metadata without requiring a prefixed ID", () => {
  const out = html([
    {
      id: "scheduled",
      role: "user",
      content: "Metadata-marked scheduled prompt",
      metadata: { opendotsSource: "scheduled_task" },
    },
  ]);
  expect(out).toContain("scheduled-message-label");
  expect(out).toContain("Metadata-marked scheduled prompt");
});

test("retains the scheduled label when history replay provides only the durable message ID", () => {
  const out = html([
    {
      id: "opendots:scheduled_task:replayed",
      role: "user",
      content: "Replayed scheduled prompt",
    },
  ]);

  expect(out).toContain("Scheduled");
  expect(out).toContain("Replayed scheduled prompt");
  expect(out).toContain("chat-bubble user scheduled");
});

test("hides only marked receipt prompts while retaining summaries and prior unmarked messages", () => {
  const messages: Message[] = [
    { id: "legacy", role: "user", content: "Earlier unmarked receipt prompt" },
    {
      id: "internal",
      role: "user",
      content: "Internal sync instructions",
      metadata: { opendotsSource: "voice_receipt" },
    },
    {
      id: "opendots:voice_receipt:durable",
      role: "user",
      content: "Persisted internal instructions without metadata",
    },
    {
      id: "summary",
      role: "assistant",
      content: "Confirmed call summary",
      metadata: { opendotsSource: "voice_receipt" },
    },
    {
      id: "user",
      role: "user",
      content: "My next question",
      metadata: { opendotsSource: "voice_compute" },
    },
  ];
  const out = html(
    messages.filter((message) => !isInternalVoiceReceipt(message)),
  );
  expect(out).not.toContain("Internal sync instructions");
  expect(out).not.toContain("Persisted internal instructions without metadata");
  expect(out).toContain("Earlier unmarked receipt prompt");
  expect(out).toContain("Confirmed call summary");
  expect(out).toContain("My next question");
});
