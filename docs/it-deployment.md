# ORBO deployment for IT (MSI/NSIS/pkg/deb, network allowlist, offline bundle)

This is the document for an IT department that installs ORBO on machines it manages, on networks
where github.com may be blocked (air-gap, policy, or an internal mirror standing in front of
GitHub). It covers: what installs have to run, what network access is needed when, the
environment-variable overrides that move every fetch onto internal infrastructure, corporate
`.env` pre-seeding, the worker service, updates, and the offline bundle.

One file replaces the planned `docs/it-offline.md`; offline operation is §7 here, not a second
document.

The operator map is implemented in code for release fetches
(`desktop/src-tauri/src/deployment.rs`, six keys) and container images
(`ORBO_IMAGE_PREFIX`); npm registry override is wave-2 work in
`desktop/src-tauri/src/stack.rs` (`ORBO_NPM_REGISTRY`, see §7.3 for the exact mechanism to use).

---

## 1. Installing the app (per platform)

All addresses of ORBO's installer decisions live in
`desktop/src-tauri/src/install.rs`. Summary for IT:

| Platform      | File                    | Quiet install                                                         | Rights it needs | What to watch for |
| ------------- | ----------------------- | ---------------------------------------------------------------------- | --------------- | ----------------- |
| Windows       | `ORBO_<version>_<arch>_en-US.msi` (Tauri MSI) or `ORBO_<version>_<arch>-setup.exe` (NSIS) | MSI: `msiexec /i ORBO_<v>_x64_en-US.msi /qn` · NSIS: `ORBO_<v>-setup.exe /S` | Per-user, **no elevation** | §1.1's SYSTEM-profile trap |
| macOS         | `ORBO_<version>_<arch>.dmg` | Mount and drag, or `hdiutil` + `cp -R` in a script                     | Normal user     | — |
| Linux         | `ORBO_<version>_<arch>.deb` (or `.AppImage`) | `dpkg -i`; AppImage is chmod+x and run                    | Normal user     | — |

The Windows MSI is a **per-user** install: it needs no elevation and lands in the profile of
whoever runs it. It also cannot be pushed with `msiexec /qn` from a service context
(SCCM running as SYSTEM, a scheduled task, an elevated Chocolatey helper): `install.rs`
documents the measured result of that — the app ends up installed under
`C:\Windows\system32\config\systemprofile`, the person's own session cannot see it, and ORBO's
first-run "no engine" state coexists with a `podman.exe` that is very much on disk, just not
where this user looks. Run the MSI as the user (Intune user context, a logged-in user, `psexec
-i`) or accept that nothing will appear to happen.

macOS and Linux install differently and only one of them is unattended:

- **macOS** — the Podman package ORBO raises on first launch writes to `/opt/podman` and needs
  administrator rights, so the person sees one standard macOS authorization prompt. There is no
  way around that prompt and no reason to want one; it is the same dialog every other installer
  raises.
- **Linux** — Podman is not one binary but a set (`conmon`, `crun`, `netavark`, `slirp4netns`),
  tied to the distribution's own paths, so ORBO honors the distribution: engine install goes
  through the distribution's package manager, which raises `pkexec` — that desktop's own
  authorization prompt. If you pre-install `podman` from the distro's repos before first ORBO
  launch, `pkexec` is not needed for engine install (Compose still installs, binary placement,
  no rights needed).

### 1.1 What runs at first launch

The installer carries the Tauri binary and nothing else. First launch:

1. Detects any usable existing engine (Podman/Docker Desktop) and uses it.
2. Otherwise downloads and installs the pinned engine: **Podman 6.1.1**, **Compose 5.5.1**,
   runtime **Bun 1.3.14** — every download pinned by sha256 (`install.rs`), placed into the
   user's app cache. Linux: distro Podman through `pkexec` (above).
3. Fetches the **release source tarball** for the app's own version from
   `codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/<version>`, plus the release's
   `container-images.json` (digest per image). This becomes the **deployment root**:
   `$HOME\ORBO` on the person's profile (Windows: `%USERPROFILE%\ORBO`), no spaces-tolerant,
   `$HOME`/`%USERPROFILE%`-derived.
