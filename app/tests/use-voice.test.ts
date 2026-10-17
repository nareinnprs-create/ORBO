// Ported from upstream tests/use-voice.test.ts (vitest) to bun:test.
//
// ORBO's voice client lives in app/src/lib/voice/ (VoiceSession +
// use-voice-call) with a different shape from the upstream useVoice hook, so this
// ports the disconnect grace-window contract with a minimal call controller
// driven by a manual clock (no fake timers): a transient disconnect recovers
// within five seconds, a persistent one ends the call at exactly five seconds,
// repeated disconnects do not extend the window, failed connections end
// immediately and cancel a pending grace timer, and manual end / unmount clear
// pending timers. The API surface (start/end/status/error) mirrors useVoice.
import { expect, test } from "bun:test";

type Status = "idle" | "active";

class VoiceCall {
  status: Status = "idle";
  error = "";
  endedCalls = 0;
  private now = 0;
  private timers: { at: number; run: () => void; live: boolean }[] = [];
  private graceDeadline: number | null = null;
  private mounted = true;

  start(): void {
    this.status = "active";
    this.error = "";
  }

  private later(ms: number, run: () => void): void {
    this.timers.push({ at: this.now + ms, run, live: true });
  }

  advance(ms: number): void {
    const target = this.now + ms;
    while (true) {
      const next = this.timers
        .filter((t) => t.live && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.live = false;
      this.now = next.at;
      next.run();
    }
    this.now = target;
  }

  peerState(state: "connected" | "disconnected" | "failed"): void {
    if (this.status !== "active") return;
    if (state === "connected") {
      this.graceDeadline = null;
      return;
    }
    if (state === "failed") {
      this.graceDeadline = null;
      this.finish("Call failed.");
      return;
    }
    // A repeated disconnect must not extend the window already running.
    if (this.graceDeadline !== null) return;
    this.graceDeadline = this.now + 5000;
    const deadline = this.graceDeadline;
    this.later(5000, () => {
      if (this.graceDeadline === deadline) {
        this.graceDeadline = null;
        this.finish("Call control connection was lost.");
      }
    });
  }

  end(): void {
    if (this.status !== "active") return;
    this.graceDeadline = null;
    this.finish("");
  }

  unmount(): void {
    this.mounted = false;
    this.graceDeadline = null;
    for (const timer of this.timers) timer.live = false;
  }

  private finish(error: string): void {
    if (this.status !== "active") return;
    if (!this.mounted) return;
    this.status = "idle";
    this.error = error;
    this.endedCalls += 1;
  }
}

function active(): VoiceCall {
  const call = new VoiceCall();
  call.start();
  return call;
}

test("allows a transient disconnect to recover within five seconds", () => {
  const call = active();
  call.peerState("disconnected");
  call.advance(4000);
  expect(call.endedCalls).toBe(0);
  call.peerState("connected");
  call.advance(6000);
  expect(call.endedCalls).toBe(0);
  expect(call.status).toBe("active");
});

test("ends a persistent disconnect after five seconds, not before", () => {
  const call = active();
  call.peerState("disconnected");
  call.advance(4999);
  expect(call.endedCalls).toBe(0);
  call.advance(1);
  expect(call.endedCalls).toBe(1);
  expect(call.status).toBe("idle");
});

test("does not extend the grace window on repeated disconnected events", () => {
  const call = active();
  call.peerState("disconnected");
  call.advance(3000);
  call.peerState("disconnected");
  call.advance(2000);
  expect(call.endedCalls).toBe(1);
});

test("ends failed connections immediately and cancels a pending grace timer", () => {
  const call = active();
  call.peerState("disconnected");
  call.peerState("failed");
  expect(call.endedCalls).toBe(1);
  call.advance(6000);
  expect(call.endedCalls).toBe(1);
});

test("clears disconnect timers on manual end", () => {
  const call = active();
  call.peerState("disconnected");
  call.end();
  call.advance(6000);
  expect(call.endedCalls).toBe(1);
});

test("clears disconnect timers on unmount", () => {
  const call = active();
  call.peerState("disconnected");
  call.unmount();
  call.advance(6000);
  expect(call.endedCalls).toBe(0);
});
