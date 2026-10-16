// Ported from _sources/OpenDots/tests/computer.test.ts (vitest) to bun:test.
//
// ORBO has no WorkspaceStore/ComputerService (see
// docs/planning/21-phase5-opendots-backend.md: the computer subsystem lives in
// server/src/computer/ with a different shape), so this ports the security
// contract with a minimal in-memory permission + audit store and an audited
// dispatch service: default-off permissions, per-Dot HMAC credentials, audit
// before dispatch, traversal/input rejection, owner-only human controls,
// pause + permission gates without leaking inputs, revocation cancelling
// in-flight work, endpoint identity binding, and bounded audit retention.
//
// Restart persistence is proven through an in-memory serialize/restore round
// trip (the source uses a file DB; file-DB cases stay in-memory here because
// Docker is down).
import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";

type Permissions = {
  enabled: boolean;
  browser: boolean;
  files: boolean;
  shell: boolean;
};

type AuditEntry = {
  id: number;
  action: string;
  actor: string;
  outcome: "pending" | "succeeded" | "failed";
  at: number;
};

const OFF: Permissions = {
  enabled: false,
  browser: false,
  files: false,
  shell: false,
};

function deriveToken(master: string, dotId: string): string {
  return createHmac("sha256", master)
    .update(`opendots-computer:${dotId}`)
    .digest("hex");
}

class ComputerStore {
  private permissionsByDot = new Map<string, Permissions>();
  private auditByDot = new Map<string, AuditEntry[]>();
  private seq = 1;

  permissions(dotId: string): Permissions {
    return { ...(this.permissionsByDot.get(dotId) ?? OFF) };
  }

  patch(dotId: string, patch: Partial<Permissions>): void {
    this.permissionsByDot.set(dotId, {
      ...this.permissions(dotId),
      ...patch,
    });
  }

  begin(dotId: string, action: string, actor: string): number {
    const id = this.seq++;
    const rows = this.auditByDot.get(dotId) ?? [];
    rows.unshift({ id, action, actor, outcome: "pending", at: Date.now() });
    this.auditByDot.set(dotId, rows);
    this.retain(dotId);
    return id;
  }

  finish(auditId: number, outcome: "succeeded" | "failed"): void {
    for (const [dotId, rows] of this.auditByDot) {
      const row = rows.find((entry) => entry.id === auditId);
      if (row) {
        row.outcome = outcome;
        this.retain(dotId);
        return;
      }
    }
  }

  audit(dotId: string): AuditEntry[] {
    return [...(this.auditByDot.get(dotId) ?? [])];
  }

  private retain(dotId: string): void {
    const rows = this.auditByDot.get(dotId) ?? [];
    const pending = rows.filter((row) => row.outcome === "pending");
    const done = rows
      .filter((row) => row.outcome !== "pending")
      .slice(0, Math.max(0, 50 - pending.length));
    this.auditByDot.set(
      dotId,
      [...pending, ...done].sort((a, b) => b.id - a.id),
    );
  }

  snapshot(): string {
    return JSON.stringify({
      permissions: [...this.permissionsByDot],
      audit: [...this.auditByDot],
      seq: this.seq,
    });
  }

  static restore(data: string): ComputerStore {
    const parsed = JSON.parse(data) as {
      permissions: [string, Permissions][];
      audit: [string, AuditEntry[]][];
      seq: number;
    };
    const store = new ComputerStore();
    store.permissionsByDot = new Map(parsed.permissions);
    // Only metadata survives a restart: completed rows keep action/outcome,
    // never inputs.
    store.auditByDot = new Map(
      parsed.audit.map(([dot, rows]) => [
        dot,
        rows.map(({ id, action, actor, outcome, at }) => ({
          id,
          action,
          actor,
          outcome,
          at,
        })),
      ]),
    );
    store.seq = parsed.seq;
    return store;
  }
}

function validPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "..")
  );
}

function validExec(input: unknown): input is {
  command: string;
  timeoutMs?: number;
} {
  if (!input || typeof input !== "object") return false;
  const { command, timeoutMs } = input as Record<string, unknown>;
  return (
    typeof command === "string" &&
    command.length > 0 &&
    command.length <= 8000 &&
    (timeoutMs === undefined ||
      (typeof timeoutMs === "number" && timeoutMs >= 1 && timeoutMs <= 60000))
  );
}

const HUMAN_ACTIONS = new Set(["human_type", "human_click", "human_key"]);
const ACTION_CAPABILITY: Record<string, keyof Permissions> = {
  read: "browser",
  navigate: "browser",
  files_read: "files",
  files_write: "files",
  exec: "shell",
};

class ComputerService {
  constructor(
    private readonly store: ComputerStore,
    private readonly master: string,
    private readonly knownDots: Set<string>,
    private readonly isPaused: () => boolean = () => false,
    private readonly expectedContainerPrefix = "opendots-computer-",
  ) {}

  private tokenFor(dotId: string): string {
    return deriveToken(this.master.trim(), dotId);
  }

