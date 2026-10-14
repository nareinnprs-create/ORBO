import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The test run, with a floor under how much of it must actually execute.
 *
 * A test file that throws while it is being imported never runs its tests and never reports them as
 * failures; the file is simply absent from the totals.
 *
 * This asserts the count as well as the result. A drop is treated as a failure, because a smaller
 * suite with no failure report gives false coverage.
 *
 * The floor is deliberately a floor and not an exact number. Tests are added constantly and a check
 * that has to be edited for every new test is a check people learn to edit without thinking.
 */

const MINIMUM_TESTS = 400; // Never lowered to make a phase pass (06 §4, 09 R9).

/**
 * Per-directory test-file floors (06 §7 gap #2, 09 R9).
 *
 * MINIMUM_TESTS counts executed cases, so an import-time throw that removes one file is invisible
 * until hundreds of cases vanish. File counts catch the dropped file itself. Like MINIMUM_TESTS
 * these are floors, not exact numbers: each sits a few files below today's count so adding tests
 * never requires editing this script.
 */
const DIR_FILE_FLOORS: { dir: string; recursive: boolean; floor: number }[] = [
  // 295 today: 294 top-level plus support/database.test.ts.
  { dir: "server/tests", recursive: true, floor: 290 },
  // 165 today, plus 5 support/fixture files that are not tests and are not counted.
  { dir: "app/tests", recursive: true, floor: 160 },
  // 5 root contracts plus tests/smoke/journey.test.ts.
  { dir: "tests", recursive: true, floor: 6 },
  { dir: "scripts", recursive: false, floor: 5 },
];

/**
 * Coverage tripwire (06 §4, 09 R9).
 *
 * Targets: server 80%, governance path (gateway resolve→policy→audit→act, credentials, secrets)
 * 95%, app 70% lines. A full-suite `bun test --coverage` run takes minutes and is too slow for
 * every push, so the gate does NOT measure the whole tree: one bounded `bun test --coverage` run
 * over a fixed probe set asserts per-file line floors on the files those probes are designed to
 * cover. The default gate stays fast — two small probe files, tens of tests, one extra run.
 *
 * Bun's text reporter prints % Funcs / % Lines only; there is no branch column. The gate therefore
 * enforces lines. The branch targets (server 75%, governance 90%) are not asserted by any gate
 * because the tool does not print them.
 *
 * An expected file that is absent from the coverage table fails closed: a refactor that stops
 * covering gateway.ts must fail here, not silently pass. To diagnose the wiring without touching
 * the committed thresholds, run `bun scripts/test-ci.ts --coverage` (coverage only, no full
 * suite); extra positional patterns replace the probe tests, and ORBO_COVERAGE_MIN_<AREA>
 * scratch-overrides a threshold in either direction. ORBO_COVERAGE=0 skips the tripwire for local
 * iteration; CI runs the whole gate.
 */
const COVERAGE_MIN_LINES = { server: 80, governance: 95, app: 70 };

type CoverageArea = keyof typeof COVERAGE_MIN_LINES;

const COVERAGE_PROBES: {
  tests: string[];
  expect: Record<string, CoverageArea>;
}[] = [
  {
    tests: ["server/tests/computer-gateway.test.ts"],
    expect: {
      "server/src/computer/gateway.ts": "governance",
      "server/src/computer/client.ts": "server",
    },
  },
  {
    tests: ["app/tests/agent-api-path.test.ts"],
    expect: { "app/src/lib/client.ts": "app" },
  },
];

const COVERAGE_TIMEOUT_MS = 180_000;

const ROOT = join(import.meta.dir, "..");

async function writeStderr(text: string) {
  if (!text) return;
  if (process.stderr.write(text)) return;
  await new Promise<void>((resolve) => process.stderr.once("drain", resolve));
}

// `bun run test` rather than `bun test`, so the pretest hook fires and the generated application
// config exists before route imports need it.
const cliArgs = process.argv.slice(2);
const coverageOnly = cliArgs.includes("--coverage");
const customPatterns = cliArgs.filter(
  (arg) => arg !== "--coverage" && !arg.startsWith("-"),
);

