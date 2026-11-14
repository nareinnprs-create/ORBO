# Desktop updater + deep links — re-add scaffold (owner-pending)

The Tauri updater and the `orbo:` deep-link handler were **removed, not half-configured**: in
Tauri v2 the `plugins.updater` / `plugins.deep-link` config keys are inert without their crates,
and there are no endpoints or route handlers yet. `desktop/src-tauri/tauri.conf.json:58` carries
the TODO comment; PLAN.md §10.B.14 (`PLAN.md:302`) records the decision. This document holds the
exact blocks and steps for re-adding them once the owner provides the two missing inputs:

- **Domain** that serves the app and its update manifests. `[OWNER: release domain, e.g.
  updates.example.com]`
- **Signing keys storage** — where the minisign private key lives. `[OWNER: secret manager /
  vault path]` — see `Tauri-signing-SKILL.md` for the house rules (the updater key is NOT the
  vault/MSI signing cert).

Nothing in `desktop/` should change until both exist. Do not invent a URL.

## 1. `tauri.conf.json` blocks to re-add

Inside the existing `"plugins": { ... }` object (which currently holds only the `$comment` at
line 58):

```json
"plugins": {
  "updater": {
    "active": true,
    "dialog": true,
    "pubkey": "[OWNER: contents of ORBO.key.pub from step 2, verbatim]",
    "endpoints": [
      "https://[OWNER: release domain]/updates/{{target}}/{{arch}}/{{current_version}}"
    ],
    "windows": {
      "installMode": "passive"
    }
  },
  "deep-link": {
    "desktop": {
      "schemes": ["orbo"]
    }
  }
}
```

And in `"bundle"` — without `createUpdaterArtifacts` no update artifacts are produced, so the
endpoint has nothing to serve:

```json
"createUpdaterArtifacts": true
```

The `endpoints` URL is the Tauri v2 static-JSON pattern: `{{target}}` (`darwin`/`linux`/
`windows`), `{{arch}}` (`x86_64`/`aarch64`), `{{current_version}}` for the server-side
latest-check. The server answers `200` with a latest manifest or `204` when current — any static
file host or the ORBO server itself can serve it once the domain exists.

## 2. Generate the minisign key pair

Tauri's updater verifies minisign signatures, NOT the vault cert and NOT the MSI Authenticode
signature. Generate a dedicated pair:

```sh
bunx @tauri-apps/cli signer generate -w ~/.tauri/ORBO.key
# prompts: password (recommended), writes ORBO.key (private) + ORBO.key.pub (public)
```

- `ORBO.key.pub` goes **in the repository** — it is the `"pubkey"` value above and ships in every
  build.
- `ORBO.key` (private) goes to `[OWNER: secret manager / vault path]`, encrypted, with the
  password in the same store. Losing it means shipping a new pubkey in a signed release, since
  the old key can no longer sign anything the installed base trusts.

## 3. Release-flow signing

Every artifact the updater can hand out must be signed at build time:

```sh
# env, set for the release build only (CI secret, never committed)
TAURI_SIGNING_PRIVATE_KEY_PATH=/path/to/ORBO.key   # or TAURI_SIGNING_PRIVATE_KEY=<contents>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='[OWNER: key password]'

bun run --filter desktop tauri build   # or the existing desktop CI job
```

