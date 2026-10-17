// Ported from upstream tests/computer-card.test.tsx (vitest) to
// bun:test. The upstream ComputerToolCard has no ORBO counterpart (per
// the Phase 5 backend mapping doc the card is UI-only), so this
// ports the user-visible status contract with a minimal card that encodes the
// same decision rules: nonzero exits are "Needs attention" (never "Finished"),
// a run that ends with calls still in flight marks them "Interrupted", live
// views are labelled "Current browser view", and runtime-finalized results map
// to their labels.
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

type CardProps = {
  name: string;
  toolCallId: string;
  status: "complete" | "inProgress" | "executing";
  dotId: string;
  dotName: string;
  showScreen: boolean;
  running: boolean;
  result?: string;
  args?: { url?: string };
};

function statusOf(props: CardProps): {
  label: string;
  detail?: string;
  liveView: boolean;
} {
  if (props.result) {
    try {
      const parsed: unknown = JSON.parse(props.result);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        if (
          typeof record.exitCode === "number" ||
          typeof record.stdout === "string" ||
          typeof record.stderr === "string"
        ) {
          const failed =
            typeof record.exitCode === "number" && record.exitCode !== 0;
          const message =
            typeof record.stderr === "string" && record.stderr
              ? record.stderr
              : typeof record.stdout === "string"
                ? record.stdout
                : "";
          return {
            label: failed ? "Needs attention" : "Finished",
            detail: message || undefined,
            liveView: false,
          };
        }
        if (record.status === "stopped")
          return {
            label: "Interrupted",
            detail:
              typeof record.message === "string" ? record.message : undefined,
            liveView: false,
          };
        if (record.status === "error")
          return {
            label: "Needs attention",
            detail:
              typeof record.message === "string" ? record.message : undefined,
            liveView: false,
          };
        if (typeof record.message === "string")
          return { label: "Finished", detail: record.message, liveView: false };
      }
    } catch {
      // Fall through to status-based labelling.
    }
  }
  if (props.status === "inProgress" && !props.running)
    return {
      label: "Interrupted",
      detail: props.args?.url,
      liveView: props.showScreen,
    };
  return { label: "Finished", liveView: false };
}

function ComputerToolCard(props: CardProps) {
  const state = statusOf(props);
  return (
    <section>
      <h2>{state.label}</h2>
      {state.liveView ? <p>Current browser view</p> : null}
      {state.detail ? <pre>{state.detail}</pre> : null}
    </section>
  );
}

function html(props: CardProps): string {
  return renderToStaticMarkup(<ComputerToolCard {...props} />);
}

const base = {
  toolCallId: "call",
  dotId: "scout",
  dotName: "Scout",
  running: false,
} as const;

test("shows real terminal output and does not treat a nonzero exit as success", () => {
  const out = html({
    ...base,
    name: "computer_exec",
    status: "complete",
    showScreen: false,
    result: JSON.stringify({
      exitCode: 1,
      stdout: "",
      stderr: "File not found",
    }),
  });
  expect(out).toContain("Needs attention");
  expect(out).toContain("File not found");
  expect(out).not.toContain("Finished");
});

test("marks unfinished calls interrupted after a run ends and labels live views as current", () => {
  const out = html({
    ...base,
    name: "computer_navigate",
    toolCallId: "nav",
    status: "inProgress",
    showScreen: true,
    args: { url: "https://example.com" },
  });
  expect(out).toContain("Interrupted");
  expect(out).toContain("Current browser view");
  expect(out).toContain("https://example.com");
  expect(out).not.toContain("<img");
});

test.each([
  [
    {
      status: "stopped",
      reason: "stop_requested",
      message: "The run was stopped.",
    },
    "Interrupted",
  ],
  [
    {
      status: "error",
      reason: "missing_terminal_event",
      message: "The tool never returned.",
    },
    "Needs attention",
  ],
] as const)("recognizes runtime-finalized tool result %j", (result, label) => {
  const out = html({
    ...base,
    name: "computer_navigate",
    toolCallId: "nav",
    status: "complete",
    showScreen: false,
    result: JSON.stringify(result),
  });
  expect(out).toContain(label);
  expect(out).toContain(result.message);
  expect(out).not.toContain("Finished");
});
