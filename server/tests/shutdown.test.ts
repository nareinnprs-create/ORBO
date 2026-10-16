import { afterEach, expect, jest, mock, test } from "bun:test";

function createShutdown(options: {
  stopRunner: () => void;
  stopPlatform: () => Promise<void>;
  closeServer: () => Promise<void>;
  exit: (code: number) => void;
  report: (operation: string, error: unknown) => void;
  timeoutMs?: number;
}) {
  let pending: Promise<void> | undefined;
  return () =>
    (pending ??= (async () => {
      let failed = false;
      const report = (operation: string, error: unknown) => {
        failed = true;
        options.report(operation, error);
      };
      try {
        options.stopRunner();
      } catch (error) {
        report("Stopping scheduler failed", error);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          report("Shutdown deadline exceeded", new Error("Timeout"));
          resolve();
        }, options.timeoutMs ?? 8000);
      });
      const settle = async (operation: string, action: () => Promise<void>) => {
        try {
          await action();
        } catch (error) {
          report(operation, error);
        }
      };
      await Promise.race([
        Promise.all([
          settle("Stopping Channels failed", options.stopPlatform),
          settle("Closing HTTP server failed", options.closeServer),
        ]),
        deadline,
      ]);
      clearTimeout(timer);
      options.exit(failed ? 1 : 0);
    })());
}

afterEach(() => {
  jest.useRealTimers();
});

test("waits for Channels and HTTP shutdown and handles repeated signals once", async () => {
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stopRunner = mock(() => {});
  const stopPlatform = mock(() => wait);
  const closeServer = mock(async () => {});
  const exit = mock((_code: number) => {});
  const report = mock((_operation: string, _error: unknown) => {});
  const shutdown = createShutdown({
    stopRunner,
    stopPlatform,
    closeServer,
    exit,
    report,
  });
  const first = shutdown();
  const second = shutdown();
  expect(first).toBe(second);
  await Promise.resolve();
  expect(exit).not.toHaveBeenCalled();
  finish();
  await first;
  expect(stopRunner).toHaveBeenCalledTimes(1);
  expect(stopPlatform).toHaveBeenCalledTimes(1);
  expect(closeServer).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(0);
});

test("bounds a stuck shutdown and reports operation failures without stopping other cleanup", async () => {
  jest.useFakeTimers();
  const exit = mock((_code: number) => {});
  const report = mock((_operation: string, _error: unknown) => {});
  const closeServer = mock(async () => {});
  const shutdown = createShutdown({
    stopRunner: () => {
      throw new Error("secret");
    },
    stopPlatform: () => new Promise<void>(() => {}),
    closeServer,
    exit,
    report,
    timeoutMs: 100,
  });
  const pending = shutdown();
  jest.advanceTimersByTime(100);
  await pending;
  expect(closeServer).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(1);
  expect(report).toHaveBeenCalledTimes(2);
});
