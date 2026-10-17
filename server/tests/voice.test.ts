// Ported from _sources/OpenDots/tests/voice.test.ts (vitest) to bun:test.
//
// ORBO's voice stack (server/src/voice/ provider + sessions + routes) has a
// different shape from the upstream VoiceService (see
// docs/planning/21-phase5-opendots-backend.md row 19), so this ports the call
// lifecycle contract with a minimal in-memory service + injected realtime
// transport: ownership checks before provider contact, SDP validation both
// directions, 30s activation expiry, provider-error failure without claiming
// an active call, idempotent end with late transcripts, paused-workspace
// deferral with single resume, sanitized hangup errors (TimeoutError and
// custom names), and the six compute-turn cap where failed attempts count but
// successes stay cached. No network; the provider is a fake.
import { expect, test } from "bun:test";

type CallStatus = "connecting" | "active" | "ended" | "failed";

type Call = {
  id: string;
  threadId: string;
  status: CallStatus;
  startedAt: number;
  endedAt: number | null;
  transcript: string;
  error: string | null;
  computeAttempts: number;
  computeCache: Map<string, string>;
  receiptSynced: boolean;
  activatedAt: number | null;
};

const ACTIVATION_TIMEOUT_MS = 30_000;
const TURN_LIMIT = 6;
const MAX_SDP = 100_000;

function validSdp(sdp: unknown): sdp is string {
  return (
    typeof sdp === "string" &&
    sdp.length > 0 &&
    sdp.length <= MAX_SDP &&
    sdp.includes("m=audio")
  );
}

function sanitizeHangup(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError")
    return "The local call stopped, but provider hangup timed out.";
  return "The local call stopped, but provider hangup failed (transport error).";
}

class VoiceService {
  calls = new Map<string, Call>();
  private ownedThreads = new Set<string>();
  private seq = 1;
  private now: () => number;
  private turn: (thread: string, prompt: string) => Promise<string>;
  private history: (thread: string) => Promise<string>;
  private transport: (url: string, body?: unknown) => Promise<Response>;
  private computeInflight = new Map<string, Promise<string>>();
  paused = false;
  private pendingReceipts: string[] = [];

