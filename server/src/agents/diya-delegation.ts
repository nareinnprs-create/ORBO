import type { HandoffDesk, HandoffEnvelope, HandoffOutcome } from "./handoff";

/**
 * DIYA's first-slice delegation: one boss, one specialist, one canned task.
 *
 * The handoff desk (`handoff.ts`) already decides and queues, and the runner
 * (`handoff-runner.ts`) already delivers and relays with attribution. What the
 * WS-02 first slice pins down is the contract on top: which specialist DIYA
 * addresses first, what the one canned task is, and what the collected result
 * looks like in the main thread. Data, not machinery — nothing here dials a
 * model or touches the database, which is why the slice test proves it with
 * the same queue/audit/turn fakes the handoff suites already use.
 */

export const DIYA_AGENT_ID = "diya";

/** The one specialist of the first slice: the evidence-grounded coworker. */
export const DIYA_FIRST_SPECIALIST_ID = "knowledge";

/** The one canned task DIYA hands to its specialist in the first slice. */
export function diyaCannedEnvelope(): HandoffEnvelope {
  return {
    task: "List the company knowledge sources you can reach right now, with one line on each.",
    constraints:
      "Only name sources your tools actually returned; say plainly when none is connected.",
    expecting: "A short list, each item citing the source it came from.",
  };
}

/**
 * The canned path through the desk: deciding and queueing, never a model call.
 *
 * Offered and audited exactly like any other hop (`agent.handoff_offered`
 * with `bot: diya`), so the trail cannot tell a canned first-slice hop from
 * a model-decided one — which is the point. A refusal comes back as a
 * sentence DIYA can say, per the desk's own contract.
 */
export function sendDiyaCannedHandoff(
  desk: HandoffDesk,
  from: Parameters<HandoffDesk["send"]>[0]["from"],
): Promise<HandoffOutcome> {
  return desk.send({
    from,
    target: DIYA_FIRST_SPECIALIST_ID,
    envelope: diyaCannedEnvelope(),
  });
}

/**
 * The result as collected in the main thread: what was done, and who said it.
 *
 * The runner's relay already instructs the asking Bot to say where its answer
 * came from; this is that line in its pinned form, so Home renders the
 * specialist's words attributed rather than as DIYA's own. The answer is kept
 * verbatim — trimming pleasantries is the relaying run's job, not this
 * format's.
 */
export function collectDiyaResult(
  specialistName: string,
  answer: string,
): string {
  const name = specialistName.trim() || DIYA_FIRST_SPECIALIST_ID;
  return `${name} answered: ${answer.trim()}`;
}
