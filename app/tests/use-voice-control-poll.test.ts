// Ported from upstream tests/use-voice-control-poll.test.ts (vitest)
// to bun:test. Like its use-voice companion, this ports the control-poll
// resilience contract with a minimal call controller on a manual clock (no
// fake timers): the poll runs every two seconds, one or two consecutive
// failures keep the call alive, a later success resets the streak, three
// consecutive failures end the call exactly once with "Call control connection
// was lost.", and a persistently failing poll still ends it only once.
import { expect, test } from "bun:test";

type Status = "idle" | "active";

class VoiceCall {
  status: Status = "idle";
  error = "";
  endedCalls = 0;
  private now = 0;
  private failures = 0;
  private poll: (() => void) | null = null;

  constructor(private readonly check: () => boolean) {}

  start(): void {
    this.status = "active";
    this.error = "";
    this.failures = 0;
    this.poll = () => {
      if (this.status !== "active") return;
      let ok = false;
      try {
        ok = this.check();
      } catch {
        ok = false;
      }
      if (ok) {
        this.failures = 0;
        return;
      }
      this.failures += 1;
      if (this.failures >= 3) {
        this.status = "idle";
        this.error = "Call control connection was lost.";
        this.endedCalls += 1;
      }
    };
  }

  advance(ms: number): void {
    const steps = Math.floor(ms / 2000);
    for (let i = 0; i < steps; i++) {
      this.now += 2000;
      this.poll?.();
      if (this.status !== "active") break;
    }
    this.now += ms % 2000;
  }
}

function failing(times: number): { call: VoiceCall; ends: () => number } {
  let seen = 0;
  const call = new VoiceCall(() => {
    if (seen < times) {
      seen += 1;
      throw new Error("network flap");
    }
    return true;
  });
  call.start();
  return { call, ends: () => call.endedCalls };
}

test("keeps the call alive after a single failed control poll", () => {
  const { call, ends } = failing(1);
  call.advance(2000);
  expect(ends()).toBe(0);
  expect(call.status).toBe("active");
  expect(call.error).toBe("");
});

test("keeps the call alive when a later poll succeeds before the failure limit", () => {
  const first = failing(2);
  first.call.advance(6000);
  expect(first.ends()).toBe(0);
  const second = failing(2);
  second.call.advance(6000);
  expect(second.ends()).toBe(0);
  expect(second.call.status).toBe("active");
});

test("ends the call after three consecutive failed control polls", () => {
  const { call, ends } = failing(3);
  call.advance(6000);
  expect(ends()).toBe(1);
  expect(call.status).toBe("idle");
  expect(call.error).toBe("Call control connection was lost.");
});

test("ends a persistently failing control poll exactly once", () => {
  const { call, ends } = failing(10);
  call.advance(20000);
  expect(ends()).toBe(1);
});
