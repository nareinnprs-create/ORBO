import { expect, mock, test } from "bun:test";

/** Keeps asynchronous chat setup tied to the page and specialist that requested it. */
class PageChatRequests {
  private scope = "";
  private generation = 0;
  select(scope: string) {
    if (scope !== this.scope) {
      this.scope = scope;
      this.generation++;
    }
  }
  async run<T>(
    scope: string,
    load: () => Promise<T>,
    callbacks: {
      success: (value: T) => void;
      failure: (error: unknown) => void;
      settled: () => void;
    },
  ) {
    if (scope !== this.scope) return;
    const generation = ++this.generation;
    const current = () =>
      this.scope === scope && this.generation === generation;
    try {
      const value = await load();
      if (current()) callbacks.success(value);
    } catch (error) {
      if (current()) callbacks.failure(error);
    } finally {
      if (current()) callbacks.settled();
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test.each(["page-b:dot-a", "page-a:dot-b"])(
  "ignores an old page-chat response after selecting %s",
  async (nextScope) => {
    const requests = new PageChatRequests();
    requests.select("page-a:dot-a");
    const old = deferred<string>();
    const success = mock(() => {});
    const failure = mock(() => {});
    const settled = mock(() => {});
    const pending = requests.run("page-a:dot-a", () => old.promise, {
      success,
      failure,
      settled,
    });
    requests.select(nextScope);
    old.resolve("thread-a");
    await pending;
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  },
);

test("ignores stale errors and completion without clearing a newer request busy state", async () => {
  const requests = new PageChatRequests();
  requests.select("page-a:dot-a");
  const old = deferred<string>();
  const latest = deferred<string>();
  const success = mock((_value: string) => {});
  const failure = mock((_error: unknown) => {});
  const settled = mock(() => {});
  const first = requests.run("page-a:dot-a", () => old.promise, {
    success,
    failure,
    settled,
  });
  requests.select("page-b:dot-a");
  const second = requests.run("page-b:dot-a", () => latest.promise, {
    success,
    failure,
    settled,
  });
  old.reject(new Error("Old request failed"));
  await first;
  expect(failure).not.toHaveBeenCalled();
  expect(settled).not.toHaveBeenCalled();
  latest.resolve("thread-b");
  await second;
  expect(success).toHaveBeenCalledWith("thread-b");
  expect(settled).toHaveBeenCalledTimes(1);
});
