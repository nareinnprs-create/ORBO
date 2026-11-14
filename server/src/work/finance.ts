/**
 * Spending summaries as a Work task kind (Phase 6; 24 §4).
 *
 * A CSV import rides the unified task ledger in `server/src/work/tasks.ts` rather
 * than growing its own table or route: one task + one run row + one receipt event,
 * now durable rows, with the CSV text arriving as the task input. The worker branch
 * is `analyzeSpending` below — a faithful port of OpenMuse's `engine/finance.ts`
 * (F-01) — so the numbers stay cents-exact and the CSV grammar stays strict.
 *
 * WHAT THIS IS NOT. No savings-goal action — that is slice 2, a `responsibilities`
 * row with the two fixed milestones (F-09). No UI: no import screen, no summary
 * card (F-07), no delegate sheet (F-08). No network, no currency conversion:
 * positive amounts are expenses and negative amounts are income, in the source
 * currency.
 */
import { z } from "zod";
import type { Task, TaskLedger, TaskReceipt, TaskRun } from "./tasks";

/** The Work task kind value, a literal port of OpenMuse's `AgentTask.kind` (F-03). */
export const FINANCE_TASK_KIND = "finance" as const;

/**
 * The ledger producer finance offers under, as its own producer kind — the same
 * unification TD-05 gave proactive: the kind names who offered it, the key names
 * what it is, and neither rides the other.
 */
export const FINANCE_PRODUCER_ID = "finance-import";

export type SpendingTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
};

export type SpendingCategory = {
  name: string;
  amount: number;
};

export type SpendingReport = {
  /** Income and spending are magnitudes; `saved` is income minus spending. */
  income: number;
  spending: number;
  saved: number;
  /** Transaction rows, 1–5,000 enforced. */
  count: number;
  /** Expense-only groups, largest first; empty category reads `Uncategorized`. */
  categories: SpendingCategory[];
  transactions: SpendingTransaction[];
  period: { from: string; to: string };
  amountConvention: string;
};

/**
 * Categorize one imported transaction CSV.
 *
 * Positive amounts are expenses, negative amounts are income, in the source
 * currency — no conversion is inferred. Money is grouped in integer cents and
 * only divided back to floats for the report, so the totals never drift.
 * Everything malformed throws with the row that carries it (`row-<n>`); the
 * caller records that as a failed run, never as a half-written summary.
 */
export function analyzeSpending(csv: string): SpendingReport {
  if (csv.length > 500000)
    throw new Error("Import at most 500 KB of transaction CSV");
  // Excel and many bank exports start a UTF-8 CSV with a byte order mark. It is not part of the first header.
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i <= csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length)
        throw new Error("Invalid quoted CSV field");
      else {
        quoted = !quoted;
        if (!quoted) {
          const next = csv[i + 1];
          if (
            next !== undefined &&
            next !== "," &&
            next !== "\n" &&
            !(
              next === "\r" &&
              (csv[i + 2] === "\n" || csv[i + 2] === undefined)
            )
          )
            throw new Error("Invalid quoted CSV field");
        }
      }
    } else if (!quoted && (c === "," || c === "\n" || c === undefined)) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c !== ",") {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
    } else if (c !== undefined) cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  const header = rows.shift()?.map((v) => v.trim().toLowerCase());
  if (
    !header ||
    !["date", "description", "amount", "category"].every((v) =>
      header.includes(v),
    )
  )
    throw new Error("CSV needs date,description,amount,category columns");
  if (
    ["date", "description", "amount", "category"].some(
      (name) => header.indexOf(name) !== header.lastIndexOf(name),
    )
  )
    throw new Error("CSV has a duplicate required column");
  if (!rows.length || rows.length > 5000)
    throw new Error("Import between 1 and 5,000 transactions");
  const transactions = rows.map((r, index) => {
    const get = (name: string) => r[header.indexOf(name)]?.trim() ?? "";
    if (r.length !== header.length)
      throw new Error(`Row ${index + 2} has the wrong number of columns`);
    const date = get("date"),
      amount = get("amount");
    if (
      !z.iso.date().safeParse(date).success ||
      !/^[-+]?\d+(?:\.\d{1,2})?$/.test(amount)
    )
      throw new Error(
        `Row ${index + 2} needs an ISO date and a plain amount with at most two decimal places`,
      );
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e12)
      throw new Error("Transaction amount is out of range");
    return {
      id: `row-${index + 2}`,
      date,
      description: get("description"),
      amount: cents / 100,
      category: get("category") || "Uncategorized",
      cents,
    };
  });
  const expenses = transactions
      .filter((t) => t.cents > 0)
      .reduce((n, t) => n + t.cents, 0),
    income = -transactions
      .filter((t) => t.cents < 0)
      .reduce((n, t) => n + t.cents, 0);
  const grouped = new Map<string, number>();
  for (const t of transactions)
    if (t.cents > 0)
      grouped.set(t.category, (grouped.get(t.category) ?? 0) + t.cents);
  const categories = [...grouped]
    .map(([name, cents]) => ({ name, amount: cents / 100 }))
    .sort((a, b) => b.amount - a.amount);
  const dates = transactions.map((t) => t.date).sort();
  return {
    income: income / 100,
    spending: expenses / 100,
    saved: (income - expenses) / 100,
    count: transactions.length,
    categories,
    transactions: transactions.map(({ cents, ...t }) => t),
    period: {
      from: dates[0] ?? "",
      to: dates[dates.length - 1] ?? "",
    },
    amountConvention:
      "Positive expenses; negative income. Values use the source currency; no currency conversion.",
  };
}

