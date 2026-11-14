import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { tasks } from "../src/db/schema";
import {
  analyzeSpending,
  FINANCE_PRODUCER_ID,
  FINANCE_TASK_KIND,
  runFinanceTask,
  summarizeSpending,
} from "../src/work/finance";
import { createTaskLedger } from "../src/work/tasks";
import { TEST_POOL, testDatabaseUrl } from "./support/database";

/**
 * Spending summaries as a Work task kind (Phase 6; 24 §4).
 *
 * No network, no clock: the analyzer is a pure function over CSV text, and the
 * task kind runs on the durable ledger over its tables, so what is under test is
 * the port's fidelity — cents-exact totals, the strict CSV grammar, the header
 * rules — and the ledger sequence one import leaves behind. The savings-goal
 * action is slice 2 and appears here only as an absence: no goal, no milestone,
 * no artifact row.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const prefix = `finance-import:${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await database.delete(tasks).where(like(tasks.key, `${prefix}%`));
});

afterAll(async () => {
  await database.delete(tasks).where(like(tasks.key, `${prefix}%`));
  await database.$client.close();
});

/** The delegate sheet's example transactions (F-16): salary in, three spends out. */
const EXAMPLE_CSV = [
  "date,description,amount,category",
  "2026-09-01,Salary,-4200,Income",
  "2026-09-02,Groceries,82.40,Food",
  "2026-09-03,Subscription,12.99,Fun",
  "2026-09-04,Coffee,3.50,Food",
].join("\n");

describe("categorizing an import", () => {
  test("income, spending and savings split on the sign", () => {
    const report = analyzeSpending(EXAMPLE_CSV);

    expect(report.count).toBe(4);
    expect(report.income).toBe(4200);
    expect(report.spending).toBe(98.89);
    expect(report.saved).toBe(4101.11);
  });

  test("expense groups sort largest first and name the source currency", () => {
    const report = analyzeSpending(EXAMPLE_CSV);

    expect(report.categories).toEqual([
      { name: "Food", amount: 85.9 },
      { name: "Fun", amount: 12.99 },
    ]);
    expect(report.period).toEqual({
      from: "2026-09-01",
      to: "2026-09-04",
    });
    expect(report.amountConvention).toContain("no currency conversion");
  });

  test("the summary line never carries the CSV", () => {
    const report = analyzeSpending(EXAMPLE_CSV);

    expect(summarizeSpending(report)).toBe("4 transactions · 98.89 spent");
    expect(report.transactions).toHaveLength(4);
    expect(report.transactions[0]).toEqual({
      id: "row-2",
      date: "2026-09-01",
      description: "Salary",
      amount: -4200,
      category: "Income",
    });
  });

  test("tenths group without drifting", () => {
    const report = analyzeSpending(
      [
        "date,description,amount,category",
        "2026-09-01,Salary,-1000,Income",
        "2026-09-01,Coffee,10.10,Food",
        "2026-09-02,Books,20.20,Fun",
      ].join("\n"),
    );

    expect(report.spending).toBe(30.3);
    expect(report.saved).toBe(969.7);
  });
});

describe("the strict CSV grammar", () => {
  test("characters after a closing quote are rejected, not interpreted", () => {
    for (const amount of ['"10"0', '""10', '"10".00', '"10" ']) {
      expect(() =>
        analyzeSpending(
          `date,description,amount,category\n2026-09-01,Coffee,${amount},Food`,
        ),
      ).toThrow(/Invalid quoted CSV field/);
    }
    expect(() =>
      analyzeSpending(
        'date,description,amount,category\n2026-09-01,"Coffee"shop,10,Food',
      ),
    ).toThrow(/Invalid quoted CSV field/);
  });

  test("valid quoted fields survive, including commas, quotes and newlines", () => {
    for (const ending of ["", "\n", "\r\n", "\r"]) {
      const report = analyzeSpending(
        '"date","description","amount","category"\r\n' +
          '"2026-09-01","Coffee, ""local""\nshop","10.10","Food"\r\n' +
          `"2026-09-02","","20.20",""${ending}`,
      );

      expect(report.count).toBe(2);
      expect(report.spending).toBe(30.3);
      expect(report.transactions[0]?.description).toBe('Coffee, "local"\nshop');
      expect(report.transactions[1]?.description).toBe("");
      expect(report.transactions[1]?.category).toBe("Uncategorized");
    }
  });

  test("a byte order mark is not part of the first header", () => {
    for (const header of [
      "date,description,amount,category",
      '"date","description","amount","category"',
    ]) {
      const report = analyzeSpending(
        `\uFEFF${header}\n2026-09-01,Coffee,10.10,Food`,
      );

      expect(report.count).toBe(1);
      expect(report.spending).toBe(10.1);
    }
  });

  test("an unclosed quote fails the whole import", () => {
    expect(() =>
      analyzeSpending(
        'date,description,amount,category\n2026-09-01,"Coffee,10,Food',
      ),
    ).toThrow(/unclosed quoted field/);
  });
});

