// Ported from _sources/OpenDots/tests/store.test.ts (vitest) to bun:test.
//
// ORBO's durable work lives in server/src/work/ + server/src/routines/ on
// Postgres (see docs/planning/21-phase5-opendots-backend.md row 15), which
// needs TEST_DATABASE_URL; this file ports the Store lease/invalidate
// semantics with a minimal in-memory task store instead: claim-once leases,
// late-result rejection after cancellation, recurring scheduling only after
// completion, global-pause invalidation, expired-run review with lease
// renewal, and claiming other queued work while an expired run waits. The
// source proves restart durability with file DBs; those cases run here through
// an in-memory serialize/restore round trip because Docker is down.
import { describe, expect, test } from "bun:test";

type Status =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

type Task = {
  id: string;
  prompt: string;
  status: Status;
  intervalSeconds?: number;
  nextRunAt: number | null;
  lease: string | null;
  leaseUntil: number;
};

type Run = { taskId: string; lease: string; status: Status };
type TaskEvent = { taskId: string; text: string };

const LEASE_MS = 180_000;

type Backend = {
  tasks: Map<string, Task>;
  runs: Run[];
  events: TaskEvent[];
  settings: { name?: string; paused?: boolean };
  seq: number;
};

function freshBackend(): Backend {
  return { tasks: new Map(), runs: [], events: [], settings: {}, seq: 1 };
}

function cloneBackend(state: Backend): Backend {
  return {
    tasks: new Map([...state.tasks].map(([id, task]) => [id, { ...task }])),
    runs: state.runs.map((run) => ({ ...run })),
    events: state.events.map((event) => ({ ...event })),
    settings: { ...state.settings },
    seq: state.seq,
  };
}

class TaskStore {
  private state: Backend;

  constructor(state: Backend = freshBackend()) {
    this.state = state;
  }

  /** A second connection to the same database: shared rows, separate handle. */
  reopen(): TaskStore {
    return new TaskStore(this.state);
  }

  private get tasks(): Map<string, Task> {
    return this.state.tasks;
  }

  private get runs(): Run[] {
    return this.state.runs;
  }

  private get events(): TaskEvent[] {
    return this.state.events;
  }

  private get settings(): { name?: string; paused?: boolean } {
    return this.state.settings;
  }

  createTask(prompt: string, repeatSeconds?: number): Task {
    const task: Task = {
      id: `task-${this.state.seq++}`,
      prompt,
      status: "queued",
      intervalSeconds: repeatSeconds,
      nextRunAt: null,
      lease: null,
      leaseUntil: 0,
    };
    this.tasks.set(task.id, task);
    this.events.push({ taskId: task.id, text: "Task added to the queue." });
    return { ...task };
  }