if (!coverageOnly) {
  const proc = Bun.spawn(["bun", "run", "test"], {
    stdout: "inherit",
    stderr: "pipe",
  });

  // Bun writes its summary to stderr, so it is echoed rather than inherited. Echoed as it arrives
  // rather than buffered to the end: a full-suite run writes nothing to inherited stdout for minutes,
  // and a log that sits still while a live child burns CPU looks exactly like a hang.
  const decoder = new TextDecoder();
  let stderr = "";
  for await (const chunk of proc.stderr) {
    const text = decoder.decode(chunk, { stream: true });
    stderr += text;
    await writeStderr(text);
  }
  stderr += decoder.decode();

  const exitStatus = await proc.exited;
  if (exitStatus !== 0) {
    process.exit(exitStatus);
  } else {
    const ran = stderr.match(/Ran (\d+) tests? across/);
    const count = ran ? Number.parseInt(ran[1] as string, 10) : 0;

    if (!ran) {
      await writeStderr(
        "\nCould not read how many tests ran from bun's output. Refusing to report a pass on a run that cannot be counted.\n",
      );
      process.exit(1);
    } else if (count < MINIMUM_TESTS) {
      await writeStderr(
        `\n${count} tests ran, and at least ${MINIMUM_TESTS} were expected.\n\n` +
          "Every test passed, so this is not a failing test, it is a suite that got smaller. The usual\n" +
          "cause is a file that threw while being imported, which takes its tests with it and reports\n" +
          "nothing. Run `bun test` and look for an unhandled error between the file groups.\n\n" +
          `If tests were deliberately removed, lower MINIMUM_TESTS in scripts/test-ci.ts and say why.\n`,
      );
      process.exit(1);
    } else {
      await writeStderr(`\n${count} tests ran (floor ${MINIMUM_TESTS}).\n`);
    }
  }

  const fileFloorFailures: string[] = [];
  for (const { dir, recursive, floor } of DIR_FILE_FLOORS) {
    const count = countTestFiles(dir, recursive);
    await writeStderr(`\n${dir}: ${count} test files (floor ${floor}).`);
    if (count < floor) {
      fileFloorFailures.push(
        `${dir}: ${count} test files, fewer than the floor of ${floor}. A test file was removed or ` +
          `is no longer discovered. If files were deliberately removed, lower the floor in ` +
          `scripts/test-ci.ts and say why; the MINIMUM_TESTS floor itself is never lowered.`,
      );
    }
  }
  if (fileFloorFailures.length > 0) {
    await writeStderr(
      `\n\nTest-file floors missed:\n${fileFloorFailures.map((f) => `- ${f}`).join("\n")}\n`,
    );
    process.exit(1);
  }

  if (process.env.ORBO_COVERAGE === "0") {
    await writeStderr("\nCoverage tripwire skipped (ORBO_COVERAGE=0).\n");
    process.exit(0);
  }
}

const patterns =
  customPatterns.length > 0
    ? customPatterns
    : COVERAGE_PROBES.flatMap((probe) => probe.tests);
process.exit(await runCoverageProbe(patterns));

function countTestFiles(relativeDir: string, recursive: boolean): number {
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx"))
      ) {
        count += 1;
      }
    }
  };
  walk(join(ROOT, relativeDir));
  return count;
}

function coverageMinLines(area: CoverageArea): number {
  const raw = process.env[`ORBO_COVERAGE_MIN_${area.toUpperCase()}`];
  if (raw !== undefined) {
    const override = Number(raw);
    if (Number.isFinite(override)) return override;
  }
  return COVERAGE_MIN_LINES[area];
}

