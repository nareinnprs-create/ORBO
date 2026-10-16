import { expect, test } from "bun:test";

interface Notices {
  refresh: string;
  capture: string;
  action: string;
}

interface PollFailure {
  ok: false;
  status?: number;
  message: string;
}

const TRANSPORT_MESSAGES = new Set(["Server returned an unreadable response."]);

// A failure that carries no HTTP status did not come from the API, so it is a
// network failure (fetch throws a TypeError whose text differs by browser).
function isTransportFailure(result: PollFailure): boolean {
  return (
    result.status === undefined ||
    result.status === 502 ||
    result.status === 504 ||
    TRANSPORT_MESSAGES.has(result.message)
  );
}

function visibleNotice(notices: Notices): string {
  return notices.action || notices.refresh || notices.capture;
}

function dismissNotice(notices: Notices): Notices {
  if (notices.action) return { ...notices, action: "" };
  if (notices.refresh) return { ...notices, refresh: "" };
  if (notices.capture) return { ...notices, capture: "" };
  return notices;
}

function applyRefreshResult(
  current: Notices,
  result: { ok: true } | PollFailure,
): Notices {
  if (result.ok) return current.refresh ? { ...current, refresh: "" } : current;
  if (result.status === 401) return current;
  if (current.refresh === result.message) return current;
  return { ...current, refresh: result.message };
}

function applyCaptureResult(
  current: Notices,
  result: { ok: true } | PollFailure,
): Notices {
  if (result.ok) return current.capture ? { ...current, capture: "" } : current;
  if (result.status === 401) return current;
  if (isTransportFailure(result)) {
    if (current.capture === result.message) return current;
    return { ...current, capture: result.message };
  }
  if (current.action === result.message) return current;
  return { ...current, action: result.message };
}

const none: Notices = { refresh: "", capture: "", action: "" };
const saved: Notices = { ...none, action: "Could not save." };

test("clears a recovered refresh error without wiping an action error", () => {
  const lost = applyRefreshResult(saved, {
    ok: false,
    message: "Server returned an unreadable response.",
    status: 502,
  });
  expect(lost).toEqual({
    refresh: "Server returned an unreadable response.",
    capture: "",
    action: "Could not save.",
  });
  expect(visibleNotice(lost)).toBe("Could not save.");
  expect(applyRefreshResult(lost, { ok: true })).toEqual(saved);
  expect(
    visibleNotice(
      applyRefreshResult({ ...none, refresh: "Failed to fetch" }, { ok: true }),
    ),
  ).toBe("");
});

test("keeps an unauthorized poll from replacing the connection notice", () => {
  const current: Notices = { ...none, refresh: "Failed to fetch" };
  expect(
    applyRefreshResult(current, {
      ok: false,
      status: 401,
      message: "Enter your owner access token to unlock.",
    }),
  ).toBe(current);
});

test("treats a capture transport failure as a capture notice and leaves save errors in place", () => {
  const lost = applyCaptureResult(saved, {
    ok: false,
    message: "Failed to fetch",
  });
  expect(lost.capture).toBe("Failed to fetch");
  expect(lost.action).toBe("Could not save.");
  expect(applyCaptureResult(lost, { ok: true })).toEqual(saved);

  const specific = applyCaptureResult(
    { ...none, capture: "Failed to fetch", action: "Could not save." },
    { ok: false, status: 500, message: "Thread not found." },
  );
  expect(specific.capture).toBe("Failed to fetch");
  expect(specific.action).toBe("Thread not found.");
  expect(applyRefreshResult(specific, { ok: true }).action).toBe(
    "Thread not found.",
  );
});

test("treats any failure without an HTTP status as a transport failure", () => {
  for (const message of [
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
  ]) {
    const lost = applyCaptureResult(none, { ok: false, message });
    expect(lost).toEqual({ ...none, capture: message });
    expect(applyCaptureResult(lost, { ok: true })).toEqual(none);
  }
});

test("keeps a failing refresh poll visible while capture polls succeed", () => {
  const failing = applyRefreshResult(none, {
    ok: false,
    status: 503,
    message: "Service unavailable.",
  });
  const afterCapture = applyCaptureResult(failing, { ok: true });
  expect(afterCapture.refresh).toBe("Service unavailable.");
  expect(visibleNotice(afterCapture)).toBe("Service unavailable.");
  expect(applyRefreshResult(afterCapture, { ok: true })).toEqual(none);
});

test("keeps a failing capture poll visible while refresh polls succeed", () => {
  const failing = applyCaptureResult(none, {
    ok: false,
    status: 504,
    message: "Gateway timeout.",
  });
  const afterRefresh = applyRefreshResult(failing, { ok: true });
  expect(afterRefresh.capture).toBe("Gateway timeout.");
  expect(applyCaptureResult(afterRefresh, { ok: true })).toEqual(none);
});

test("dismisses the visible notice and leaves the others", () => {
  const all: Notices = {
    refresh: "Service unavailable.",
    capture: "Failed to fetch",
    action: "Could not save.",
  };
  const first = dismissNotice(all);
  expect(first).toEqual({ ...all, action: "" });
  const second = dismissNotice(first);
  expect(second).toEqual({ ...all, action: "", refresh: "" });
  expect(dismissNotice(second)).toEqual(none);
});
