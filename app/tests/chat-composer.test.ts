import { expect, mock, test } from "bun:test";

function shouldSubmitComposerOnKeyDown(event: {
  key: string;
  shiftKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
    keyCode?: number;
  };
}) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

function submitComposerOnEnter(
  event: Parameters<typeof shouldSubmitComposerOnKeyDown>[0] & {
    preventDefault(): void;
    currentTarget: { form?: { requestSubmit(): void } | null };
  },
  canSubmit: boolean,
) {
  if (!shouldSubmitComposerOnKeyDown(event)) return;
  event.preventDefault();
  if (canSubmit) event.currentTarget.form?.requestSubmit();
}

function keyEvent({
  key = "Enter",
  shiftKey = false,
  isComposing = false,
  keyCode,
}: {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
} = {}) {
  return {
    key,
    shiftKey,
    nativeEvent: {
      isComposing,
      keyCode,
    },
  };
}

test("does not submit Enter while IME composition is active", () => {
  expect(shouldSubmitComposerOnKeyDown(keyEvent({ isComposing: true }))).toBe(
    false,
  );
});

test("does not submit legacy IME composition Enter events", () => {
  expect(shouldSubmitComposerOnKeyDown(keyEvent({ keyCode: 229 }))).toBe(false);
});

test("submits Enter after composition completes", () => {
  expect(shouldSubmitComposerOnKeyDown(keyEvent())).toBe(true);
});

test("keeps Shift+Enter available for multiline drafts", () => {
  expect(shouldSubmitComposerOnKeyDown(keyEvent({ shiftKey: true }))).toBe(
    false,
  );
});

function enterEvent(init: Parameters<typeof keyEvent>[0] = {}) {
  const requestSubmit = mock(() => {});
  const preventDefault = mock(() => {});
  return {
    requestSubmit,
    preventDefault,
    event: {
      ...keyEvent(init),
      preventDefault,
      currentTarget: { form: { requestSubmit } },
    },
  };
}

test("submits the form when Enter is pressed in the home composer", () => {
  const { event, requestSubmit, preventDefault } = enterEvent();
  submitComposerOnEnter(event, true);
  expect(preventDefault).toHaveBeenCalled();
  expect(requestSubmit).toHaveBeenCalledTimes(1);
});

test("keeps Enter from adding a line but does not submit an empty or busy composer", () => {
  const { event, requestSubmit, preventDefault } = enterEvent();
  submitComposerOnEnter(event, false);
  expect(preventDefault).toHaveBeenCalled();
  expect(requestSubmit).not.toHaveBeenCalled();
});

test("leaves Shift+Enter alone so it still inserts a newline", () => {
  const { event, requestSubmit, preventDefault } = enterEvent({
    shiftKey: true,
  });
  submitComposerOnEnter(event, true);
  expect(preventDefault).not.toHaveBeenCalled();
  expect(requestSubmit).not.toHaveBeenCalled();
});