function parseCoverageTable(stderr: string): Map<string, number> {
  const table = new Map<string, number>();
  // Bun highlights table cells with ANSI sequences even when piped, so they are stripped first.
  // The ESC byte is produced at runtime (fromCharCode) rather than written as a control
  // character, which keeps the pattern out of regex-literal lint rules.
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  // Bun wraps the trailing "Uncovered Line #s" column onto continuation lines that carry no pipes,
  // so rows are re-assembled before matching: a line with at least two pipes starts a row and
  // anything else continues the previous one. The "All files" aggregate is skipped on purpose —
  // the gate asserts per-file floors, never an average that a large uncovered file can drag down.
  const rows: string[] = [];
  for (const line of stderr.replace(ansi, "").split("\n")) {
    if ((line.match(/\|/g) ?? []).length >= 2) rows.push(line);
    else if (rows.length > 0) rows[rows.length - 1] += ` ${line.trim()}`;
  }
  for (const row of rows) {
    const match = row.match(/^\s*(.+?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/);
    if (!match) continue;
    const file = (match[1] as string).replace(/\\/g, "/").trim();
    if (file === "File" || file === "All files" || file.startsWith("-"))
      continue;
    table.set(file, Number.parseFloat(match[3] as string));
  }
  return table;
}

async function runCoverageProbe(patterns: string[]): Promise<number> {
  await writeStderr(
    `\nCoverage probe: bun test --coverage ${patterns.join(" ")}\n`,
  );
  const proc = Bun.spawn(
    ["bun", "test", "--coverage", "--coverage-reporter=text", ...patterns],
    {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "pipe",
    },
  );

  // Same echo-as-it-arrives discipline as the main run: coverage startup is silent for seconds.
  const decoder = new TextDecoder();
  let stderr = "";
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill(9);
    } catch {
      // Already exited; the wait below will observe it.
    }
  }, COVERAGE_TIMEOUT_MS);
  try {
    for await (const chunk of proc.stderr) {
      const text = decoder.decode(chunk, { stream: true });
      stderr += text;
      await writeStderr(text);
    }
    stderr += decoder.decode();
  } finally {
    clearTimeout(timeout);
  }

  if (timedOut) {
    await writeStderr(
      `\nCoverage probe timed out after ${COVERAGE_TIMEOUT_MS / 1000}s and was killed. ` +
        `Refusing to report a pass on a run that did not finish.\n`,
    );
    return 1;
  }
  const exitStatus = await proc.exited;
  if (exitStatus !== 0) {
    await writeStderr(
      `\nCoverage probe exited with code ${exitStatus}. Fix the probe tests before reading coverage.\n`,
    );
    return 1;
  }
  const ran = stderr.match(/Ran (\d+) tests? across/);
  if (!ran || Number.parseInt(ran[1] as string, 10) === 0) {
    await writeStderr(
      "\nCould not read how many probe tests ran. Refusing to report coverage on a run that cannot be counted.\n",
    );
    return 1;
  }
  const table = parseCoverageTable(stderr);
  if (table.size === 0) {
    await writeStderr(
      "\nNo coverage table found in the probe output. Refusing to pass without numbers.\n",
    );
    return 1;
  }
  const failures: string[] = [];
  const report: string[] = [];
  for (const probe of COVERAGE_PROBES) {
    for (const [file, area] of Object.entries(probe.expect)) {
      const min = coverageMinLines(area as CoverageArea);
      const actual = table.get(file);
      if (actual === undefined) {
        failures.push(
          `${file}: absent from the coverage table (expected at least ${min}% ${area} lines). ` +
            `The probe no longer covers this file — update COVERAGE_PROBES, do not delete the row.`,
        );
      } else {
        report.push(`${file}: ${actual}% lines (${area} floor ${min}%)`);
        if (actual < min) {
          failures.push(
            `${file}: ${actual}% lines, below the ${area} floor of ${min}%.`,
          );
        }
      }
    }
  }
  await writeStderr(`\n${report.join("\n")}\n`);
  if (failures.length > 0) {
    await writeStderr(
      `\nCoverage below threshold:\n${failures.map((f) => `- ${f}`).join("\n")}\n`,
    );
    return 1;
  }
  return 0;
}