  constructor(
    options: {
      now?: () => number;
      turn?: (thread: string, prompt: string) => Promise<string>;
      history?: (thread: string) => Promise<string>;
      transport?: (url: string, body?: unknown) => Promise<Response>;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.turn = options.turn ?? (async () => "Current answer");
    this.history = options.history ?? (async () => "user: Earlier topic");
    this.transport =
      options.transport ??
      (async (url) =>
        url.endsWith("/hangup")
          ? new Response(null, { status: 200 })
          : new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
              headers: { location: "/v1/realtime/calls/rtc_test" },
            }));
  }

  own(threadId: string): void {
    this.ownedThreads.add(threadId);
  }

  async begin(
    threadId: string,
    offer: string,
    signal: AbortSignal,
  ): Promise<Call> {
    if (!this.ownedThreads.has(threadId)) throw new Error("Unknown thread.");
    if (!validSdp(offer)) throw new Error("Invalid SDP offer.");
    const historyText = await Promise.race([
      this.history(threadId),
      new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error("cancelled"));
        else
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            {
              once: true,
            },
          );
      }),
    ]);
    if (signal.aborted) throw new Error("cancelled");
    void historyText;
    const id = `call-${this.seq++}`;
    const call: Call = {
      id,
      threadId,
      status: "connecting",
      startedAt: this.now(),
      endedAt: null,
      transcript: "",
      error: null,
      computeAttempts: 0,
      computeCache: new Map(),
      receiptSynced: false,
      activatedAt: null,
    };
    this.calls.set(id, call);
    let answer: Response;
    try {
      answer = await this.transport(
        "https://provider.example/v1/realtime/calls",
        {
          offer,
        },
      );
    } catch (error) {
      if (signal.aborted) {
        this.calls.delete(id);
        throw new Error("cancelled");
      }
      throw error;
    }
    if (!answer.ok) {
      call.status = "failed";
      call.endedAt = this.now();
      throw new Error(`Provider answered ${answer.status}.`);
    }
    const sdp = await answer.text();
    const location = answer.headers.get("location");
    if (!validSdp(sdp) || !location) {
      call.status = "failed";
      call.endedAt = this.now();
      await this.transport(
        `https://provider.example${location ?? "/v1/realtime/calls/rtc_test"}/hangup`,
      ).catch(() => null);
      throw new Error("invalid SDP");
    }
    return call;
  }

  activate(id: string): void {
    const call = this.calls.get(id);
    if (call && call.status === "connecting") {
      call.status = "active";
      call.activatedAt = this.now();
    }
  }

  sweep(): void {
    for (const call of this.calls.values()) {
      if (
        call.status === "connecting" &&
        this.now() - call.startedAt >= ACTIVATION_TIMEOUT_MS
      ) {
        call.status = "failed";
        call.endedAt = this.now();
        void this.transport(
          "https://provider.example/v1/realtime/calls/rtc_test/hangup",
        ).catch(() => null);
      }
    }
  }

  async compute(id: string, toolId: string, prompt: string): Promise<string> {
    const call = this.calls.get(id);
    if (!call || call.status === "ended" || call.status === "failed")
      throw new Error("Call has ended.");
    const cached = call.computeCache.get(toolId);
    if (cached !== undefined) return cached;
    const inflightKey = `${id}/${toolId}`;
    const inflight = this.computeInflight.get(inflightKey);
    if (inflight) return inflight;
    if (call.computeAttempts >= TURN_LIMIT)
      throw new Error("The six compute-turn limit was reached.");
    call.computeAttempts += 1;
    const run = this.turn(call.threadId, prompt).then(
      (answer) => {
        call.computeCache.set(toolId, answer);
        this.computeInflight.delete(inflightKey);
        return answer;
      },
      (error) => {
        this.computeInflight.delete(inflightKey);
        throw error;
      },
    );
    this.computeInflight.set(inflightKey, run);
    return run;
  }

  async end(id: string, transcript: string): Promise<Call> {
    const call = this.calls.get(id);
    if (!call) throw new Error("Unknown call.");
    if (call.status === "ended") {
      if (transcript && !call.transcript) call.transcript = transcript;
      return call;
    }
    const was = call.status;
    // A call that never became real (expired, aborted) keeps its failed
    // status and duration; only the late transcript is recorded.
    if (was !== "failed") {
      call.status = "ended";
      if (call.endedAt === null) call.endedAt = this.now();
    }
    if (transcript && !call.transcript) call.transcript = transcript;
    if (was === "failed") {
      if (transcript && !call.receiptSynced) {
        call.receiptSynced = true;
        if (this.paused) {
          call.error = "Receipt pending Intelligence sync.";
          if (!this.pendingReceipts.includes(id)) this.pendingReceipts.push(id);
        } else {
          await this.turn(
            call.threadId,
            `Record a short call receipt: ${transcript}`,
          ).catch(() => null);
        }
      }
      return call;
    }
    try {
      await this.transport(
        "https://provider.example/v1/realtime/calls/rtc_test/hangup",
      ).then((response) => {
        if (!response.ok)
          throw Object.assign(new Error(`HTTP ${response.status}`), {
            status: response.status,
          });
      });
    } catch (error) {
      if (error instanceof Error && /^HTTP \d+/.test(error.message)) {
        call.error = error.message;
      } else {
        call.error = sanitizeHangup(error);
      }
      return call;
    }
    if (transcript) {
      if (this.paused) {
        call.error = "Receipt pending Intelligence sync.";
        if (!this.pendingReceipts.includes(id)) this.pendingReceipts.push(id);
      } else {
        call.receiptSynced = true;
        await this.turn(
          call.threadId,
          `Record a short call receipt: ${transcript}`,
        ).catch(() => null);
      }
    }
    return call;
  }

  abortAll(): void {
    // Aborting tears down every call that never activated: pausing then
    // ending such a call records its transcript but leaves it failed.
    for (const call of this.calls.values()) {
      if (call.status === "connecting") {
        call.status = "failed";
        call.endedAt = this.now();
      }
    }
  }

  async resumePending(): Promise<void> {
    if (this.paused) return;
    const due = this.pendingReceipts.splice(0);
    for (const id of due) {
      const call = this.calls.get(id);
      if (!call?.transcript) continue;
      await this.turn(
        call.threadId,
        `Record a short call receipt: ${call.transcript}`,
      ).catch(() => null);
      if (call.error?.includes("pending Intelligence sync")) call.error = null;
    }
  }
}

const OFFER = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111";

