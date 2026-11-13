import { useQuery } from "@tanstack/react-query";
import { currentUserQueryOptions } from "@/lib/auth/queries";

/**
 * First sentences to send, seeded by the person's role.
 *
 * Shown on the home screen while the composer is still empty — the moment a person most needs one
 * sentence to start from. The role comes from the session the app already loaded; an unknown role
 * offers nothing rather than guessing. The prompts are ordinary asks any Bot can carry out — they
 * promise nothing the deployment has to be configured for.
 */
const ADMIN_PROMPTS = [
  "Which of my Bots need something from me right now?",
  "Draft a short update for my team about this week's work.",
  "Plan my day: what should I look at first?",
  "Remember that our all-hands is every Thursday at 10.",
] as const;

const USER_PROMPTS = [
  "What can you help me with?",
  "Plan my day: what should I look at first?",
  "Remember that I prefer short answers with next steps.",
  "Help me draft a message I've been putting off.",
] as const;

export function starterPromptsFor(
  role: "admin" | "user" | undefined | null,
): readonly string[] {
  if (role === "admin") return ADMIN_PROMPTS;
  if (role === "user") return USER_PROMPTS;
  return [];
}

export function StarterPrompts({
  onPick,
}: {
  /** Puts the sentence into the composer — the caller owns how. */
  onPick: (prompt: string) => void;
}) {
  const { data: user } = useQuery(currentUserQueryOptions());
  const prompts = starterPromptsFor(user?.role);
  if (!prompts.length) return null;

  return (
    <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
      {prompts.map((prompt) => (
        <button
          className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:border-diya-rich-teal hover:text-foreground"
          key={prompt}
          onClick={() => onPick(prompt)}
          type="button"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
