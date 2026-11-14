import { describe, expect, test } from "bun:test";
import { decideAction, ruleMatches } from "../src/approvals/policy";
import type { ApprovalCandidate, ApprovalRule } from "../src/approvals/types";
import {
  CATALOGUE,
  catalogueEntry,
  classifyTool,
  hostAdmissible,
  resolveServerUrl,
  serverCredentialKind,
} from "../src/plugins/catalogue";

/**
 * The `rea` catalogue entry and the one property that makes it safe to offer: REA's tool names
 * cannot be reviewed ahead of time, so NOTHING the server advertises is classified as a read. A
 * side-effectful family that an operator accidentally leaves enabled therefore arrives at the
 * approvals gateway as a write instead of walking through as a read — which is the whole of the
 * grant-policy guarantee this test pins.
 */

const rea = catalogueEntry("rea");

describe("the catalogue entry", () => {
  test("it exists, pinned to loopback http and a fixed path", () => {
    expect(rea).not.toBeNull();
    expect(rea?.host).toBeNull();
    expect(rea?.hostPattern).toBeDefined();
    expect(rea?.transport).toBe("mcp");
    // The deployment holds the bearer token: the bridge enforces it, so an unauthenticated caller
    // on the box cannot drive the analysis tools.
    expect(rea?.auth).toEqual({ kind: "deployment-bearer" });
    expect(serverCredentialKind(rea!)).toBe("mcp");
    expect(resolveServerUrl("rea", "http://127.0.0.1:8815")).toEqual({
      url: "http://127.0.0.1:8815/mcp",
      entry: rea!,
    });
  });

  test("the pattern admits loopback and nothing that resembles it", () => {
    expect(hostAdmissible(rea!, "http://127.0.0.1:8815")).toBe(true);
    expect(hostAdmissible(rea!, "http://127.0.0.1:65535")).toBe(true);
    // An https lookalike, a different loopback address, a hostname that ends in the same numbers,
    // an internal name, a two-digit port, and a path smuggled into the host are each refused.
    expect(hostAdmissible(rea!, "https://127.0.0.1:8815")).toBe(false);
    expect(hostAdmissible(rea!, "http://127.0.0.2:8815")).toBe(false);
    expect(hostAdmissible(rea!, "http://127.0.0.1.evil.test:8815")).toBe(false);
    expect(hostAdmissible(rea!, "http://internal:8815")).toBe(false);
    expect(hostAdmissible(rea!, "http://127.0.0.1:88")).toBe(false);
    expect(hostAdmissible(rea!, "http://127.0.0.1:8815/mcp")).toBe(false);
    expect(hostAdmissible(rea!, "http://[::1]:8815")).toBe(false);
  });

  test("every entry still pins a host or an anchored pattern, and rea appears once", () => {
    for (const entry of CATALOGUE) {
      expect(entry.host !== null || entry.hostPattern !== undefined).toBe(true);
    }
    expect(CATALOGUE.filter((entry) => entry.key === "rea")).toHaveLength(1);
  });
});

describe("the effect classification", () => {
  test("everything REA advertises is a write, whatever the listing recorded", () => {
    // The side-effectful families, by plausible tool name, and a read-safe one: none may ever be
    // offered to a Bot as a read. The recorded column is the vendor's own label, and this entry
    // does not trust a label it could not review.
    for (const name of [
      "frida_attach",
      "adb_install",
      "browser_navigate",
      "electron_eval",
      "javascript_runtime_run",
      "native_disassemble",
      "artifact_extract_asar",
      "session_status",
    ]) {
      expect(classifyTool(rea!, name, true, "read")).toBe("write");
      expect(classifyTool(rea!, name, true, null)).toBe("write");
    }
    // A name the server never advertised came from a model, and is a write as everywhere else.
    expect(classifyTool(rea!, "invented_tool", false, "read")).toBe("write");
  });

  test("other entries keep their ordinary classification", () => {
    // The flag is the rea entry's, not a global loosening: a vendor-recorded read on an entry
    // without the flag is still a read.
    const notion = catalogueEntry("notion");
    expect(notion?.unknownToolsAreWrites).toBeUndefined();
    expect(classifyTool(notion!, "some_new_read_tool", true, "read")).toBe(
      "read",
    );
  });
});

describe("the grant policy", () => {
  const candidate = (toolName: string): ApprovalCandidate => ({
    actorId: "person-1",
    botId: "bot-1",
    toolRef: `rea/${toolName}`,
    effect: classifyTool(rea!, toolName, true, null),
    scope: "rea",
    args: { target: "sample.bin" },
  });

  const rule = (overrides: Partial<ApprovalRule>): ApprovalRule => ({
    id: "rule-1",
    ownerUserId: "person-1",
    botId: "*",
    toolRef: "*",
    effect: "*",
    scope: "*",
    behaviour: "ask",
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  test("a side-effectful family lands behind the person: ask before changes asks", async () => {
    const outcome = await decideAction({
      candidate: candidate("frida_attach"),
      team: [],
      personal: [],
      customRulesEnabled: true,
      autoReview: false,
      // The person's "ask before making changes" switch, the shipped default posture.
      askBeforeChanges: true,
    });
    expect(outcome.behaviour).toBe("ask");
    expect(outcome.source).toBe("default");
  });

  test("an allow rule for the read-safe work is honoured, because the layer is the ordinary one", async () => {
    const allow = rule({
      toolRef: "rea/session_*",
      effect: "write",
      behaviour: "allow",
    });
    const allowed = await decideAction({
      candidate: candidate("session_status"),
      team: [],
      personal: [allow],
      customRulesEnabled: true,
      autoReview: false,
      askBeforeChanges: true,
    });
    expect(allowed.behaviour).toBe("allow");
    expect(allowed.source).toBe("personal_rule");
    // And the same rule does not reach a family it does not name.
    expect(ruleMatches(allow, candidate("frida_attach"))).toBe(false);
    const frida = await decideAction({
      candidate: candidate("frida_attach"),
      team: [],
      personal: [allow],
      customRulesEnabled: true,
      autoReview: false,
      askBeforeChanges: true,
    });
    expect(frida.behaviour).toBe("ask");
  });

  test("auto-review reviews a rea call, and the safety floor still hands off what it names", async () => {
    // reviewable() is every non-read; a rea call is never a read, so it is always reviewable.
    const reviewed = await decideAction({
      candidate: candidate("native_disassemble"),
      team: [],
      personal: [],
      customRulesEnabled: true,
      autoReview: true,
      askBeforeChanges: false,
      // No review model configured: the reviewer fails closed.
    });
    expect(reviewed.behaviour).toBe("ask");
    expect(reviewed.source).toBe("auto_review");
    expect(reviewed.review?.failedClosed).toBe(true);

    // The keyword floor outranks everything, as it does for every tool: a rea call whose
    // arguments are about paying goes to the person unconditionally.
    const payment: ApprovalCandidate = {
      ...candidate("native_disassemble"),
      args: { invoice: "pay now, credit card 4111" },
    };
    const handed = await decideAction({
      candidate: payment,
      team: [],
      personal: [rule({ toolRef: "rea/*", behaviour: "allow" })],
      customRulesEnabled: true,
      autoReview: false,
      askBeforeChanges: false,
    });
    expect(handed.behaviour).toBe("hand_off");
    expect(handed.source).toBe("safety");
  });
});