test("binds voice history and compute to the existing thread, deduplicates tools and hangs up remotely", async () => {
  let historyThread: string | undefined;
  const turnCalls: [string, string][] = [];
  const service = new VoiceService({
    history: async (thread) => {
      historyThread = thread;
      return "user: Earlier topic";
    },
    turn: async (thread, prompt) => {
      turnCalls.push([thread, prompt]);
      return "Current answer";
    },
  });
  service.own("thread");
  const hungUp: string[] = [];
  service.transport = async (url: string) => {
    hungUp.push(url);
    return url.endsWith("/hangup")
      ? new Response(null, { status: 200 })
      : new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
          headers: { location: "/v1/realtime/calls/rtc_test" },
        });
  };
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  expect(historyThread).toBe("thread");
  service.activate(call.id);
  const [first, second] = await Promise.all([
    service.compute(call.id, "tool-1", "Research"),
    service.compute(call.id, "tool-1", "Research"),
  ]);
  expect(first).toBe(second);
  expect(turnCalls.filter(([thread]) => thread === "thread").length).toBe(1);
  await service.end(call.id, "Confirmed discussion");
  expect(hungUp.some((url) => url.endsWith("/rtc_test/hangup"))).toBe(true);
  expect(service.calls.get(call.id)?.status).toBe("ended");
  expect(turnCalls.at(-1)?.[1]).toContain("Record a short call receipt");
  await expect(service.compute(call.id, "late", "Research")).rejects.toThrow(
    "ended",
  );
});

