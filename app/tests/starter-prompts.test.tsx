import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  StarterPrompts,
  starterPromptsFor,
} from "@/components/channels/starter-prompts";
import { authKeys } from "@/lib/auth/queries";
import { settleReactWork } from "./settle-react-work";

/**
 * The role-seeded starter prompts.
 *
 * The role decides the seeds, and an unknown role decides nothing: the chips exist only when the
 * session says who this is, because a guessed role's prompts would be a guess wearing a button.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function renderWithRole(role: "admin" | "user" | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // The session's user is already in the cache in the app too — the auth gate puts it there.
        refetchOnMount: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  queryClient.setQueryData(
    authKeys.currentUser(),
    role
      ? {
          id: "u1",
          email: "person@example.com",
          name: "Person",
          image: null,
          role,
          onboarding: null,
        }
      : null,
  );
  let picked: string | null = null;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StarterPrompts
        onPick={(prompt) => {
          picked = prompt;
        }}
      />
    </QueryClientProvider>,
  );
  return {
    get picked() {
      return picked;
    },
    view,
  };
}

test("the seeds differ by role, and an unknown role seeds nothing", () => {
  expect(starterPromptsFor("admin").length).toBeGreaterThanOrEqual(3);
  expect(starterPromptsFor("user").length).toBeGreaterThanOrEqual(3);
  expect(starterPromptsFor("admin")).not.toEqual(starterPromptsFor("user"));
  expect(starterPromptsFor(undefined)).toEqual([]);
  expect(starterPromptsFor(null)).toEqual([]);
});

test("chips render for a known role and hand the sentence to the caller", () => {
  const harness = renderWithRole("user");

  const chips = harness.view.getAllByRole("button");
  expect(chips.length).toBe(starterPromptsFor("user").length);

  fireEvent.click(chips[0]!);
  expect(harness.picked).toBe(starterPromptsFor("user")[0]);
});

test("no session, no chips", () => {
  const harness = renderWithRole(undefined);
  expect(harness.view.queryByRole("button")).toBeNull();
});
