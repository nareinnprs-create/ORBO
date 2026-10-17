import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `scripts/processes.sh` on a Windows host that has no `lsof`, `pgrep` or `pkill`, run anywhere.
 *
 * PATH holds only the fakes below and `tr`, so a Linux machine with the real tools installed still
 * takes the Windows path, and the fake `powershell.exe` records what it was asked. It answers with
 * CRLF line endings, as the real one does. The fakes are `#!/bin/sh` because a `#!` line cannot hold
 * the space in Windows' `C:\Program Files\Git\...\bash.exe`.
 */

const suffix = process.platform === "win32" ? ".exe" : "";
const pathSeparator = process.platform === "win32" ? ";" : ":";

/**
 * Where `name` is on this host, without asking Windows for its own shell.
 *
 * `Bun.which("bash")` answers with `%SystemRoot%\system32\bash.exe`, the inbox WSL stub: it starts a
 * distribution rather than a script, and waits here for one this machine may not have. There is no
 * `tr` on PATH at all. A host that can run a `#!/bin/sh` script has Git for Windows, which carries
 * both, so its `usr\bin` is asked first and the inbox shell is never taken.
 */
function hostTool(name: string): string | null {
  const systemRoot = process.env.SystemRoot ?? "";
  const inbox = systemRoot ? join(systemRoot, "system32", name + suffix) : "";
  const gitRoots =
    process.platform === "win32"
      ? [
          process.env.ProgramFiles,
          process.env["ProgramFiles(x86)"],
          process.env.LOCALAPPDATA &&
            join(process.env.LOCALAPPDATA, "Programs"),
        ]
          .filter((root): root is string => Boolean(root))
          .flatMap((root) => [
            join(root, "Git", "usr", "bin"),
            join(root, "Git", "bin"),
          ])
      : [];
  const roots = [...gitRoots, ...(process.env.PATH ?? "").split(pathSeparator)];
  for (const root of roots) {
    if (!root) continue;
    const candidate = join(root, name + suffix);
    if (inbox && candidate.toLowerCase() === inbox.toLowerCase()) continue;
    if (existsSync(candidate)) return candidate;
  }
  const found = Bun.which(name);
  if (!found || (inbox && found.toLowerCase() === inbox.toLowerCase()))
    return null;
  return found;
}

const processesScript = resolve("scripts/processes.sh");
const bash = hostTool("bash") ?? "";
const realTr = hostTool("tr") ?? "";

/** Without both, the script cannot run at all here, and a hang is not a result. */
const runnable = Boolean(bash && realTr);

let directory: string;
let bin: string;
let log: string;

async function writeExecutable(path: string, contents: string) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "orbo-processes-"));
  bin = join(directory, "bin");
  log = join(directory, "calls.log");
  await Bun.$`mkdir -p ${bin}`;
  await writeExecutable(join(bin, "tr"), `#!/bin/sh\nexec "${realTr}" "$@"\n`);
  await writeExecutable(
    join(bin, "powershell.exe"),
    `#!/bin/sh
printf 'argv=%s|port=%s|pattern=%s|stop=%s|pids=%s\\n' "$*" "\${ORBO_PORT:-}" "\${ORBO_PATTERN:-}" "\${ORBO_STOP:-}" "\${ORBO_PIDS:-}" >> "$CALLS"
case "$*" in
  *ProcessName*) printf 'bun (127.0.0.1:%s)\\r\\n' "$ORBO_PORT" ;;
  *-Unique*|*Win32_Process*) printf '4242\\r\\n' ;;
esac
`,
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

// `OS` is always passed: Git Bash restores `OS=Windows_NT` from Windows when it is merely left out.
async function run(expression: string, os = "Windows_NT") {
  const child = Bun.spawn({
    cmd: [bash, "-c", `. "${processesScript}"; ${expression}`],
    env: { PATH: bin, CALLS: log, OS: os },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  const calls = await Bun.file(log)
    .text()
    .catch(() => "");
  return { exitCode, stdout, calls };
}

describe.skipIf(!runnable)(
  "processes.sh on Windows without lsof, pgrep or pkill",
  () => {
    test("holder names the listener, with the port in the environment and no CR", async () => {
      const result = await run('printf "[%s]" "$(holder 3001)"');

      expect(result.stdout).toBe("[bun (127.0.0.1:3001)]");
      expect(result.calls).toContain("|port=3001|");
      expect(result.calls).not.toContain("argv=3001");
    });

    test("port_pids and kill_pids hand Windows ids to PowerShell", async () => {
      const result = await run(
        'kill_pids -9 $(port_pids 3001); echo "exit=$?"',
      );

      expect(result.stdout).toBe("exit=0\n");
      expect(result.calls).toContain("|pids=-9 4242");
    });

    test("running finds the worker without its pattern on PowerShell's command line", async () => {
      const result = await run(
        'running "bun worker/src/index.ts" && echo yes || echo no',
      );

      expect(result.stdout).toBe("yes\n");
      expect(result.calls).toContain("|pattern=bun worker/src/index.ts|stop=|");
      expect(result.calls.split("|port=")[0]).not.toContain(
        "worker/src/index.ts",
      );
    });

    test("stop_matching asks PowerShell to stop what matches", async () => {
      const result = await run(
        'stop_matching "bun --env-file=../.env src/production-entry.ts"; echo "exit=$?"',
      );

      expect(result.stdout).toBe("exit=0\n");
      expect(result.calls).toContain(
        "|pattern=bun --env-file=../.env src/production-entry.ts|stop=stop|",
      );
    });
  },
);

describe.skipIf(!runnable)(
  "processes.sh where the POSIX tools are the answer",
  () => {
    test("a Windows host that has lsof, pgrep and pkill uses them, not PowerShell", async () => {
      for (const tool of ["lsof", "pgrep", "pkill"]) {
        await writeExecutable(
          join(bin, tool),
          `#!/bin/sh\nprintf '%s %s\\n' "${tool}" "$*" >> "$CALLS"\n`,
        );
      }

      const result = await run(
        'holder 3001; running "bun worker/src/index.ts"; stop_matching "bun worker/src/index.ts"',
      );

      expect(result.calls).not.toContain("argv=");
      expect(result.calls).toContain("lsof -nP -iTCP:3001 -sTCP:LISTEN -Fcn");
      expect(result.calls).toContain("pgrep -f bun worker/src/index.ts");
      expect(result.calls).toContain("pkill -f bun worker/src/index.ts");
    });

    test("off Windows, a missing lsof is still an empty answer, as before", async () => {
      const result = await run('printf "[%s]" "$(holder 3001)"', "");

      expect(result.stdout).toBe("[]");
      expect(result.calls).toBe("");
    });
  },
);
