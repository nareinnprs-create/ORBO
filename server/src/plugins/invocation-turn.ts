import { PluginRefusedError, parseSkillInvocation } from "./store";

/**
 * One person's channel text, run as a `/`-invoked skill when it names one (TD-02).
 *
 * `store.invokeSkill` is the canonical invocation path — parse, visibility, grant, audit — but its
 * execution seam is injected, and the production seam is a turn. This is that composition, kept out
 * of `index.ts` so the decision is testable without a booted server: text that parses as
 * `/slug …` runs through `invokeSkill` with the turn runner as its `run`, everything else runs the
 * ordinary turn untouched. The turn's own result (its reply and anything else it carries) is what
 * the caller gets back either way, plus which skill ran — null when none did.
 *
 * The skill's instructions and what the person typed after the slug become the turn's instruction:
 * the instructions are what the skill exists to say, the rest is the person's ask for this run.
 * The user message stays the caller's business, so the transcript can keep reading as what was
 * actually said rather than as the composition the runner was given.
 *
 * A refusal is an ANSWER here, not a failure. `invokeSkill` already wrote the audit row before it
 * threw, and the person typed the invocation into a conversation — surfacing it as a failed turn
 * with a generic retry sentence would hide a message that names the actual problem (no such skill,
 * somebody else's, not granted to this Bot). The refusal text travels back as the reply instead.
 * Every other throw still throws, and the caller's existing failure handling stands — a turn that
 * suspended mid-skill is still a turn waiting on a person.
 */
export async function runTurnOrSkill<
  Result extends { replyText?: string },
>(input: {
  text: string;
  botId: string;
  actorId: string;
  /** The canonical store, which parses, decides and audits before ever running anything. */
  invokeSkill: (call: {
    text: string;
    botId: string;
    actorId: string;
    run: (context: {
      skill: { instructions: string };
      botId: string;
      actorId: string;
      userText: string;
    }) => Promise<string>;
  }) => Promise<{ slug: string; output: string }>;
  /** The turn, as the ordinary path runs it. Given the instruction, answering as itself. */
  runTurn: (instruction: string) => Promise<Result>;
}): Promise<Result & { skill: string | null }> {
  if (parseSkillInvocation(input.text) === null) {
    return { ...(await input.runTurn(input.text)), skill: null };
  }

  let ran: Result | undefined;
  try {
    const result = await input.invokeSkill({
      text: input.text,
      botId: input.botId,
      actorId: input.actorId,
      run: async ({ skill, userText }) => {
        const instruction = userText.trim()
          ? `${skill.instructions}\n\n${userText.trim()}`
          : skill.instructions;
        ran = await input.runTurn(instruction);
        return ran.replyText ?? "";
      },
    });
    return { ...ran, skill: result.slug } as Result & { skill: string | null };
  } catch (error) {
    if (error instanceof PluginRefusedError) {
      return { replyText: error.message, skill: null } as Result & {
        skill: string | null;
      };
    }
    throw error;
  }
}
