/**
 * Accepting a suggestion mints a unified task (25 §3.3, OpenMuse `decideIdea` accept).
 *
 * Ideas stay suggestions: `open` → `started` in `proactive_suggestions`, no new
 * tables. The link is the task offer pattern from `server/src/work/tasks.ts` —
 * idempotent on the suggestion key, one run row, one receipt — so a concurrent
 * second accept sees the same triple instead of minting a second task.
 *
 * The producer stays the proactive setting (`proactive:<settingId>`) on the
 * existing `routine` producer kind: schedulers stay producers (09 R5), and this
 * file grows no lease, retry, or counter of its own.
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
 * the receipt. Never throws for the work itself: like `fireRoutineTask`, every
 * outcome is a row the ledger owns.
 */
export function acceptSuggestionAsTask(options: {
  suggestion: Pick<ProactiveSuggestion, "id" | "title" | "settingId">;
  ledger: TaskLedger;
  /** The acceptance moment. Defaults to live time; tests inject their clock. */
  scheduledFor?: Date;
}): SuggestionAcceptance {
  const { suggestion, ledger } = options;
  const scheduledFor = options.scheduledFor ?? new Date();
  const { task, offered } = ledger.offer({
    key: suggestionTaskKey(suggestion.id),
    routineId: `proactive:${suggestion.settingId}`,
    scheduledFor,
  });
  if (!offered) {
    const run = ledger.runForTask(task.id);
    const receipt = run ? ledger.receiptForRun(run.id) : null;
    if (run && receipt) return { task, run, receipt, offered };
    throw new Error("an accepted suggestion has no run row or receipt");
  }

  const run = ledger.startRun(task.id);
  const finished = ledger.finishRun(run.id, "succeeded");
  const receipt = ledger.recordReceipt(run.id, {
    title: "suggestion started",
    detail: `Started "${suggestion.title}".`,
  });
  return { task, run: finished, receipt, offered };
}