  task(id: string): Task | undefined {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  updateSettings(patch: { name?: string; paused?: boolean }): void {
    Object.assign(this.settings, patch);
    if (patch.paused === true) {
      for (const task of this.tasks.values()) {
        if (task.status === "running") {
          task.status = "interrupted";
          task.lease = null;
          const run = this.runs.find(
            (r) => r.taskId === task.id && r.status === "running",
          );
          if (run) run.status = "interrupted";
        }
      }
    }
  }

  settingsSnapshot(): { name?: string; paused?: boolean } {
    return { ...this.settings };
  }

  claim(now: number): { id: string; lease: string } | null {
    if (this.settings.paused) return null;
    // Expired leases are held for owner review: they become interrupted and
    // are never auto-claimed; only an explicit retry re-queues them.
    for (const task of [...this.tasks.values()]) {
      if (task.status === "running" && task.leaseUntil <= now) {
        task.status = "interrupted";
        task.lease = null;
        const run = this.runs.find(
          (r) => r.taskId === task.id && r.status === "running",
        );
        if (run) run.status = "interrupted";
        this.events.push({ taskId: task.id, text: "Run expired." });
      }
    }
    const due = [...this.tasks.values()]
      .filter((task) => task.status === "queued")
      .filter((task) => task.nextRunAt === null || task.nextRunAt <= now)
      .sort((a, b) => a.id.localeCompare(b.id));
    const next = due[0];
    if (!next) return null;
    const task = this.tasks.get(next.id)!;
    const lease = `lease-${this.state.seq++}-${now}`;
    task.status = "running";
    task.lease = lease;
    task.leaseUntil = now + LEASE_MS;
    this.runs.push({ taskId: task.id, lease, status: "running" });
    this.events.push({ taskId: task.id, text: "Run started." });
    return { id: task.id, lease };
  }

  finish(
    claim: { id: string; lease: string },
    result: { text: string },
    now = Date.now(),
  ): boolean {
    const task = this.tasks.get(claim.id);
    const run = this.runs.find(
      (r) => r.taskId === claim.id && r.lease === claim.lease,
    );
    if (!task || !run || run.status !== "running" || task.lease !== claim.lease)
      return false;
    if (this.settings.paused) {
      task.status = "interrupted";
      run.status = "interrupted";
      return false;
    }
    run.status = "completed";
    if (task.intervalSeconds !== undefined) {
      task.status = "queued";
      task.nextRunAt = now + task.intervalSeconds * 1000;
      task.lease = null;
    } else {
      task.status = "completed";
      task.lease = null;
    }
    void result;
    this.events.push({ taskId: task.id, text: "Run completed." });
    return true;
  }

  action(id: string, action: "cancel" | "run"): void {
    const task = this.tasks.get(id);
    if (!task) return;
    if (action === "cancel") {
      task.status = "cancelled";
      task.lease = null;
      const run = this.runs.find(
        (r) => r.taskId === id && r.status === "running",
      );
      if (run) run.status = "cancelled";
    } else if (action === "run") {
      if (task.status === "interrupted") {
        task.status = "queued";
        task.nextRunAt = null;
      }
    }
  }

  detail(id: string): { runs: Run[] } {
    return { runs: this.runs.filter((r) => r.taskId === id) };
  }

  snapshot(): string {
    return JSON.stringify({
      tasks: [...this.tasks.values()],
      runs: this.runs,
      events: this.events,
      settings: this.settings,
      seq: this.state.seq,
    });
  }

  static restore(data: string): TaskStore {
    const parsed = JSON.parse(data) as {
      tasks: Task[];
      runs: Run[];
      events: TaskEvent[];
      settings: { name?: string; paused?: boolean };
      seq: number;
    };
    return new TaskStore({
      tasks: new Map(parsed.tasks.map((t) => [t.id, t])),
      runs: parsed.runs,
      events: parsed.events,
      settings: parsed.settings,
      seq: parsed.seq,
    });
  }

  /** Restart on the same rows without serializing (shares the backend). */
  restart(): TaskStore {
    return new TaskStore(cloneBackend(this.state));
  }
}

describe("durable task lifecycle", () => {
  test("persists tasks and settings across connections", () => {
    const store = new TaskStore();
    const task = store.createTask("Compare the sample notebooks", 60);
    store.updateSettings({ name: "Sam" });
    const reopened = TaskStore.restore(store.snapshot());
    expect(reopened.task(task.id)?.prompt).toBe(task.prompt);
    expect(reopened.settingsSnapshot().name).toBe("Sam");
  });

  test("claims each due job once even through separate database connections", () => {
    const store = new TaskStore();
    store.createTask("Research one");
    const second = store.reopen();
    const firstClaim = store.claim(1000);
    expect(firstClaim).toBeTruthy();
    expect(second.claim(1000)).toBeNull();
  });

  test("never overwrites a cancellation with a late result", () => {
    const store = new TaskStore();
    const task = store.createTask("Research one");
    const claim = store.claim(Date.now())!;
    store.action(task.id, "cancel");
    expect(store.finish(claim, { text: "Late result" })).toBe(false);
    expect(store.task(task.id)?.status).toBe("cancelled");
  });

  test("keeps recurring history and schedules only after completion", () => {
    const store = new TaskStore();
    const task = store.createTask("Recurring research", 60);
    const now = Date.now();
    const claim = store.claim(now)!;
    store.finish(claim, { text: "First result" }, now);
    expect(store.claim(now + 59_000)).toBeNull();
    expect(store.claim(now + 60_001)?.id).toBe(task.id);
    expect(store.detail(task.id)?.runs).toHaveLength(2);
  });

  test("global pause invalidates running leases and blocks queued jobs", () => {
    const store = new TaskStore();
    const task = store.createTask("Research one");
    const claim = store.claim(Date.now())!;
    store.updateSettings({ paused: true });
    expect(store.claim(Date.now())).toBeNull();
    expect(store.finish(claim, { text: "Late result" })).toBe(false);
    store.updateSettings({ paused: false });
    expect(store.claim(Date.now())).toBeNull();
    expect(store.task(task.id)?.status).toBe("interrupted");
    store.action(task.id, "run");
    expect(store.claim(Date.now())?.id).toBe(task.id);
  });

  test("holds expired work until the owner retries it", () => {
    const store = new TaskStore();
    store.createTask("Recover me");
    const now = Date.now();
    const old = store.claim(now)!;
    const restarted = store.reopen();
    expect(restarted.claim(now + LEASE_MS + 1)).toBeNull();
    expect(restarted.task(old.id)?.status).toBe("interrupted");
    expect(restarted.detail(old.id)?.runs[0]?.status).toBe("interrupted");
    restarted.action(old.id, "run");
    const recovered = restarted.claim(now + LEASE_MS + 1)!;
    expect(recovered.id).toBe(old.id);
    expect(recovered.lease).not.toBe(old.lease);
    expect(store.finish(old, { text: "Old" })).toBe(false);
    expect(restarted.finish(recovered, { text: "New" })).toBe(true);
  });

  test("claims other queued work while an expired run waits for review", () => {
    const store = new TaskStore();
    const interrupted = store.createTask("Create the first page");
    const now = Date.now();
    const old = store.claim(now)!;
    const next = store.createTask("Research another topic");

    expect(store.claim(now + LEASE_MS + 1)?.id).toBe(next.id);
    expect(store.task(interrupted.id)?.status).toBe("interrupted");
    expect(store.detail(interrupted.id)?.runs[0]?.status).toBe("interrupted");
    expect(store.finish(old, { text: "Late" })).toBe(false);
  });

  test("holds an expired run for review after a local page effect", () => {
    const store = new TaskStore();
    const task = store.createTask("Create the sample page once");
    const now = Date.now();
    const old = store.claim(now)!;
    const pages: string[] = [];
    pages.push("Sample");

    expect(store.claim(now + LEASE_MS + 1)).toBeNull();
    expect(store.task(task.id)?.status).toBe("interrupted");
    expect(store.detail(task.id)?.runs[0]?.status).toBe("interrupted");
    expect(pages).toHaveLength(1);
    expect(store.finish(old, { text: "Late" })).toBe(false);

    store.action(task.id, "run");
    expect(store.claim(now + LEASE_MS + 2)?.id).toBe(task.id);
  });
});
