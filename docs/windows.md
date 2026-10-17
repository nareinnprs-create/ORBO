# Running ORBO on Windows

Windows is a supported development platform, with two script families in the tree. The bash
scripts (`install.sh`, `start.sh`, `stop.sh`) keep working under Git Bash: where Git Bash has no
`lsof`, `pgrep` or `pkill`, they ask PowerShell, which ships with Windows, and `.gitattributes`
checks text out with LF on every system. The PowerShell scripts (`install.ps1`, `start.ps1`,
`stop.ps1`, `fix-docker.ps1`, `build-windows.ps1`) are native and need no Git Bash at all —
each says at the top that `bash scripts\start.ps1` is not a supported invocation, because a
shell that cannot parse the file cannot run a guard written in it.

## Prerequisites

- Windows 10 or 11, x64.
- [Git for Windows](https://git-scm.com/download/win) — its Git Bash runs the `.sh` scripts.
  Not required for the PowerShell path.
- [Bun](https://bun.sh) 1.3+ — the API server, the app and the routine worker all run on it.
- Node — the Intelligence login (`npx copilotkit@latest`) and several repo scripts run on it;
  `install.ps1` checks for it alongside `docker` and `bun`.
- [Rust through rustup](https://rustup.rs) (stable, `x86_64-pc-windows-msvc`) — only for
  building the desktop app.
- Docker Desktop with the WSL 2 backend — for the full stack: PostgreSQL, the shipped Bots,
  and one computer per Bot. A stopped engine is the ordinary first-run state on a Windows
  machine, and the scripts treat it as such rather than as a broken install (see
  [Docker down recovery](#docker-down-recovery)).

Nothing else. The desktop build needs WiX (for the MSI) or NSIS; the Tauri CLI downloads
either when it is missing, so `build-windows.ps1` only reports whether they are present.

## Quick start

One line, from a clone:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
```

`install.ps1` is the native mirror of `install.sh`: it checks `docker`, `bun` and `node`,
creates `.env` from `.env.example` when absent (never overwrites), generates the two Bot
secrets (`ORBO_MANAGED_AGENT_TOKEN`, `ORBO_AGENT_TOOL_TOKEN`) into `.env` when their keys are
empty, brings the compose services up, applies migrations, waits for health, then hands off to
`start.ps1`. Safe to rerun at any point. Variants: `-CheckOnly` is a side-effect-free preflight
(tools plus which required keys are still empty); `-NoStart` preps without launching.

Prefer to do it by hand:

```powershell
Copy-Item .env.example .env    # then fill the required keys; install.ps1 step 3 reports them
bun install
powershell -NoProfile -File scripts\start.ps1
```

`start.ps1` is the day-to-day entry, a native mirror of `start.sh`: the same four stages —
compose services, API server, routine worker, app — the same settings resolution (process
environment, then `.env`, then the same defaults), the same two secrets generated and written
back on first run, the same restart guard for a server that is up but stale, the same "already
up" probes, and per-service logs under `.logs`. Safe to rerun: matching services are left
running, and an unrelated process holding a port is named and refused. `-CheckOnly` (or
`-WhatIf`) resolves settings and reports what would run without touching anything.

Stop everything, in reverse order:

```powershell
powershell -NoProfile -File scripts\stop.ps1
```

`-KeepComputers` leaves the Bot computers running so their browsers stay signed in and warm.
Nothing is deleted either way: the database, the Bots' files and the browser profiles are
Docker volumes.

The Git Bash equivalents — `bash scripts/install.sh`, `bash scripts/start.sh`,
`bash scripts/stop.sh` — work on the same clone; nothing needs installing twice.

## Docker down recovery

"The engine is not running" is the ordinary first-run state on Windows, not an error message.
`install.ps1` and `start.ps1` check the engine first and point here.

Diagnose, read-only, no elevation needed:

```powershell
powershell -NoProfile -File scripts\fix-docker.ps1 -CheckOnly
```

It prints the live state (WSL service, `vmcompute`, `com.docker.service`, running Docker
processes, `docker version`'s exit code) and, when something is wrong, the exact elevated
command to run. `-WhatIf` shows the same dry plan.

Repair — must run elevated, because it restarts Windows services and shuts down WSL. It stops
the Docker Desktop processes, runs `wsl --shutdown` to clear a stale `docker-desktop` distro,
restarts `WSLService` and `com.docker.service`, starts Docker Desktop and polls
`docker version` until the engine answers (default timeout 120s):

```powershell
# From an elevated shell (Win+X → "Terminal (Admin)"):
cd <repo>
powershell -ExecutionPolicy Bypass -File .\scripts\fix-docker.ps1
```

Or, from a normal PowerShell, the self-elevating form the script prints:

```powershell
Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PWD\scripts\fix-docker.ps1`""
```

`-TimeoutSeconds` widens the engine poll (30–600). A non-elevated repair run stops with exit
code 3 and prints the elevated command; a machine with no Docker Desktop at all exits 2 with
the install URL, because the script only repairs an existing install. If the engine merely has
not started yet: launch Docker Desktop from the Start menu and wait for the whale icon to be
steady — with the WSL 2 backend, `wsl -d docker-desktop` is what starts it.

## Building the desktop installer

From the repository root, on a machine with Rust (rustup, stable MSVC toolchain), Bun and
Node:

```powershell
powershell -NoProfile -File scripts\build-windows.ps1
```

The script checks `cargo`, `rustc`, `bun` and `node` (a missing one stops the run by name),
prepends the usual rustup, cargo and bun directories to PATH when they are not on it, reports
whether NSIS and WiX are present (the Tauri CLI auto-downloads either when absent), then in
`desktop/` runs `bun install --frozen-lockfile`, `bun scripts/desktop-version.ts internal` and
`bun run tauri build --config src-tauri/tauri.build-version.conf.json --bundles msi`. Bundle
output is copied to `artifacts/` as `orbo-desktop-<version>-x64.msi` — on the internal channel
the version is the root release plus `-internal.g<commit>`, so the file reads like
`orbo-desktop-0.1.3-internal.g1a2b3c4-x64.msi`.

- `-CheckOnly` prints the steps and the artifact name without building anything.
- `-Bundles msi,nsis` builds both installer flavors; `-Channel release` prepares the plain
  release version. See [releasing.md](releasing.md#desktop-build-versions) for what the
  version strings mean.

What this build produces:

- An **unsigned** MSI. Ordinary desktop CI and local builds are unsigned; signing is the
  separate protected NSIS job ([windows-signing.md](windows-signing.md)).
- A **per-machine** install under the WiX default: it lands in Program Files and the installer
  asks for Administrator elevation. Tauri's WiX config exposes no per-user scope knob.
- **WebView2** needs no separate step on a current machine: Windows 11 and up-to-date Windows
  10 ship the WebView2 Runtime with the OS. Where it is missing, Tauri's default install mode
  silently downloads the bootstrapper.

CI builds the same MSI on every change to `desktop/` (the windows job in
`desktop.yml`, on `windows-latest`) and uploads it as the `orbo-desktop-windows` artifact for
7 days.

## Running the built app

- Installer: `artifacts\orbo-desktop-<version>-x64.msi` — double-click it, or
  `msiexec /i artifacts\orbo-desktop-<version>-x64.msi`. Per-machine, so it asks for
  elevation.
- Raw executable: `desktop\src-tauri\target\release\orbo-desktop.exe`, the binary the build
  packaged. Build it with the Tauri CLI as above; a plain `cargo build --release` still points
  at the dev server and shows "Could not connect to localhost" when run — it compiles the
  Rust and proves nothing about the thing people install.

The desktop app is the setup shell: it installs a container engine (digest-pinned Podman and
Compose), raises the stack and keeps it running. Its full function, like the clone's, is the
containers half of this page.

## Private repository releases

When the GitHub repository is private, the app's first-run deployment step (which queries
`api.github.com/.../releases/latest` and downloads the tagged source and image manifest)
gets 404 like any unauthenticated caller. Set a fine-grained personal access token —
**Contents: Read** on this repository only — in the environment that launches the app:

```powershell
$env:ORBO_RELEASES_TOKEN = "github_pat_..."
```

The token is attached as a bearer token only to URLs on `github.com`/`api.github.com` under
`nareinnprs-create/ORBO`; third-party downloads (Docker Compose, Bun installers) never receive
it. Without the token, a private repository's release lookup fails with a message naming
`ORBO_RELEASES_TOKEN`. A public repository needs no token.

## Known Windows gaps

Factual, from the portability audit and the test strategy:

- **No SIGTERM for a console process.** Every stop in the PowerShell family is
  `Stop-Process -Force` (TerminateProcess) — already what the Git Bash scripts do through
  PowerShell when Git Bash has no `kill` for a Windows pid. There is no graceful-shutdown
  window; the wait-and-recheck keeps its meaning, but the first stop is always a force-kill.
- **A Bot's shell and browser are container-only.** Chromium, `/workspace` and the shell tool
  live inside the Linux containers (`orbo-computer`), so they need Docker Desktop with the
  WSL 2 backend. There is no native Windows computer to exercise them against on the host.
- **Symlink tests need Developer Mode and stay quarantined.** The symlink/chmod cases in
  `server/tests/provider-oauth.test.ts` return early on `win32` rather than skipping visibly:
  native Windows symlinks require Developer Mode, so a supported OS is partly untested, and
  Windows is not in the unit CI job ([06-test-strategy.md](planning/06-test-strategy.md)).
- **`start-restart-guard` and friends are bash-oriented.**
  `scripts/{self-hosted-learning,start-restart-guard,processes}.test.ts` want a bash shell and
  run through WSL/bash, not Windows PowerShell
  ([06-test-strategy.md](planning/06-test-strategy.md)).

## What works today, and what needs Docker

**Today, without Docker:** cloning, `bun install`, formatting, linting and typechecking, the
desktop MSI build above, and running the desktop app's setup UI. The stack itself cannot
start: PostgreSQL and every Bot run in containers, and `start.ps1` stops with a named message
rather than pretending otherwise.

**With Docker Desktop (WSL 2):** everything. `install.ps1` / `start.ps1` raise the same four
stages as on macOS and Linux — services, migrations, API server, worker, app — each Bot gets
its own computer through the supervisor, and `stop.ps1` takes it all down again with the
volumes intact.
