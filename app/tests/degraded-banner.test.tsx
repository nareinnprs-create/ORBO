import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { DegradedBanner } from "@/components/layout/degraded-banner";
import { healthKeys, healthQueryOptions } from "@/lib/health/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * The degraded-mode banner and the /health read under it.
 *
 * The app never read /health before this; the banner is the consumer, so its branching — healthy,
 * degraded per dependency, and an answer too broken to read — is pinned at both layers: the query's
 * snapshot, and what the banner says for it.
 *
 * THE HARNESS IS THIS REPOSITORY'S. `GlobalRegistrator` in `beforeAll`/`afterAll`, `cleanup` in
 * `afterEach`, matching `agent-roster-error.test.tsx` for the reason recorded there.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = originalFetch;
});

/** A client the query settles on in one attempt, so a 503 is not retried into a long wait. */
function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderBanner(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <DegradedBanner />
    </QueryClientProvider>,
  );
}

test("a healthy /health reads as ok with nothing degraded", async () => {
  global.fetch = (async () =>
    Response.json(
      {
        ok: true,
        latencyMs: 3,
        database: { ok: true, latencyMs: 2 },
        intelligence: { ok: true, latencyMs: 1 },
      },
      { status: 200 },
    )) as unknown as typeof fetch;

  const queryClient = freshClient();
  const snapshot = await queryClient.fetchQuery(healthQueryOptions());

  expect(snapshot).toEqual({ ok: true, degraded: [] });
});

test("a 503 with the report in the body names the degraded dependencies", async () => {
  global.fetch = (async () =>
    Response.json(
      {
        ok: false,
        latencyMs: 5000,
        database: { ok: true, latencyMs: 2 },
        intelligence: {
          ok: false,
          latencyMs: 5000,
          error: "No answer from Intelligence in 5000ms.",
        },
      },
      { status: 503 },
    )) as unknown as typeof fetch;

  const queryClient = freshClient();
  const snapshot = await queryClient.fetchQuery(healthQueryOptions());

  expect(snapshot.ok).toBe(false);
  expect(snapshot.degraded).toEqual([
    {
      name: "intelligence",
      error: "No answer from Intelligence in 5000ms.",
    },
  ]);
});

test("an unparseable answer still reads as degraded, without inventing a reason", async () => {
  global.fetch = (async () =>
    new Response("not json", { status: 503 })) as unknown as typeof fetch;

  const queryClient = freshClient();
  const snapshot = await queryClient.fetchQuery(healthQueryOptions());

  expect(snapshot.ok).toBe(false);
  // A body this app cannot read names no dependency truthfully, so the banner stays generic.
  expect(snapshot.degraded).toEqual([{ name: "database" }]);
});

test("a degraded report raises the banner, naming the runtime", async () => {
  const queryClient = freshClient();
  queryClient.setQueryData(healthKeys.report(), {
    ok: false,
    degraded: [{ name: "intelligence" }],
  });

  const view = renderBanner(queryClient);
  expect(
    await view.findByText(
      "The model runtime is not answering, so parts of ORBO may not work right now.",
    ),
  ).toBeTruthy();
});

test("a healthy report raises no banner", async () => {
  const queryClient = freshClient();
  queryClient.setQueryData(healthKeys.report(), { ok: true, degraded: [] });

  const view = renderBanner(queryClient);
  await waitFor(() => {
    expect(queryClient.getQueryState(healthKeys.report())?.status).toBe(
      "success",
    );
  });
  expect(view.queryByRole("alert")).toBeNull();
});

test("a raised banner can be dismissed for the visit", async () => {
  const queryClient = freshClient();
  queryClient.setQueryData(healthKeys.report(), {
    ok: false,
    degraded: [{ name: "database", error: "Too many connections." }],
  });

  const view = renderBanner(queryClient);
  await view.findByRole("alert");
  // Two dependencies' reasons join into the one sentence.
  expect(view.getByText(/Too many connections\./)).toBeTruthy();

  fireEvent.click(
    view.getByRole("button", { name: "Dismiss the degraded-service notice" }),
  );
  await waitFor(() => {
    expect(view.queryByRole("alert")).toBeNull();
  });
});
