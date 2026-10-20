import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/**
 * A deployment root, rebuilt, and the install that has to work inside it.
 *
 * The installer stays small: a Tauri binary and nothing else. What it needs to run a deployment is
 * fetched on first run (desktop/src-tauri/src/deployment.rs): the release tarball, filtered to the
 * directories and files listed there as REQUIRED and ALSO_COPIED. `bun install` then runs inside
 * that directory, on the user's machine, with no git checkout around it and nothing outside the
 * list on disk to paper over a gap.
 *
 * Every other install check in this repository runs at the root of the full tree, where anything a
 * deployment forgot to carry still exists and a missing file reads as present. The root
 * package.json once declared workspaces (apps/app, packages/ui) that a deployment never carried,
 * so `bun install` failed on every fresh install and no check noticed: CI only ever installed
 * inside the checkout, where those directories are always there.
 *
 * This script closes that hole: copy exactly what a deployment carries into a fresh temporary
 * directory, and install there. A non-zero exit means a real deployment cannot install.
 *
 *     bun scripts/verify-deployment-install.ts [--source <path>] [--keep]
 *
 * `--source` reads the deployment files from another tree rather than this repository's root;
 * `--keep` leaves the temporary directory behind for debugging, on success as well as failure.
 *
 * The two arrays below are read by a Rust test in deployment.rs, which asserts them equal to
 * REQUIRED and ALSO_COPIED. They are written as plain quoted arrays on purpose, one entry per
 * line: if they drift from the Rust constants, that test fails rather than this script quietly
 * verifying a different list than the one `fetch` actually carries.
 */

/** deployment.rs's REQUIRED: the directories a deployment is checked for. */
const DEPLOYMENT_DIRS = ["deploy", "server", "app", "worker"];

/** deployment.rs's ALSO_COPIED: the rest of what a deployment needs to install and run. */
const DEPLOYMENT_FILES = [
  "shared",
  "examples",
  "package.json",
  "bun.lock",
  "scripts",
  "tsconfig.base.json",
  "bunfig.toml",
];

/** Everything a deployment root holds, for messages that name the whole list. */
const DEPLOYMENT_ENTRIES = [...DEPLOYMENT_DIRS, ...DEPLOYMENT_FILES];

const REPO_ROOT = resolve(import.meta.dir, "..");

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const sourceFlag = args.indexOf("--source");
const sourceArg = sourceFlag === -1 ? undefined : args[sourceFlag + 1];
if (sourceFlag !== -1 && sourceArg === undefined) {
  console.error("--source needs a path to a repository root.");
  process.exit(2);
}
const source = sourceArg ? resolve(sourceArg) : REPO_ROOT;

/*
 * A directory per run: the install below writes node_modules, and two concurrent runs (or a rerun
 * beside a kept directory) must not share it. The pid keeps a rerun in the same millisecond apart
 * too, and the name says what the directory is when somebody finds it in tmp later.
 */
const deployment = join(
  tmpdir(),
  `orbo-deployment-install-${process.pid}-${Date.now()}`,
);

/** Remove the temporary root, or say why it is still there. Never throws. */
function removeDeployment(): void {
  try {
    rmSync(deployment, { recursive: true, force: true });
  } catch (error) {
    console.error(
      `Could not remove the temporary directory ${deployment}: ${error}. Remove it by hand.`,
    );
  }
}

/*
 * The lines the frozen install wanted to change, found by installing again without the freeze and
 * diffing the rewritten lockfile against the copy made before the first attempt. "Lockfile had
 * changes" without naming the package is a puzzle nobody can solve from a CI log; this names it.
 * Any failure here (a bun that refuses to run, a lockfile bun chose not to rewrite) is swallowed:
 * this is a diagnostic in front of the real error, never the thing that decides the exit code.
 */
function reportLockfileDrift(root: string, before: string): void {
  try {
    const rerun = spawnSync("bun", ["install"], {
      cwd: root,
      stdio: "ignore",
      shell: false,
    });
    if (rerun.status !== 0) return;
    const after = readFileSync(join(root, "bun.lock"), "utf8");
    if (after === before) return;
    const was = new Set(before.split("\n"));
    const now = new Set(after.split("\n"));
    const added = [...now].filter((line) => !was.has(line));
    const removed = [...was].filter((line) => !now.has(line));
    const sample = (lines: string[], sign: string) =>
      lines
        .slice(0, 20)
        .map((line) => `    ${sign} ${line}`)
        .join("\n");
    console.error(
      `\nAn unfrozen install rewrote bun.lock. Lines bun wanted out of the frozen one:\n` +
        `${sample(removed, "-")}\n${sample(added, "+")}\n` +
        (added.length + removed.length > 40 ? `    ... (truncated)\n` : ""),
    );
  } catch {
    // The diff is a courtesy; the frozen install's own error above is the verdict.
  }
}

