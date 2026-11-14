import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverlayControls } from "@/components/computer/computer-overlay-controls";
import type { ControlState } from "@/lib/computers/control";
import { settleReactWork } from "./settle-react-work";

/**
 * The takeover states of the full-size screen: what the bar says while a request is pending,
 * granted, verified, or did not go through — and the pause and secret controls around it.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const state = (overrides: Partial<ControlState> = {}): ControlState => ({
  holder: "bot",
  since: "2026-01-01T00:00:00Z",
  requested: false,
  transitioning: false,
  resumeSnapshotRequired: false,
  ...overrides,
});

const WAITING: ControlState = state({
  requested: true,
  reason: "The page is asking you to sign in.",
  request: {
    id: "r1",
    reason: "The page is asking you to sign in.",
    source: "model",
    status: "waiting",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
});

const SECRET_WANTED = state({ secretWanted: "password" });

const calls: string[] = [];
/** One control computer per test: the store is keyed by id and outlives a test otherwise. */
let computerId = "c0";
function serving(control: ControlState) {
  computerId = `c${calls.length}-x`;
  calls.length = 0;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/control/cancel")) {
      calls.push(`${init?.method ?? "GET"} ${url} ${String(init?.body ?? "")}`);
      return Response.json(control);
    }
    if (url.includes("/human/secret")) {
      calls.push(`${init?.method ?? "GET"} ${url} ${String(init?.body ?? "")}`);
      return Response.json({ ok: true });
    }
    if (url.endsWith("/control")) return Response.json(control);
    return Response.json({});
  }) as unknown as typeof fetch;
}

function draw(props?: Partial<Parameters<typeof OverlayControls>[0]>) {
  const onPauseChange = (paused: boolean) => {
    calls.push(`pause ${paused}`);
  };
  return render(
    <OverlayControls
      computerId={computerId}
      canPause={false}
      paused={false}
      onPauseChange={onPauseChange}
      {...props}
    />,
  );
}

test("a pending request names itself and cancelling posts the request id", async () => {
  serving(WAITING);
  const view = draw();
  expect(await view.findByText(/Takeover requested\./)).toBeTruthy();
  expect(
    await view.findByText(/The page is asking you to sign in\./),
  ).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Cancel request" }));
  await waitFor(() => expect(calls.join("\n")).toContain("/control/cancel"));
  expect(calls.join("\n")).toContain("r1");
});

test("a held wheel is said plainly", async () => {
  serving(state({ holder: "human" }));
  const view = draw();
  expect(
    await view.findByText(/You have control — click and type on the page\./),
  ).toBeTruthy();
  expect(view.queryByRole("button", { name: "Cancel request" })).toBeNull();
});

test("a request that did not go through says so", async () => {
  serving(
    state({
      request: {
        id: "r2",
        reason: "Sign in.",
        source: "model",
        status: "expired",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    }),
  );
  const view = draw();
  expect(await view.findByText(/did not go through/)).toBeTruthy();
});

test("a wanted secret offers the form, and sending posts the value to the page", async () => {
  serving(SECRET_WANTED);
  const view = draw();
  const field = await view.findByPlaceholderText(
    "Typed here, never shown to the assistant",
  );
  // Typed rather than set: a dispatched change event does not drive React state here.
  await userEvent.type(field, "hunter2");
  // A click on the submit button does not synthesize the form's submit event; submit the form.
  fireEvent.submit(field.closest("form") as HTMLFormElement);
  await waitFor(() => expect(calls.join("\n")).toContain("/human/secret"));
  expect(calls.join("\n")).toContain("hunter2");
});

test("the pause control only exists when there is a live view, and reports its state", async () => {
  serving(state());
  expect(
    draw({ canPause: false }).queryByRole("button", {
      name: "Pause live view",
    }),
  ).toBeNull();
  const view = draw({ canPause: true });
  fireEvent.click(await view.findByRole("button", { name: "Pause live view" }));
  await waitFor(() => expect(calls.join("\n")).toContain("pause true"));
  expect(
    draw({ canPause: true, paused: true }).getByRole("button", {
      name: "Resume live view",
    }),
  ).toBeTruthy();
});