With `createUpdaterArtifacts: true`, the build emits beside each installer a `.sig` (minisign)
plus the update artifacts (`*.app.tar.gz`, `*.nsis.zip`/`*.msi.zip`, `*.AppImage.tar.gz`,
`*.deb`/`*.rpm` tarballs per Tauri v2's updater bundle list). Publish installers AND update
artifacts AND a `latest.json` manifest per platform under the `endpoints` path. The manifest
fields (`version`, `pub_date`, `platforms.<target>.signature` + `url`) are what the plugin
consumes; the `signature` value is the `.sig` file's contents.

## 4. Crates and code that must land with the config

Config alone does nothing in Tauri v2. The re-add commits need, in lockstep:

1. `desktop/src-tauri/Cargo.toml`: `tauri-plugin-updater` and `tauri-plugin-deep-link` (pin the
   same Tauri major as `tauri` itself).
2. `desktop/src-tauri/src/lib.rs` (or `main.rs`): `.plugin(tauri_plugin_updater::Builder::new().build())`
   and the deep-link plugin registration with its route map (`chat/[channelId]`, approvals,
   spaces pages, plus the `#/spaces/…` hash-link redirect map per
   `docs/planning/31-phase8-wrapper-plan.md` G3).
3. `desktop/src-tauri/capabilities/*.json`: `updater:default` (and `deep-link:default`) in the
   main window's permissions.
4. The single-instance plugin already forwards second-launch argv (`Cargo.toml` ships it), which
   is what makes cold-start deep links testable.
5. On macOS, deep links also need the `CFBundleURLTypes` entry — `tauri-plugin-deep-link`'s
   `deep-link:desktop` config handles the Info.plist injection at build time in v2, but verify the
   built bundle registers `orbo`.

## 5. Re-add checklist

- [ ] `[OWNER: release domain]` chosen, serving HTTPS, DNS live (PLAN §10.A.2/7).
- [ ] Minisign pair generated (§2); public key committed; private key + password in
      `[OWNER: secret manager / vault path]`.
- [ ] `plugins.updater` + `plugins.deep-link` blocks and `bundle.createUpdaterArtifacts` added to
      `desktop/src-tauri/tauri.conf.json`; the line-58 `$comment` TODO removed in the same commit.
- [ ] Crates + plugin init + capabilities (§4) added; `tauri dev` boots clean.
- [ ] Endpoint serving a `latest.json` for `darwin`/`windows`/`linux` artifacts.
- [ ] End-to-end: install release N, publish N+1, app detects, verifies the minisign signature,
      installs, restarts on the new version. Also verify a tampered artifact is REFUSED.
- [ ] `orbo://` deep link opens the right route from a cold start and a second launch.
- [ ] Update `PLAN.md` §10.B.14 and `docs/planning/31-phase8-wrapper-plan.md` G3/G4 to
      resolved-with-endpoint.

## 6. Status — 2026-11-14: pipeline live (keys + endpoint + first signed artifact)

The two owner inputs from the top now exist:

- **Domain/endpoint**: `https://dl.orbo.opraiz.com/latest.json` — R2 bucket `orbo-artifacts`
  behind a custom domain (infra details: `deploy/cloudflare-infra.md`, untracked).
- **Signing keys**: dedicated Tauri minisign pair generated with `tauri signer generate`
  (key ID `4A38783C36225F2E`). Private key lives at `%USERPROFILE%\.orbo-updater\ORBO.key`
  with restricted ACL (never committed; password held with it, off-repo). **Public key,
  verbatim value for `"pubkey"`:**

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDRBMzg3ODNDMzYyMjVGMkUKUldRdVh5STJQSGc0U3FvS2xGWWtpMWhlWkVjUW9JMmZGYmNLa2cwU3FjUE5Vem5lSHV1QXRhY2cK
```

**Endpoint to use**: because R2 is static hosting, use the single-manifest pattern —
`"endpoints": ["https://dl.orbo.opraiz.com/latest.json"]` — with a `platforms` map inside the
manifest (`windows-x86_64`, etc.). The plugin compares `version` client-side, so no
`{{current_version}}` placeholder and no per-target path layout is needed (that pattern in §1
above is the dynamic-server alternative; either works, pick one).

**First artifact published** (Windows x64): `ORBO_0.1.0_x64_en-US.msi` + `.sig` + manifest at
the URL above, all HTTP 200 and verified. Version is 0.1.0 (the artifact's real version): a
fresh 0.1.6 build was attempted once and is blocked by pre-existing compile errors in
owner-WIP `desktop/src-tauri/src/windows.rs` (fullwidth-colon char literals at lines
254/286/291). After that file compiles, rebuild with `TAURI_SIGNING_PRIVATE_KEY_PATH` +
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set and `createUpdaterArtifacts: true` — the `.sig` files
are then emitted at build time; upload installer + sig, overwrite `latest.json`, and purge the
CDN cache for the manifest URL.

Full state, exact config snippet, and remaining owner actions: `deploy/desktop-updater.md`
(untracked).
