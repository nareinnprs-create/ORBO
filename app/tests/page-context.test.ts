import { expect, test } from "bun:test";

interface Page {
  id: string;
  spaceId: string;
  title: string;
}

type PageContext = Pick<Page, "id" | "spaceId" | "title">;

function contextualMessage(
  text: string,
  context: PageContext | null | undefined,
) {
  if (context === undefined)
    throw new Error(
      "Conversation context has not loaded. Retry before sending.",
    );
  return context
    ? `From [${context.title.replace(/[[\]\\\r\n]/g, "")}](/#/spaces/${context.spaceId}/pages/${context.id}):\n\n${text}`
    : text;
}

test("cannot send a page message before the authoritative context request completes", () => {
  expect(() => contextualMessage("Review this", undefined)).toThrow(/context/);
  expect(
    contextualMessage("Review this", {
      id: "page",
      spaceId: "space",
      title: "Notes",
    }),
  ).toBe("From [Notes](/#/spaces/space/pages/page):\n\nReview this");
});

test("allows ordinary chat only after the server explicitly returns no page context", () => {
  expect(contextualMessage("Hello", null)).toBe("Hello");
});