4. Runs `bun install --frozen-lockfile --ignore-scripts` in the deployment root
   (`stack.rs:install_dependencies`). This is the step that needs **registry.npmjs.org** (§2).
5. Compose up, migrate, and the app opens its onboarding.

So the FIRST launch is network-heavy; after it, runtime egress is small (§2, "Runtime").

### 1.2 Windows NSIS notes

Tauri's Windows build publishes both bundles. The `.msi` is what `desktop.yml` builds and the
release attaches; the signed `-setup.exe` NSIS is built by the signing workflow. Both are
per-user. `/S` (capital S) is Tauri-NSIS's silent flag; `/NCRC` skips integrity pre-check if
your software inventory renames or wraps installers — not recommended.

## 2. Network allowlist for IT

Split by WHEN the connection happens, not by host. What is needed at *install time* is where a
mirror makes all the difference.

### 2.1 At first install (does not apply once a deployment exists)

Without any overrides, everything comes from public hosts. With the §3 overrides set, every row
below can point at your own infrastructure instead.

| Purpose | Default host(s) (public) | Internal equivalent via override | At first install / Runtime |
| ------- | ------------------------ | -------------------------------- | ------- |
| Latest-release discovery | `api.github.com/repos/nareinnprs-create/ORBO/releases/latest` | `ORBO_RELEASES_API_URL` (GHE/Netlify internal JSON) | Install |
| Source tarball of the release | `codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/<v>` | `ORBO_RELEASES_TARBALL_TEMPLATE` | Install |
| `container-images.json` + installers as release assets | `github.com/nareinnprs-create/ORBO/releases/download/<v>/<asset>` | `ORBO_RELEASES_ASSETS_TEMPLATE` | Install |
| Auth to a private/mirrored source | unset (public release) | `ORBO_RELEASES_TOKEN` (`Authorization: Bearer`, host filter follows configured endpoints) | Install |
| Container engine + Compose + Bun installers | `github.com/podman-container-tools/...`, `github.com/docker/...`, `github.com/oven-sh/bun/...` (digests pinned in `install.rs`) | `ORBO_ENGINE_MIRROR` = `<mirror>/<path-after-github.com>` | Install |
| npm dependencies for the deployment root | `registry.npmjs.org` | `ORBO_NPM_REGISTRY` (§7.3, mechanism verified against bun 1.3.14) | Install (and every update) |
| Container images | `ghcr.io/nareinnprs-create/orbo` | `ORBO_IMAGE_PREFIX` (replaces the prefix; e.g. `mirror.example.com/docker-library`) | Install |
| Distro Podman (Linux engine, when not pre-installed) | the distro's repos, via `pkexec` | pre-install Podman from your repo snapshot | Install |

### 2.2 Runtime (after a working install)

| Purpose | Default | Notes |
| ------- | ------- | ----- |
| Model providers | e.g. `api.intelligence.copilotkit.ai`, `wss://realtime.intelligence.copilotkit.ai` (`.env`) | point at your internal model gateway instead (§4) |
| Databases | local Postgres on `localhost:5432` (docker compose service) | no egress |
| Plugins/connectors (Google Drive, Gmail, Composio…) | vendor public endpoints | only if users connect accounts (§4, `ORBO_PUBLIC_URL`) |
| Telemetry | desktop telemetry is **off**, revoke/re-enable only in `.env`/app settings | `docs/configuration.md` for the full list |

## 3. The seven override keys (internal mirror + GHE)