/**
 * The one-line outcome a receipt carries — the artifact summary OpenMuse files
 * next to the `finance` artifact (F-02) — never the CSV that produced it.
 */
export function summarizeSpending(report: SpendingReport): string {
  return `${report.count} transactions · ${report.spending.toFixed(2)} spent`;
}

function tryAnalyze(csv: string): SpendingReport | null {
  try {
    return analyzeSpending(csv);
  } catch {
    return null;
  }
}

export type FinanceTaskResult = {
  task: Task;
  run: TaskRun;
  receipt: TaskReceipt;
  /** The categorized summary, or null when the CSV failed validation. */
  report: SpendingReport | null;
  /** False means the same key was imported before: the existing rows, not new ones. */
  offered: boolean;
};

/**
 * Import one transaction CSV as Work.
 *
 * Offer/start/finish/receipt around `analyzeSpending`, in the `produce.ts`
 * discipline: a turn's failure is a row the ledger owns, so an invalid CSV
 * closes the run as failed and receipts the reason rather than throwing. Only
 * ledger misuse throws — an offered task with no run row or receipt behind it.
 * Pure apart from the injected ledger: no fetch, no clock read.
 */
export async function runFinanceTask(options: {
  ledger: TaskLedger;
  /** The identity of the import: the same key offered again imports nothing twice. */
  key: string;
  /** The raw transaction CSV; validated, never fetched. */
  csv: string;
  /** When the import is filed. Defaulted, never live by need. */
  at?: Date;
}): Promise<FinanceTaskResult> {
  const { ledger } = options;
  const { task, offered } = await ledger.offer({
    key: options.key,
    producer: { kind: "finance", id: FINANCE_PRODUCER_ID },
    scheduledFor: options.at ?? new Date(),
  });
  if (!offered) {
    // Imported before: the run row and the receipt are already there, so hand back
    // the triple rather than analyzing the CSV a second time for one import.
    const run = await ledger.runForTask(task.id);
    const receipt = run ? await ledger.receiptForRun(run.id) : null;
    if (!run || !receipt)
      throw new Error("an offered finance task has no run row or receipt");
    return { task, run, receipt, report: tryAnalyze(options.csv), offered };
  }

  const run = await ledger.startRun(task.id);
  try {
    const report = analyzeSpending(options.csv);
    const finished = await ledger.finishRun(run.id, "succeeded");
    const receipt = await ledger.recordReceipt(run.id, {
      title: "Spending tracker",
      detail: summarizeSpending(report),
    });
    return { task, run: finished, receipt, report, offered };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const finished = await ledger.finishRun(run.id, "failed", reason);
    const receipt = await ledger.recordReceipt(run.id, {
      title: "Import failed",
      detail: `That CSV could not be imported: ${reason}`,
    });
    return { task, run: finished, receipt, report: null, offered };
  }
}