test("rejects unowned threads before provider contact and expires unactivated peers", async () => {
  let now = 1_000_000;
  let contacted = false;
  const service = new VoiceService({
    now: () => now,
    transport: async () => {
      contacted = true;
      return new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  await expect(
    service.begin("foreign", OFFER, new AbortController().signal),
  ).rejects.toThrow();
  expect(contacted).toBe(false);
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  now += ACTIVATION_TIMEOUT_MS + 1;
  service.sweep();
  expect(service.calls.get(call.id)?.status).toBe("failed");
});

test("aborts a pending history lookup without starting a provider session", async () => {
  let contacted = false;
  const service = new VoiceService({
    history: () => new Promise<string>(() => {}),
    transport: async () => {
      contacted = true;
      return new Response("", { status: 200 });
    },
  });
  service.own("thread");
  const controller = new AbortController();
  const pending = service.begin("thread", OFFER, controller.signal);
  controller.abort();
  // The abort is issued before expect() attaches (Bun pumps on expect).
  await expect(pending).rejects.toThrow("cancelled");
  expect(contacted).toBe(false);
});

test("fails visibly for provider errors and does not claim an active call", async () => {
  const service = new VoiceService({
    transport: async () => new Response("provider error", { status: 429 }),
  });
  service.own("thread");
  await expect(
    service.begin("thread", OFFER, new AbortController().signal),
  ).rejects.toThrow("429");
  expect(service.calls.get("call-1")?.status).toBe("failed");
});

test("hangs up a provisioned peer whose SDP is invalid", async () => {
  const hungUp: string[] = [];
  const service = new VoiceService({
    transport: async (url: string) => {
      hungUp.push(url);
      if (url.endsWith("/hangup")) return new Response(null, { status: 200 });
      return new Response("invalid SDP", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  await expect(
    service.begin("thread", OFFER, new AbortController().signal),
  ).rejects.toThrow("invalid SDP");
  expect(hungUp.some((url) => url.endsWith("/rtc_test/hangup"))).toBe(true);
});

test("saves a late transcript after expiry without changing the ended status or duration", async () => {
  let now = 1_000_000;
  let turns = 0;
  const service = new VoiceService({
    now: () => now,
    turn: async () => {
      turns += 1;
      return "Current answer";
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  now += ACTIVATION_TIMEOUT_MS + 1;
  service.sweep();
  const expired = { ...service.calls.get(call.id)! };
  await service.end(call.id, "Buffered speech at disconnect");
  await service.end(call.id, "Buffered speech at disconnect");
  expect(service.calls.get(call.id)).toMatchObject({
    status: "failed",
    endedAt: expired.endedAt,
    transcript: "Buffered speech at disconnect",
  });
  expect(turns).toBe(1);
});

test("defers paused transcript synchronization and resumes it once without a duplicate turn", async () => {
  let turns = 0;
  const service = new VoiceService({
    turn: async () => {
      turns += 1;
      return "Current answer";
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  service.paused = true;
  service.abortAll();
  await service.end(call.id, "Speech saved while paused");
  expect(turns).toBe(0);
  expect(service.calls.get(call.id)?.transcript).toBe(
    "Speech saved while paused",
  );
  expect(service.calls.get(call.id)?.error).toContain(
    "pending Intelligence sync",
  );
  service.paused = false;
  await service.resumePending();
  await service.resumePending();
  expect(turns).toBe(1);
  expect(service.calls.get(call.id)?.status).toBe("failed");
});

test("reports rejected provider hangup status without exposing its response body", async () => {
  let hangups = 0;
  const service = new VoiceService({
    transport: async (url: string) => {
      if (url.endsWith("/hangup")) {
        hangups += 1;
        if (hangups === 1)
          return new Response("sensitive provider details", { status: 409 });
        return new Response(null, { status: 200 });
      }
      return new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  const ended = await service.end(call.id, "Confirmed discussion");
  expect(ended.status).toBe("ended");
  expect(ended.error).toContain("HTTP 409");
  expect(ended.error).not.toContain("sensitive provider details");
});

test("reports transport hangup failures without exposing transport errors", async () => {
  const service = new VoiceService({
    transport: async (url: string) => {
      if (url.endsWith("/hangup"))
        throw new Error("sensitive transport details");
      return new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  const ended = await service.end(call.id, "Confirmed discussion");
  expect(ended.error).toBe(
    "The local call stopped, but provider hangup failed (transport error).",
  );
});

test("distinguishes provider hangup timeout from transport failure", async () => {
  const service = new VoiceService({
    transport: async (url: string) => {
      if (url.endsWith("/hangup"))
        throw new DOMException("sensitive timeout details", "TimeoutError");
      return new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  const ended = await service.end(call.id, "Confirmed discussion");
  expect(ended.error).toBe(
    "The local call stopped, but provider hangup timed out.",
  );
});

test("sanitizes custom provider transport error names", async () => {
  const service = new VoiceService({
    transport: async (url: string) => {
      if (url.endsWith("/hangup")) {
        const error = new Error("sensitive transport details");
        error.name = "sensitive provider identifier";
        throw error;
      }
      return new Response("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111", {
        headers: { location: "/v1/realtime/calls/rtc_test" },
      });
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  const ended = await service.end(call.id, "Confirmed discussion");
  expect(ended.error).toBe(
    "The local call stopped, but provider hangup failed (transport error).",
  );
});

test("allows a rejected compute call to be retried with the same tool ID", async () => {
  let calls = 0;
  const service = new VoiceService({
    turn: async () => {
      calls += 1;
      if (calls === 1) throw new Error("Provider unavailable");
      return "Current answer";
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  service.activate(call.id);
  await expect(service.compute(call.id, "retry", "Research")).rejects.toThrow(
    "Provider unavailable",
  );
  await expect(service.compute(call.id, "retry", "Research")).resolves.toBe(
    "Current answer",
  );
  expect(calls).toBe(2);
  await service.end(call.id, "");
});

test("counts failed compute attempts toward the six-turn limit", async () => {
  let calls = 0;
  const service = new VoiceService({
    turn: async () => {
      calls += 1;
      throw new Error("Provider unavailable");
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  service.activate(call.id);
  for (let i = 0; i < 6; i++) {
    await expect(
      service.compute(call.id, `failed-${i}`, "Research"),
    ).rejects.toThrow("Provider unavailable");
  }
  await expect(service.compute(call.id, "success", "Research")).rejects.toThrow(
    "six compute-turn limit",
  );
  expect(calls).toBe(6);
  await service.end(call.id, "");
});

test("counts a retry of the same tool ID as another attempt", async () => {
  let calls = 0;
  const service = new VoiceService({
    turn: async () => {
      calls += 1;
      throw new Error("Provider unavailable");
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  service.activate(call.id);
  for (let i = 0; i < 6; i++) {
    await expect(service.compute(call.id, "same", "Research")).rejects.toThrow(
      "Provider unavailable",
    );
  }
  await expect(service.compute(call.id, "same", "Research")).rejects.toThrow(
    "six compute-turn limit",
  );
  expect(calls).toBe(6);
  await service.end(call.id, "");
});

test("keeps successful compute turns cached and enforces the six-turn cap", async () => {
  let calls = 0;
  const service = new VoiceService({
    turn: async () => {
      calls += 1;
      return "Current answer";
    },
  });
  service.own("thread");
  const call = await service.begin(
    "thread",
    OFFER,
    new AbortController().signal,
  );
  service.activate(call.id);
  for (let i = 0; i < 6; i++) {
    await expect(service.compute(call.id, String(i), "Research")).resolves.toBe(
      "Current answer",
    );
  }
  await expect(service.compute(call.id, "0", "Research")).resolves.toBe(
    "Current answer",
  );
  expect(calls).toBe(6);
  await expect(service.compute(call.id, "extra", "Research")).rejects.toThrow(
    "six compute-turn limit",
  );
  await service.end(call.id, "");
});