/*
 * Copy the deployment the way `unpack` lays one out from the tarball: everything under each named
 * top-level entry, nothing else. `cpSync` rather than a shell copy because this has to run on
 * Windows as well as Linux and macOS, and a shell copy is two scripts pretending to be one.
 *
 * `node_modules` is skipped at every depth, because a fetched tarball never carries one: it is
 * gitignored, so the only node_modules a deployment ever has is the one the install below creates
 * from the copied package.json and bun.lock. Copying the checkout's own would both pre-seed the
 * temp root with the very tree whose absence this script exists to expose, and fail outright on
 * Windows, where a workspace link is a junction that copyfile refuses.
 *
 * A missing entry is refused here rather than by cpSync's ENOENT, because the two causes read
 * differently: an incomplete tree and a --source that is not a repository root deserve different
 * next steps, and neither should look like a failure of the install below. Any other copy error
 * (a locked file, an antivirus in the way) is caught and reported against the directory rather
 * than as an uncaught throw.
 */
mkdirSync(deployment, { recursive: true });
try {
  for (const entry of DEPLOYMENT_ENTRIES) {
    const from = join(source, entry);
    if (!existsSync(from)) {
      console.error(
        `${from} does not exist. A deployment carries ${entry}, so either the tree at ${source} ` +
          `is incomplete or --source is not a repository root.`,
      );
      if (!keep) removeDeployment();
      process.exit(1);
    }
    cpSync(from, join(deployment, entry), {
      recursive: true,
      filter: (src) => basename(src) !== "node_modules",
    });
  }
} catch (error) {
  console.error(
    `Could not copy the deployment from ${source} into ${deployment}: ${error}`,
  );
  if (!keep) removeDeployment();
  process.exit(1);
}

/*
 * The same command a fresh install runs, with nothing but the deployment around it. Resolved via
 * PATH (shell: false) so the platform's own bun is the one that runs, and stdio inherited so a
 * failure shows the installer's own output rather than a summary of it.
 *
 * The lockfile is read into memory first: when the frozen install refuses because the lockfile
 * "had changes", the failure block re-runs the install unfrozen and reports exactly which lines
 * bun wanted to change, so a CI log says which package drifted rather than only that one did.
 */
const lockBefore = readFileSync(join(deployment, "bun.lock"), "utf8");

const install = spawnSync("bun", ["install", "--frozen-lockfile"], {
  cwd: deployment,
  stdio: "inherit",
  shell: false,
});

if (install.error) {
  // The binary could not be run at all (not on PATH, not executable), which is an environment
  // problem rather than a deployment one, but the directory is named all the same.
  console.error(
    `Could not run bun in the deployment root at ${deployment}: ${install.error.message}`,
  );
  if (!keep) removeDeployment();
  process.exit(1);
}

if (install.status !== 0) {
  reportLockfileDrift(deployment, lockBefore);
  const how =
    install.status === null
      ? `was killed by ${install.signal ?? "a signal"}`
      : `exited with code ${install.status}`;
  console.error(
    `\nbun install --frozen-lockfile ${how} in the deployment root at ${deployment}.\n\n` +
      `A deployment laid down by deployment::fetch cannot install. A deployment holds only these\n` +
      `entries:\n\n  ${DEPLOYMENT_ENTRIES.join("\n  ")}\n\n` +
      `so package.json, bun.lock and everything they reference have to resolve inside that list.\n` +
      `The usual cause is a package.json that names a workspace or file a deployment never carries.\n\n` +
      (keep
        ? `The directory was kept for debugging.\n`
        : `Re-run with --keep to leave the directory behind for debugging.\n`),
  );
  if (!keep) removeDeployment();
  process.exit(1);
}

if (keep) {
  console.log(
    `A deployment root installs. The directory was kept at ${deployment} (--keep).`,
  );
} else {
  removeDeployment();
  console.log(
    "A deployment root installs: the rebuilt deployment ran bun install clean.",
  );
}