Seven environment variables move ORBO entirely onto internal infrastructure. Read at
deployment-fetch time by `desktop/src-tauri/src/deployment.rs` (a mistyped value refuses loudly
with an error naming the key). Set them in the environment the **ORBO desktop app process**
inherits (system environment variables, or the user's session) — the desktop app's own fetches
and `bun install` both live there; the server worker tasks read the deployment root `.env`.

| Key | Meaning | Default |
| --- | ------- | ------- |
| `ORBO_RELEASES_API_URL` | URL to answer "which is the latest release" | `https://api.github.com/repos/nareinnprs-create/ORBO/releases/latest` |
| `ORBO_RELEASES_TARBALL_TEMPLATE` | template with `{version}` | `https://codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/{version}` |
| `ORBO_RELEASES_ASSETS_TEMPLATE` | template with `{version}` and `{asset}` | `https://github.com/nareinnprs-create/ORBO/releases/download/{version}/{asset}` |
| `ORBO_RELEASES_TOKEN` | bearer token for a private GHE/mirror; host filter follows the endpoints above | unset |
| `ORBO_ENGINE_MIRROR` | replaces `https://github.com/<path>` for the engine installers | unset |
| `ORBO_IMAGE_PREFIX` | replaces `ghcr.io/nareinnprs-create/orbo` in image references | unset |
| `ORBO_NPM_REGISTRY` | npm registry used for the deployment root's `bun install` | unset (`registry.npmjs.org`) |

### 3.1 Example: internal mirror standing in front of GitHub (no GHE)

```bat
set ORBO_RELEASES_API_URL=https://orbo-mirror.corp.example/github-api/repos/nareinnprs-create/ORBO/releases/latest
set ORBO_RELEASES_TARBALL_TEMPLATE=https://orbo-mirror.corp.example/github/codeload/nareinnprs-create/ORBO/tar.gz/refs/tags/{version}
set ORBO_RELEASES_ASSETS_TEMPLATE=https://orbo-mirror.corp.example/github/releases/nareinnprs-create/ORBO/releases/download/{version}/{asset}
set ORBO_ENGINE_MIRROR=https://orbo-mirror.corp.example/github
set ORBO_IMAGE_PREFIX=orbo-registry.corp.example/orbo
set ORBO_NPM_REGISTRY=https://npm-mirror.corp.example
:: no ORBO_RELEASES_TOKEN: the mirror is pre-authorized
```

`ORBO_ENGINE_MIRROR` maps by path: for the pinned Compose URL above, the app asks the mirror for
`{mirror}/docker/compose/releases/download/v5.5.1/docker-compose-windows-x86_64.exe`.

### 3.2 Example: GitHub Enterprise

```bat
set ORBO_RELEASES_API_URL=https://ghe.corp.example/api/v3/repos/acme-corp/ORBO/releases/latest
set ORBO_RELEASES_TARBALL_TEMPLATE=https://ghe.corp.example/codeload/acme-corp/ORBO/tar.gz/refs/tags/{version}
set ORBO_RELEASES_ASSETS_TEMPLATE=https://ghe.corp.example/acme-corp/ORBO/releases/download/{version}/{asset}
set ORBO_RELEASES_TOKEN=ghp_your_ghe_token_here
set ORBO_ENGINE_MIRROR=https://ghe-corpo-proxy.corp.example   :: or pre-seed per §7.2
set ORBO_IMAGE_PREFIX=orbo-registry.corp.example/orbo
set ORBO_NPM_REGISTRY=https://npm-mirror.corp.example
```

## 4. Corporate `.env` pre-seed

Copy `.env.example` to `%USERPROFILE%\ORBO\.env` before first launch (or drop it into whatever
deployment root you have chosen with `-Root`). Do not hand-write it whole: keys are added per
release. What to set in a corporate deployment:

| Key | Corporate value |
| --- | --------------- |
| `KEY_ENCRYPTION_KEY` | mint with `openssl rand -base64 32`. Production **refuses** the placeholder. |
| `POSTGRES_PASSWORD` | minted automatically if left empty; set from your vault if you manage it yourself |
| `ORBO_SINGLE_USER` | **remove/deactivate.** A single administrator with no sign-in is the default in `.env.example` and is not the corporate mode. |
| `BETTER_AUTH_URL` | where OAuth callbacks come back to: `https://<internal fqdn>:3001` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`, ≥32 chars |
| `TRUSTED_ORIGINS` | where the app is served from, e.g. `http://<internal fqdn>:3010` |
| `INITIAL_ADMIN_EMAILS` | comma-separated admins; nothing else grants the role, re-read on every sign-in |
| `GOOGLE_*`/`MICROSOFT_*`/`OKTA_*` | whichever ONE provider your org uses; several can be listed together (§4 `.env.example` shows redirect URIs) |
| `MICROSOFT_OAUTH_TENANT_ID` | your Entra **directory GUID**, not `common` (which admits personal accounts) |
| `SIGNIN_ALLOWED_EMAIL_DOMAINS` | comma-separated, exact match, no wildcards |
| `ORBO_ORGANIZATION_AUTH_URL` | your deployment's employee sign-in authority, if separate |
| `ORBO_PUBLIC_URL` | only when the API is behind a different public address than sign-in |
| `ORBO_GENERATIVE_UI` | set `false` when browser tabs must not reach the public internet for UI libraries |
| `INTELLIGENCE_*` keys | resolve via your own model gateway; see Wave-2 roadmap (`ORBO_KEYS` for gateway in §4 of `docs/configuration.md`) for the full set |

Two traps worth repeating: `PORT` and `SERVER_PORT` must agree when both are set (§4 of
`.env.example`), and `ORBO_SINGLE_USER=true` left in place means every visitor is an
administrator.

Telemetry defaults to off; there is nothing to pre-seed to keep it off.

## 5. Worker service (host / VM deployments)

`server` handles Bots; `worker` sweeps routines. Without a wrapper it is a background process
with no restart policy, so a routine worker that dies stays dead. The installers:

| Script | What it does |
| ------ | ------------ |
| `scripts/worker-install.ps1` | Windows scheduled task (`ORBOWorker`), boot trigger, runs as SYSTEM, no signed-in session |
| `scripts/worker-install.sh` | same, as a systemd unit on Linux |

For operation and what the three required settings are
(`DATABASE_URL`, `SERVER_INTERNAL_URL`, `WORKER_SHARED_SECRET`), see `docs/ops-worker.md`.

> Trap, again per-user: on Windows the scheduled task runs as SYSTEM; keep your MSI install
> running inside a user profile (§1), or work out where the deployment root ended up.

## 6. Updating

The desktop app shows a pinned bar when the release API (§3, `ORBO_RELEASES_API_URL`) advertises
a newer version than the deployment; pressing **Install** re-fetches the new release's
tarball, `container-images.json`, and migration assets, and recomposes with the digest-pinned
images. What IT controls:

- **Pin your version** by pointing `ORBO_RELEASES_API_URL` at your own JSON that still names an
  older release while you test — an entirely valid use (no publish, no prod change). The
  runtime image digests are pinned by `container-images.json`, so a change to the tarball does
  not move images.
- **Nothing at update time needs GitHub** if §3 is set: the update path follows your mirror.
- Offline-pinned behavior: no update prompt. To add a release into an offline-bundled install,
  the IT flow is: assemble the new bundle (§7), place the new tarball + `container-images.json`
  into the deployment root (replacing the ones the app recorded in its `.orbo-deployment`
  stamp), restart the app.

## 7. Offline bundle

What an offline bundle is: a directory IT builds on a connected machine and carries into an
air-gapped network. The scripts `scripts/offline-bundle-manifest.ps1` and
`scripts/offline-bundle-manifest.sh` (drop `.sh` on macOS/Linux, `.ps1` on Windows/PowerShell)
do NOT download; they hash a directory **you** pointed them at and write `MANIFEST.txt`.

### 7.1 What must be inside

| What | Why the deployment needs it |
| ---- | --------------------------- |
| `<version>.tar.gz` — release source tarball (from `codeload.github.com/.../tags/<v>`) | app fetches this at first launch; with a bundle, placed in the deployment root by |
| `container-images.json` | app writes it beside the deployment; pinned per image |
| desktop installer **for your platform** | `.msi`/`.dmg`/`.deb`/`.AppImage` you will install first |
| **Podman 6.1.1** installer for your platform (`.msi` for Win; `.pkg` arm64-only for macOS; N/A Linux — distro repo instead) | app is pinned to the sha256 in `install.rs`; a mismatch is refused, not run |
| **Compose 5.5.1** static binary for your platform | ditto |
| **Bun 1.3.14** `.zip` for your platform | ditto |
| (Optional) npm mirror access or `bun` cache copy | §7.3 |

If a file hashes to a different sha256 than `install.rs` records, the app refuses to use it — so
measuring the bundle before it crosses the air-gap matters, and that is what the manifest does.
The pinned digests are reproduced in the scripts' headers (`scripts/offline-bundle-manifest.ps1`
and the same table at the top of the `.sh` twin), so the check can run without a toolchain.

