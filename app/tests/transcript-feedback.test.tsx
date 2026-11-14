import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ChatTranscript } from "@/components/channels/chat-transcript";
import { settleReactWork } from "./settle-react-work";

/*
 * The thumbs row under the last answer. It is LOCAL STATE ONLY — no endpoint exists to receive a
 * message rating — so what is pinned here is the drawing and the clearing, not any persistence:
 * the row appears when a turn is over and the Bot answered, hides while the Bot is working or when
 * it has not spoken, and a new turn takes the old vote back.
 *
 * The harness is `transcript-attachments.test.tsx`'s, minus its fetch stub: these messages carry no
 * attachments, so the transcript makes no requests at all.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

let idCounter = 0;

function assistant(text: string): Message {
  idCounter += 1;
  return { id: `assistant-${idCounter}`, role: "assistant", content: text };
}

function user(text: string): Message {
  idCounter += 1;
  return { id: `user-${idCounter}`, role: "user", content: text };
}

function renderTranscript(messages: Message[], props: { busy?: boolean } = {}) {
  return render(<ChatTranscript busy={props.busy} messages={messages} />);
}

test("thumbs sit under the answer once the turn is over", () => {
  const { getByLabelText } = renderTranscript([assistant("Here you go.")]);

  expect(getByLabelText("Mark this answer as helpful")).toBeTruthy();
  expect(getByLabelText("Mark this answer as unhelpful")).toBeTruthy();
});

test("a vote replaces the buttons with a quiet acknowledgement", () => {
  const { getByLabelText, getByRole, queryByLabelText } = renderTranscript([
    assistant("Here you go."),
  ]);

  fireEvent.click(getByLabelText("Mark this answer as helpful"));

  expect(getByRole("status").textContent).toBe("Thanks — noted.");
  expect(queryByLabelText("Mark this answer as helpful")).toBeNull();
});

test("the thumbs hide while the Bot still has the turn", () => {
  const { container } = renderTranscript([assistant("Here you go.")], {
    busy: true,
  });

  expect(
    container.querySelector('[data-testid="transcript-feedback"]'),
  ).toBeNull();
});

test("a Bot that has not spoken is not asked how its answer was", () => {
  const { container } = renderTranscript([user("Hello?")]);

  expect(
    container.querySelector('[data-testid="transcript-feedback"]'),
  ).toBeNull();
});

test("a new turn takes the old vote back", () => {
  const view = renderTranscript([assistant("First answer.")]);
  fireEvent.click(view.getByLabelText("Mark this answer as helpful"));
  expect(view.getByRole("status").textContent).toBe("Thanks — noted.");

  view.rerender(
    <ChatTranscript
      busy={false}
      messages={[assistant("First answer."), assistant("Second answer.")]}
    />,
  );

  expect(view.getByLabelText("Mark this answer as helpful")).toBeTruthy();
  expect(view.queryByRole("status")).toBeNull();
});
