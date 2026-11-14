/**
 * Accepting a suggestion mints a unified task (25 §3.3, OpenMuse `decideIdea` accept).
 *
 * Ideas stay suggestions: `open` → `started` in `proactive_suggestions`, no new
 * tables. The link is the task offer pattern from `server/src/work/tasks.ts` —
 * idempotent on the suggestion key, one run row, one receipt — so a concurrent
 * second accept sees the same triple instead of minting a second task. The key is
 * unique on the `tasks` table, so the namespace below is a DB constraint now rather
 * than a convention only code remembered.
 *
 * The producer is its own kind (`proactive`) rather than a second thing riding the
 * `routine` kind (TD-05's unification): the key namespace and the producer kind each
 * say the one true thing about the row. This file grows no lease, retry, or counter.
 */
import type { Task, TaskLedger, TaskReceipt, TaskRun } from "../work/tasks";
import type { ProactiveSuggestion } from "./types";

/** Everything one acceptance leaves behind: the task, its run row, and the receipt. */
export type SuggestionAcceptance = {
  task: Task;
  run: TaskRun;
  receipt: TaskReceipt;
  /** False means the suggestion was accepted before: the existing triple, not new rows. */
  offered: boolean;
};

/**
 * The idempotence key for an acceptance. The suggestion id, namespaced so a
 * routine firing for the same minute can never collide with it.
 */
export function suggestionTaskKey(suggestionId: string): string {
  return `suggestion:${suggestionId}`;
}

/**
 * Offer the unified task for an accepted suggestion, close its run, and link
 * the receipt. Never rejects for the work itself: like `fireRoutineTask`, every
 * outcome is a row the ledger owns.
 */
export async function acceptSuggestionAsTask(options: {
  suggestion: Pick<ProactiveSuggestion, "id" | "title" | "settingId">;
  ledger: TaskLedger;
  /** The acceptance moment. Defaults to live time; tests inject their clock. */
  scheduledFor?: Date;
}): Promise<SuggestionAcceptance> {
  const { suggestion, ledger } = options;
  const scheduledFor = options.scheduledFor ?? new Date();
  const { task, offered } = await ledger.offer({
    key: suggestionTaskKey(suggestion.id),
    producer: { kind: "proactive", id: `proactive:${suggestion.settingId}` },
    scheduledFor,
  });
  if (!offered) {
    const run = await ledger.runForTask(task.id);
    const receipt = run ? await ledger.receiptForRun(run.id) : null;
    if (run && receipt) return { task, run, receipt, offered };
    throw new Error("an accepted suggestion has no run row or receipt");
  }

  const run = await ledger.startRun(task.id);
  const finished = await ledger.finishRun(run.id, "succeeded");
  const receipt = await ledger.recordReceipt(run.id, {
    title: "suggestion started",
    detail: `Started "${suggestion.title}".`,
  });
  return { task, run: finished, receipt, offered };
}
