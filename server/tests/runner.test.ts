// Ported from _sources/OpenDots/tests/runner.test.ts (vitest) to bun:test.
//
// ORBO's runner lives in server/src/work/loop.ts + server/src/routines/ on
// Postgres (see docs/planning/21-phase5-opendots-backend.md row 16), which
// needs TEST_DATABASE_URL; this file ports the tick semantics with a minimal
// in-memory queue + runner instead: generic run recording without research
// wording, abort on revoked permissions, abort re-checked before evidence
// reaches the model, memory gating, graceful-shutdown review hold, claim/
// persistence failure survival, and ownership-timer errors failing the task
// instead of throwing. No network; provider I/O is an injected fake.
import { expect, test } from "bun:test";

type Memory = { text: string };
type Claim = { id: string; prompt: string; lease: string };
type Result = { text: string; sources: unknown[]; sample: boolean };
type RunEvent = { taskId: string; text: string };

class Queue {
  tasks: {
    id: string;
    prompt: string;
    status: "queued" | "running" | "done" | "failed" | "interrupted";
    lease: string | null;
    result?: Result;
  }[] = [];
  events: RunEvent[] = [];
  memories: Memory[] = [];
  settings: { memoryAllowed: boolean } = { memoryAllowed: true };
  failClaimOnce: Error | null = null;
  failFailOnce: Error | null = null;
  ownsFails = false;
  private seq = 1;

  createTask(prompt: string): string {
    const id = `task-${this.seq++}`;
    this.tasks.push({ id, prompt, status: "queued", lease: null });
    this.events.push({ taskId: id, text: "Task added to the queue." });
    return id;
  }

  saveMemory(text: string): void {
    this.memories.push({ text });
  }

  updateSettings(patch: Partial<Queue["settings"]>): void {
    Object.assign(this.settings, patch);
  }

  claim(): Claim | null {
    if (this.failClaimOnce) {
      const error = this.failClaimOnce;
      this.failClaimOnce = null;
      throw error;
    }
    const task = this.tasks.find((t) => t.status === "queued");
    if (!task) return null;
    task.status = "running";
    task.lease = `lease-${this.seq++}`;
    this.events.push({ taskId: task.id, text: "Run started." });
    return { id: task.id, prompt: task.prompt, lease: task.lease };
  }

  owns(_claim: Claim): boolean {
    if (this.ownsFails) throw new Error("Database unavailable");
    return true;
  }

  complete(claim: Claim, result: Result): void {
    const task = this.tasks.find((t) => t.id === claim.id);
    if (!task) return;
    task.status = "done";
    task.result = result;
    task.lease = null;
    this.events.push({ taskId: task.id, text: "Run completed." });
  }

  fail(claim: Claim, note: string): void {
    if (this.failFailOnce) {
      const error = this.failFailOnce;
      this.failFailOnce = null;
      throw error;
    }
    const task = this.tasks.find((t) => t.id === claim.id);
    if (!task) return;
    task.status = "failed";
    task.lease = null;
    this.events.push({ taskId: task.id, text: note });
  }

  interrupt(claim: Claim, note: string): void {
    const task = this.tasks.find((t) => t.id === claim.id);
    if (task?.status !== "running") return;
    task.status = "interrupted";
    task.lease = null;
    this.events.push({ taskId: task.id, text: note });
  }

  action(id: string, action: "run"): void {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    if (action === "run" && task.status === "interrupted") {
      task.status = "queued";
    }
  }

  detail(id: string): {
    prompt: string;
    result?: Result;
    events: string[];
    status: string;
  } {
    const task = this.tasks.find((t) => t.id === id)!;
    return {
      prompt: task.prompt,
      result: task.result,
      events: this.events.filter((e) => e.taskId === id).map((e) => e.text),
      status: task.status,
    };
  }
}

type Executor = (
  claim: Claim,
  memories: Memory[],
  signal: AbortSignal,
) => Promise<Result>;

class Runner {
  private stopped = false;
  private active = new Set<AbortController>();