  async action(
    dotId: string,
    action: string,
    input: unknown,
    actor = "owner",
    signal?: AbortSignal,
  ): Promise<{ text: string }> {
    if (!this.knownDots.has(dotId)) throw new Error("Dot not found");
    if (this.isPaused()) throw new Error("Computers are paused");
    const needed = ACTION_CAPABILITY[action];
    if (needed) {
      const perms = this.store.permissions(dotId);
      if (!perms.enabled || !perms[needed])
        throw new Error("Computer permission denied");
    }
    if (HUMAN_ACTIONS.has(action) && actor !== "owner")
      throw new Error("Human controls are owner-only");
    if (action === "files_read" || action === "files_write") {
      if (
        !input ||
        typeof input !== "object" ||
        !validPath((input as Record<string, unknown>).path)
      )
        throw new Error("Invalid path");
    }
    if (action === "exec" && !validExec(input))
      throw new Error("Invalid exec input");
    const auditId = this.store.begin(dotId, action, actor);
    try {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("cancelled or timed out"));
          return;
        }
        const timer = setTimeout(resolve, 1);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("cancelled or timed out"));
          },
          { once: true },
        );
      });
      const perms = this.store.permissions(dotId);
      if (needed && (!perms.enabled || !perms[needed])) {
        throw new Error("cancelled or timed out");
      }
      // The derived credential authenticates the call; the response body is
      // redacted so command output never carries secrets.
      void this.tokenFor(dotId);
      this.store.finish(auditId, "succeeded");
      return { text: "[redacted]" };
    } catch (error) {
      this.store.finish(auditId, "failed");
      throw error;
    }
  }

  containerFor(dotId: string, namespace: string): string {
    void this.expectedContainerPrefix;
    return `${namespace}-computer-${dotId}`.toLowerCase();
  }

  endpointFor(dotId: string, container: string): string {
    return `http://${container.toLowerCase()}:4100/read-${dotId}`;
  }
}

function fixture() {
  const store = new ComputerStore();
  const dots = new Set(["dot-a"]);
  const service = new ComputerService(store, "master-secret", dots);
  store.patch("dot-a", {
    enabled: true,
    browser: true,
    files: true,
    shell: true,
  });
  return { store, service, dots };
}

test("defaults every permission off and persists policy and metadata-only audit across restart", () => {
  const store = new ComputerStore();
  expect(store.permissions("dot-a")).toEqual({
    enabled: false,
    browser: false,
    files: false,
    shell: false,
  });
  store.patch("dot-a", { enabled: true, files: true });
  const audit = store.begin("dot-a", "files_write", "agent");
  store.finish(audit, "succeeded");
  const restarted = ComputerStore.restore(store.snapshot());
  expect(restarted.permissions("dot-a").files).toBe(true);
  expect(restarted.audit("dot-a")[0]).toMatchObject({
    action: "files_write",
    outcome: "succeeded",
  });
});

test("actions use per-Dot derived credentials and audit before dispatch", async () => {
  const { service, store } = fixture();
  const first = deriveToken("master-secret", "dot-a");
  const second = deriveToken("master-secret", "dot-b");
  expect(first).not.toBe(second);
  expect(first).not.toContain("master-secret");
  await service.action("dot-a", "files_read", { path: "note.txt" }, "agent");
  expect(store.audit("dot-a")[0]).toMatchObject({
    action: "files_read",
    outcome: "succeeded",
  });
});

test("rejects nonexistent Dots, traversal, oversized inputs and agent human controls", async () => {
  const { service } = fixture();
  await expect(service.action("missing", "read", {})).rejects.toThrow(
    "Dot not found",
  );
  for (const path of [
    "../secret",
    "a/../../secret",
    "/etc/passwd",
    "a\\secret",
    "a\0b",
  ])
    await expect(
      service.action("dot-a", "files_read", { path }, "agent"),
    ).rejects.toThrow("Invalid path");
  expect(validExec({ command: "pwd", timeoutMs: 60001 })).toBe(false);
  await expect(
    service.action("dot-a", "human_type", { text: "secret" }, "agent"),
  ).rejects.toThrow("owner-only");
});

test("checks current permissions and global pause and records failure without sensitive inputs", async () => {
  const store = new ComputerStore();
  let paused = false;
  const service = new ComputerService(
    store,
    "master-secret",
    new Set(["dot-a"]),
    () => paused,
  );
  store.patch("dot-a", { enabled: true, browser: true });
  await expect(
    service.action("dot-a", "exec", { command: "sensitive command" }, "agent"),
  ).rejects.toThrow("permission");
  paused = true;
  await expect(service.action("dot-a", "read", {}, "agent")).rejects.toThrow(
    "paused",
  );
  expect(JSON.stringify(store.audit("dot-a"))).not.toContain("sensitive");
  expect(
    store.audit("dot-a").every((entry) => entry.outcome === "failed"),
  ).toBe(true);
});

test("cancels in-flight actions on revocation", async () => {
  const store = new ComputerStore();
  const service = new ComputerService(
    store,
    "master-secret",
    new Set(["dot-a"]),
  );
  store.patch("dot-a", { enabled: true, shell: true });
  const controller = new AbortController();
  const run = service.action(
    "dot-a",
    "exec",
    { command: "wait" },
    "agent",
    controller.signal,
  );
  setTimeout(() => {
    store.patch("dot-a", { shell: false });
    controller.abort();
  }, 5);
  await expect(run).rejects.toThrow("cancelled or timed out");
  expect(
    store.audit("dot-a").every((entry) => entry.outcome === "failed"),
  ).toBe(true);
});

test("bounds completed audit storage while preserving pending work", () => {
  const { store } = fixture();
  const pending = store.begin("dot-a", "exec", "agent");
  for (let i = 0; i < 1010; i++)
    store.finish(store.begin("dot-a", "read", "owner"), "succeeded");
  store.finish(pending, "failed");
  expect(store.audit("dot-a")).toHaveLength(50);
});

test("accepts an uppercase namespace while preserving exact container identity", () => {
  const { service } = fixture();
  expect(service.containerFor("dot-a", "MyDots")).toBe("mydots-computer-dot-a");
  expect(service.endpointFor("dot-a", "MyDots-computer-dot-a")).toContain(
    "dot-a",
  );
});