### 7.2 Verify the bundle

```powershell
# On the connected machine that assembled it, and again inside the air-gap:
pwsh scripts\offline-bundle-manifest.ps1 -Version 0.1.6 -Dir D:\orbo-offline -Out D:\orbo-offline\MANIFEST.txt
# Fail-closed confirmation on a platform with everything present:
pwsh scripts\offline-bundle-manifest.ps1 -Version 0.1.6 -Dir D:\orbo-offline -RequireAll
```

```bash
scripts/offline-bundle-manifest.sh 0.1.6 -d /opt/orbo-offline -o /opt/orbo-offline/MANIFEST.txt
scripts/offline-bundle-manifest.sh 0.1.6 -d /opt/orbo-offline --require-all
```

- No network is used by the manifest scripts. `--require-all`/`-RequireAll` exits 1 when any
  expected file of the platform set is still missing; single-platform bundles are allowed.
- Place your version into `-Version`/`-Dir`, not the scripts'. Manifest output lists, per
  artifact: sha256, size, name, either "matches pinned digest" / "DOES NOT match" for the three
  pinned engine installers, and what each is for. Missing artifacts are listed, but they are not
  a failure: a bundle is allowed to carry only its own platform's engine files.

### 7.3 npm dependencies offline (verified mechanism, bun 1.3.14)

