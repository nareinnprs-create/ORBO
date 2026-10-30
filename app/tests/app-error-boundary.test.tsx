import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  AppCrashScreen,
  AppErrorBoundary,
  RouteErrorScreen,
} from "@/components/app-error-boundary";

/**
 * A render crash above and beside the tool cards.
 *
 * Before the app boundary, a crash outside a tool card fell through to the router's raw default
 * error screen; a crash above the router blanked the document. These cases pin the branded
 * recoverable screen: the boundary shows it for a throwing child and recovers in place on retry,
 * and the router's `defaultErrorComponent` routes its reset through the router.
 *
 * The harness is this repository's (see `plugin-read-failure.test.tsx`): `GlobalRegistrator` in
 * `beforeAll`/`afterAll`, `cleanup` in `afterEach`.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

let shouldThrow = true;

/** A child that throws on purpose until the test says otherwise, so retry has something to recover into. */
function Bomb() {
  if (shouldThrow) {
    throw new Error("this component failed to draw on purpose");
  }
  return <p>the screen drew</p>;
}

test("a render crash shows the branded recoverable screen, and retry recovers in place", async () => {
  shouldThrow = true;
  const view = render(
    <AppErrorBoundary>
      <Bomb />
    </AppErrorBoundary>,
  );

  expect(await view.findByText(/could not draw this screen/)).toBeTruthy();
  expect(view.getByText("Reload")).toBeTruthy();

  shouldThrow = false;
  fireEvent.click(view.getByText("Try again"));
  expect(await view.findByText("the screen drew")).toBeTruthy();
  expect(view.queryByText(/could not draw this screen/)).toBeNull();
});

test("a child that is still broken gets the screen back rather than a blank page", async () => {
  shouldThrow = true;
  const view = render(
    <AppErrorBoundary>
      <Bomb />
    </AppErrorBoundary>,
  );
  await view.findByText(/could not draw this screen/);

  // Retry with the cause still there: the boundary catches the second throw too.
  fireEvent.click(view.getByText("Try again"));
  expect(await view.findByText(/could not draw this screen/)).toBeTruthy();
  expect(view.getByText("Reload")).toBeTruthy();
});

test("the router's error screen resets through the router's own reset", () => {
  let resets = 0;
  const view = render(
    <RouteErrorScreen
      reset={() => {
        resets += 1;
      }}
    />,
  );

  expect(view.getByText(/could not draw this screen/)).toBeTruthy();
  fireEvent.click(view.getByText("Try again"));
  expect(resets).toBe(1);
});

test("the crash screen offers reload, which is the browser's own way out", () => {
  let reloaded = false;
  const originalReload = window.location.reload;
  window.location.reload = () => {
    reloaded = true;
  };
  try {
    const view = render(<AppCrashScreen onRetry={() => {}} />);
    fireEvent.click(view.getByText("Reload"));
    expect(reloaded).toBe(true);
  } finally {
    window.location.reload = originalReload;
  }
});