describe("header and row rules", () => {
  test("a duplicated required column fails instead of discarding values", () => {
    for (const column of ["date", "description", "amount", "category"]) {
      expect(() =>
        analyzeSpending(
          `date,description,amount,category,${column}\n2026-09-01,Purchase,10,Food,1000`,
        ),
      ).toThrow(/duplicate.*column/i);
    }
  });

  test("uniqueness is checked after the same normalization used for lookup", () => {
    expect(() =>
      analyzeSpending(
        "date,description,amount,category, Amount \n2026-09-01,Purchase,10,Food,1000",
      ),
    ).toThrow(/duplicate.*column/i);
  });

  test("reordered and extra columns still work; duplicated extras are ignored", () => {
    const reordered = analyzeSpending(
      "note,category,amount,description,date\nIgnored,Food,10,Purchase,2026-09-01",
    );
    expect(reordered.spending).toBe(10);
    expect(reordered.transactions[0]?.description).toBe("Purchase");

    const duplicatedExtra = analyzeSpending(
      "note,date,description,amount,category,note\nFirst,2026-09-01,Purchase,10,Food,Second",
    );
    expect(duplicatedExtra.spending).toBe(10);
  });

  test("empty, header-only and malformed rows fail with the row that carries them", () => {
    expect(() => analyzeSpending("")).toThrow(
      /needs date,description,amount,category/,
    );
    expect(() => analyzeSpending("date,description,amount,category\n")).toThrow(
      /between 1 and 5,000/,
    );
    expect(() =>
      analyzeSpending("date,description,amount,category\n2026-09-01,Coffee,10"),
    ).toThrow(/Row 2 has the wrong number of columns/);
    expect(() =>
      analyzeSpending(
        "date,description,amount,category\n2026-02-31,Coffee,10,Food",
      ),
    ).toThrow(/Row 2 needs an ISO date/);
    expect(() =>
      analyzeSpending(
        "date,description,amount,category\n2026-09-01,Coffee,10.999,Food",
      ),
    ).toThrow(/at most two decimal places/);
    expect(() =>
      analyzeSpending(
        "date,description,amount,category\n2026-09-01,Coffee,99999999999.99,Food",
      ),
    ).toThrow(/out of range/);
  });

  test("oversize input is refused before parsing", () => {
    expect(() => analyzeSpending(`a`.repeat(500001))).toThrow(/at most 500 KB/);
  });
});

describe("importing CSV as Work", () => {
  // Generous timeouts: these run on the shared test database alongside every other
  // suite in the same process, and the five-second default is contention food.
  test("a valid import leaves one task, one run row and one receipt", async () => {
    const ledger = createTaskLedger(database, {
      now: () => new Date("2026-09-05T00:00:00Z"),
    });

    expect(FINANCE_TASK_KIND).toBe("finance");
    const result = await runFinanceTask({
      ledger,
      key: `${prefix}:september-week-1`,
      csv: EXAMPLE_CSV,
      at: new Date("2026-09-05T00:00:00Z"),
    });

    expect(result.offered).toBe(true);
    expect(result.task.producer).toEqual({
      kind: "finance",
      id: FINANCE_PRODUCER_ID,
    });
    expect(result.task.scheduledFor).toEqual(new Date("2026-09-05T00:00:00Z"));
    expect(result.run.status).toBe("succeeded");
    expect(result.run.error).toBeNull();
    expect(result.receipt.title).toBe("Spending tracker");
    expect(result.receipt.detail).toBe("4 transactions · 98.89 spent");
    expect(result.report?.saved).toBe(4101.11);
  }, 30_000);

  test("the same key imported twice runs the analyzer once", async () => {
    const ledger = createTaskLedger(database);
    const first = await runFinanceTask({
      ledger,
      key: `${prefix}:twice`,
      csv: EXAMPLE_CSV,
    });
    const second = await runFinanceTask({
      ledger,
      key: `${prefix}:twice`,
      csv: EXAMPLE_CSV,
    });

    expect(second.offered).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(second.run.id).toBe(first.run.id);
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(second.report?.spending).toBe(98.89);
  }, 30_000);

  test("an invalid CSV fails the run and receipts the reason instead of throwing", async () => {
    const ledger = createTaskLedger(database);

    const result = await runFinanceTask({
      ledger,
      key: `${prefix}:broken`,
      csv: "date,description,amount,category\nnot-a-date,Coffee,10,Food",
    });

    expect(result.offered).toBe(true);
    expect(result.report).toBeNull();
    expect(result.run.status).toBe("failed");
    expect(result.run.error).toContain("Row 2 needs an ISO date");
    expect(result.receipt.title).toBe("Import failed");
    expect(result.receipt.detail).toContain("Row 2 needs an ISO date");
  }, 30_000);
});