Empirically verified on this machine (bun 1.3.14; `bun install --help`, then a temp-project
install with `--verbose` watching which host was reached):

- `bun install --registry=<url>` — the CLI flag **works**, and its `--help` says it overrides
  `.npmrc`, `bunfig.toml` and environment variables. Strongest, and choosing it means an IT
  department's existing `.npmrc` (per-user `%USERPROFILE%\.npmrc` scoping a registry) cannot
  shadow the mirror.
- `NPM_CONFIG_REGISTRY=<url>` / `BUN_CONFIG_REGISTRY=<url>` — both work as environment
  variables. Verified to be honored over a `.npmrc`, but weaker than the CLI flag.
- `%USERPROFILE%\.npmrc` `registry=` beats **`bunfig.toml`'s `[install] registry`** in the
  deployment root — verified. Project-`bunfig.toml`-only wins once no user `.npmrc` names a
  registry.
- The user `.npmrc` also adds a `_authToken` per host; on a mirror without that host's token
  line, cases resolved empty authentication. Keep the mirror key in one place (`ORBO_NPM_REGISTRY`
  set by IT or the deploy hook) rather than counting on the end user's config.
- No offline mode exists: `bun install --offline` is not offered in 1.3.14; `bun pm cache`
  prints `~/.bun/install/cache` (and `bun pm cache rm` clears it); **there is no cache export or
  "populate from a copied directory" command**. A copied cache directory is undocumented
  best-effort, not a supportable offline story. The supported story is a registry mirror that is
  reachable at install time, with `ORBO_NPM_REGISTRY` set (or a `bunfig.toml` `[install]
  registry` line pre-seeded into the deployment root).

**Instruction for `stack.rs` (`R-W1-4`)**: pass the override on the command line, i.e. when
`ORBO_NPM_REGISTRY` is set, run:

```
bun install --registry=<value of ORBO_NPM_REGISTRY> --frozen-lockfile --ignore-scripts
```

instead of budging file state. Read `ORBO_NPM_REGISTRY` (trimmed; empty = unset) from the
process environment at install time — meaning a value the operator sets before launching ORBO is
honored. This is the mechanism that crushes every ambient `.npmrc`/`bunfig.toml`/env override,
because bun ranks the CLI flag highest. The dual-use note: a deployment fetched from a source
tree may itself carry a `bunfig.toml`; CLI wins over that, so the hook must ADD the flag, not
rely on writing/editing a bunfig.toml into the root.

## 8. Pointers

- `docs/ops-worker.md` — worker service
- `docs/self-host.md`, `docs/deployment.md` — cramming-release path without the desktop app
- `docs/releasing.md`, `docs/versioning.md` — how a version is cut and `container-images.json`
  attaches
- `docs/configuration.md` — every `.env` key in full
- `.env.example` — the pre-seed starting point