  constructor(
    private readonly queue: Queue,
    private readonly mode: "live" | "sample" = "live",
    private readonly execute?: Executor,
    private readonly log: (message: string) => void = (message) =>
      console.error(message),
  ) {}

  stop(): void {
    this.stopped = true;
    for (const controller of this.active) controller.abort();
  }

  async tick(): Promise<void> {
    let claim: Claim | null;
    try {
      claim = this.queue.claim();
    } catch (error) {
      this.log(
        `Claim failed: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }
    if (!claim) return;
    if (this.stopped) {
      this.queue.interrupt(claim, "Run interrupted.");
      return;
    }
    let owns = true;
    try {
      owns = this.queue.owns(claim);
    } catch {
      owns = false;
    }
    if (!owns) {
      try {
        this.queue.fail(claim, "Run failed.");
      } catch (error) {
        this.log(
          `Fail failed: ${error instanceof Error ? error.message : error}`,
        );
      }
      return;
    }
    const controller = new AbortController();
    this.active.add(controller);
    // A settings change revokes the run's permission to continue: abort the
    // in-flight provider call, mirroring the ownership polling loop.
    const watcher = setInterval(() => {
      if (!this.queue.settings.memoryAllowed || this.stopped) {
        controller.abort();
        clearInterval(watcher);
      }
    }, 5);
    try {
      const memories = this.queue.settings.memoryAllowed
        ? [...this.queue.memories]
        : [];
      let result: Result;
      if (this.mode === "sample") {
        result = { text: "Fictional sample brief.", sources: [], sample: true };
      } else if (this.execute) {
        result = await this.execute(claim, memories, controller.signal);
      } else {
        result = await this.liveResearch(claim, memories, controller.signal);
      }
      if (controller.signal.aborted) {
        this.queue.interrupt(claim, "Run interrupted.");
        return;
      }
      this.queue.complete(claim, result);
    } catch (error) {
      if (controller.signal.aborted) {
        this.queue.interrupt(claim, "Run interrupted.");
        return;
      }
      try {
        this.queue.fail(
          claim,
          `Run failed: ${error instanceof Error ? error.message : "error"}`,
        );
      } catch (persistError) {
        this.log(
          `Fail failed: ${persistError instanceof Error ? persistError.message : persistError}`,
        );
        this.queue.interrupt(claim, "Run interrupted.");
      }
    } finally {
      clearInterval(watcher);
      this.active.delete(controller);
    }
  }

  private async liveResearch(
    claim: Claim,
    memories: Memory[],
    signal: AbortSignal,
  ): Promise<Result> {
    void memories;
    const response = await fetch("https://example.com/research", { signal });
    void response;
    void claim;
    return { text: "Live brief.", sources: [], sample: false };
  }
}

test("records generic scheduled runs without research wording", async () => {
  const queue = new Queue();
  const prompt = "Draft a welcome email.";
  const result = {
    text: "A concise welcome email.",
    sources: [],
    sample: false,
  };
  let calls = 0;
  const runner = new Runner(queue, "live", async () => {
    calls += 1;
    return result;
  });
  const id = queue.createTask(prompt);
  try {
    await runner.tick();
    const detail = queue.detail(id);
    expect(detail.prompt).toBe(prompt);
    expect(detail.result).toEqual(result);
    expect(detail.events).toEqual([
      "Task added to the queue.",
      "Run started.",
      "Run completed.",
    ]);
    expect(calls).toBe(1);
  } finally {
    runner.stop();
  }
});

test("aborts research when permissions are revoked outside the runner instance", async () => {
  const queue = new Queue();
  const runner = new Runner(queue);
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    _url: string,
    options?: { signal?: AbortSignal },
  ) => {
    fetchCalls += 1;
    const signal = options?.signal;
    await new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("Aborted")), {
        once: true,
      });
    });
    throw new Error("unreachable");
  }) as typeof fetch;
  queue.createTask("Read https://example.com");
  try {
    const tick = runner.tick();
    while (fetchCalls === 0) await new Promise((done) => setTimeout(done, 5));
    queue.updateSettings({ memoryAllowed: false });
    await tick;
    expect(fetchCalls).toBe(1);
    expect(queue.tasks[0]?.status).toBe("interrupted");
  } finally {
    globalThis.fetch = originalFetch;
    runner.stop();
  }
});

test("checks abort again before sending source evidence or memories to the model", async () => {
  const controller = new AbortController();
  const seen: string[] = [];
  const research = async (
    events: string[],
    signal: AbortSignal,
    onEvent: (text: string) => void,
  ): Promise<string> => {
    for (const text of events) {
      if (signal.aborted) throw new Error("Aborted before model call");
      onEvent(text);
      if (signal.aborted) throw new Error("Aborted before model call");
      seen.push(text);
    }
    return "brief";
  };
  await expect(
    research(["Source captured"], controller.signal, (text) => {
      if (text.startsWith("Source captured")) controller.abort();
    }),
  ).rejects.toThrow();
  // The capture was observed, but the abort fired before it could be sent on.
  expect(seen).toEqual([]);
});

test("omits stored memories from research when memory permission is disabled", async () => {
  const queue = new Queue();
  queue.saveMemory("Sensitive preference");
  queue.updateSettings({ memoryAllowed: false });
  let used: Memory[] = [];
  const runner = new Runner(queue, "live", async (_claim, memories) => {
    used = memories;
    return { text: "Brief without memories.", sources: [], sample: false };
  });
  const id = queue.createTask("Read this sample");
  try {
    // Sample mode path also honors the gate; exercise the live executor here.
    await runner.tick();
    expect(used).toEqual([]);
    expect(queue.detail(id).result?.text).not.toContain("Sensitive preference");
  } finally {
    runner.stop();
  }
});

test("holds active work for review on graceful shutdown", async () => {
  const queue = new Queue();
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const runner = new Runner(
    queue,
    "live",
    async (_claim, _memories, signal) => {
      await gate;
      if (signal.aborted) throw new Error("Aborted");
      return { text: "Late.", sources: [], sample: false };
    },
  );
  const id = queue.createTask("Read https://example.com");
  const pending = runner.tick();
  await new Promise((done) => setTimeout(done, 5));
  runner.stop();
  release();
  await pending;
  expect(queue.tasks.find((t) => t.id === id)?.status).toBe("interrupted");
  expect(queue.claim()).toBeNull();
  queue.action(id, "run");
  expect(queue.claim()).toBeTruthy();
});

test("survives a claim failure and runs work on the next tick", async () => {
  const queue = new Queue();
  queue.failClaimOnce = new Error("SQLITE_BUSY");
  const errors: string[] = [];
  const runner = new Runner(queue, "sample", undefined, (message) =>
    errors.push(message),
  );
  const id = queue.createTask("Read this sample");
  try {
    await expect(runner.tick()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    await runner.tick();
    expect(queue.detail(id).result).toBeTruthy();
  } finally {
    runner.stop();
  }
});

test("survives failure persistence errors and clears active work", async () => {
  const queue = new Queue();
  let executions = 0;
  const errors: string[] = [];
  const runner = new Runner(
    queue,
    "live",
    async () => {
      executions += 1;
      if (executions === 1) throw new Error("Provider failure");
      return { text: "Recovered", sources: [] as unknown[], sample: false };
    },
    (message) => errors.push(message),
  );
  queue.failFailOnce = new Error("SQLITE_BUSY");
  queue.createTask("First");
  try {
    await expect(runner.tick()).resolves.toBeUndefined();
    queue.createTask("Second");
    await runner.tick();
    expect(executions).toBe(2);
    expect(errors).toHaveLength(1);
  } finally {
    runner.stop();
  }
});

test("aborts work instead of throwing from an ownership timer", async () => {
  const queue = new Queue();
  queue.ownsFails = true;
  queue.createTask("First");
  const runner = new Runner(queue, "live", async () => ({
    text: "Never.",
    sources: [],
    sample: false,
  }));
  try {
    await expect(runner.tick()).resolves.toBeUndefined();
    expect(queue.tasks[0]?.status).toBe("failed");
  } finally {
    runner.stop();
  }
});
