---
name: orbo-tauri-windows-signing
description: >
   Configure and troubleshoot Authenticode code signing for Tauri Windows
   builds (signed `orbo-desktop.exe` payload + NSIS `*-setup.exe` installer;
   Desktop CI separately builds an unsigned `.msi`) using the provisioned
   code-signing certificate stored in Azure Key Vault (non-exportable key),
   signed via AzureSignTool authenticated with GitHub OIDC. Covers
   tauri.conf.json signCommand wiring, the CI signing seam (mode gate:
   none | keyvault), the separation between Authenticode signing, Tauri
   updater (minisign) keys, and NuGet package author signing, plus the
   Azure/Entra access model.
  USE FOR: adding Windows signing to a Tauri app, wiring the release
  workflow to the vault, debugging signature, login, permission, or
  SmartScreen failures, or answering "which cert / which key / which tool /
  which access right signs what".
---

# Tauri Windows Signing with Azure Key Vault

## Status: provisioned for ORBO — playbook for additional repos

ORBO's signing lane is **provisioned and live**: DigiCert certificate
`code-signing` in vault `cpk-signing-kv`, GitHub environment
`windows-signing`, federated credential
`desktop/signing/azure-federation.json`, operator doc
`docs/windows-signing.md`. That lane's exact values live in
`docs/windows-signing.md` and the `windows-signing` environment variables —
do not copy them into other repos' configs.

Everything below is still a playbook, but for **additional repositories**:
fill in the `<PLACEHOLDERS>` with that repo's values; do not invent
credentials, IDs, or URLs, and do not reuse ORBO's environment-scoped
federated credential subject for another repo.

Conventions used in this skill:

- Owner repository: `nareinnprs-create/ORBO` (private).
- `<AZURE_KEY_VAULT_URL>` — owner's vault URL.
- `<CODE_SIGNING_CERT_NAME>` — owner's certificate name in that vault.
- `<AZURE_TENANT_ID>` / `<AZURE_CLIENT_ID>` — owner's Entra
  tenant and federated app (client) IDs, stored as environment variables.
- `<PUBLISHER_SUBJECT>` — owner's publisher subject (cert subject).

## Context: what signs what

A typical signing setup has **up to four independent mechanisms**. Never
conflate them — they use different keys, different tools, and different
verification paths:

| Mechanism | Key | Tool | Applies to |
|---|---|---|---|
| NuGet **author signature** | Owner code-signing cert in Azure Key Vault (non-exportable key) | `NuGetKeyVaultSignTool` | `*.nupkg` only |
| **Authenticode** (this skill) | Same owner cert, same vault | `AzureSignTool` | Windows PE binaries: `.exe`, `.dll`, `.msi` (incl. Tauri builds) |
| Assembly strong-naming | Owner strong-name key file (e.g. `<KEY>.snk`) | MSBuild | .NET assemblies; unrelated to either signature |
| Tauri **updater** signature | Tauri minisign key pair (NOT the vault cert) | `tauri signer` | Update manifests for `tauri-plugin-updater` |

Additional facts that agents routinely get wrong:

- nuget.org applies its own **repository signature** automatically on push.
  The author signature is what flips a package to "signed" on the gallery;
  it is not needed for Authenticode at all.
- Symbol packages (`*.snupkg`) are **intentionally not** author-signed.
- Code-signing certificates are commonly OV (not EV) validation. With OV,
  Windows SmartScreen reputation builds per-publisher over signed releases
  rather than being granted instantly — an unsigned-looking warning on a
  brand-new app is expected until reputation accrues, and is not a signing
  failure.
- The private key **never leaves the HSM**. Every signature — NuGet or
  Authenticode — is a `keys/sign` operation executed inside the vault.
  Never attempt to export the key or generate a `.pfx`.

ORBO reference implementation (current repo, no upstream paths): the
protected signing job in `.github/workflows/desktop-signing.yml`, the
`tauri.windows-signing.conf.json` overlay plus wrapper in
`desktop/scripts/sign-windows.ps1`, and the operator doc in
`docs/windows-signing.md`. When this skill says "the existing signing
lane", it means that ORBO lane — not any upstream repository.

## Task: wire signing into a Tauri build

### 1. Point `signCommand` at a wrapper script

In a signing overlay (ORBO: `desktop/src-tauri/tauri.windows-signing.conf.json`,
kept out of the base config so ordinary builds stay unsigned), override the
default `signtool.exe` invocation. Tauri calls this command once per binary
**and** once per installer, substituting `%1` with each file path. Paths in
the overlay are relative to `desktop/src-tauri/`:

```json
{
  "bundle": {
    "targets": ["nsis"],
    "windows": {
      "signCommand": {
        "cmd": "pwsh",
        "args": [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          "../scripts/sign-windows.ps1",
          "%1"
        ]
      }
    }
  }
}
```

Do NOT name the overlay `tauri.windows.conf.json`: Tauri automatically merges
that filename into every Windows build. Do NOT configure the legacy
`certificateThumbprint` / `digestAlgorithm` /
`timestampUrl` fields — those expect a locally installed certificate with a
locally accessible key and cannot reach a Key Vault HSM.

### 2. Create the wrapper script

`desktop/scripts/sign-windows.ps1` — the existing signing lane's wrapper
(gated on `WINDOWS_SIGNING=keyvault`, same vault URL, cert name, digest,
and timestamp authority). It requests a fresh Key Vault token on **each**
invocation (Tauri may spend a long time building before it signs), masks it
in logs, and clears it afterward — the token never lands in `GITHUB_ENV`,
outputs, or artifacts:

```powershell
param([Parameter(Mandatory)][string]$Path)
if ($env:WINDOWS_SIGNING -ne 'keyvault') { throw 'Signing requires WINDOWS_SIGNING=keyvault.' }
$env:AZURE_ACCESS_TOKEN = az account get-access-token `
  --resource https://vault.azure.net --query accessToken --output tsv --only-show-errors
Write-Host "::add-mask::$env:AZURE_ACCESS_TOKEN"
AzureSignTool.exe sign `
  -fd sha256 `
  -tr http://timestamp.digicert.com `
  -td sha256 `
  -kvu $env:AZURE_KEY_VAULT_URL `
  -kvc $env:CODE_SIGNING_CERT_NAME `
  -kva $env:AZURE_ACCESS_TOKEN `
  -d ORBO `
  $File
```

Flag mapping from the NuGet lane (verify you kept them identical):

| NuGetKeyVaultSignTool | AzureSignTool |
|---|---|
| `--file-digest sha256` | `-fd sha256` |
| `--timestamp-rfc3161 http://timestamp.digicert.com` | `-tr http://timestamp.digicert.com` |
| `--timestamp-digest sha256` | `-td sha256` |
| `--azure-key-vault-url` | `-kvu` |
| `--azure-key-vault-certificate` | `-kvc` |
| `--azure-key-vault-accesstoken` | `-kva` |

### 3. Wire the workflow with OIDC (no long-lived secrets)

The signing job authenticates to Azure with GitHub OIDC federation — the
same pattern as the existing signing lane (ORBO:
`.github/workflows/desktop-signing.yml` `sign` job, `azure/login` v3.1.0
pinned by SHA, pinned AzureSignTool 7.0.1 executable verified by SHA-256).
Do not introduce a client secret.

```yaml
- uses: azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 # v3.1.0
  with:
    client-id: ${{ vars.AZURE_CLIENT_ID }}   # federated to GH OIDC
    tenant-id: ${{ vars.AZURE_TENANT_ID }}
    subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
- run: bun scripts/desktop-version.ts internal
  working-directory: desktop
- run: bun run tauri build --config src-tauri/tauri.windows-signing.conf.json --config src-tauri/tauri.build-version.conf.json --bundles nsis
  working-directory: desktop
  env:
    WINDOWS_SIGNING: keyvault
```

The workflow job MUST declare `permissions: id-token: write` (with
`contents: read`) — without it GitHub will not issue an OIDC token at all.
This is the single most common cause of a first-run login failure in a new
workflow or repo.

### 4. Keep the mode gate (safe default)

Follow the established `signing-mode` seam: the workflow input defaults to
`none` (unsigned, safe to merge before any vault is provisioned) and only
`keyvault` enables signing. For Tauri, implement the gate by either:

- merging a signing overlay (e.g. `tauri.windows-signing.conf.json`)
  containing the `signCommand` only in the release job, or
- omitting `signCommand` from the base config and signing the built
  `.exe` / `.msi` as an explicit post-build step when mode = keyvault.

Both are acceptable; the invariant is that an unprovisioned environment
never fails (or silently signs) because the seam exists.

## Access rights: what changes and what doesn't

The vault-side permission model is **identical** for NuGet signing and
Authenticode. AzureSignTool requires exactly: **Key: Sign**, **Secret:
Get**, **Certificate: Get** — the same three operations a NuGet vault
signing tool already performs on every release. Therefore, when both lanes
share one vault and one identity:

- **No new Azure RBAC role assignments** are needed (existing Key Vault
  Crypto User / Certificate User coverage, or legacy access policy, already
  covers the operations).
- **No vault configuration changes** — same vault, same certificate, same
  `keys/sign` operation.
- **No new access policies, no key export, no `.pfx` generation.**

The ONLY thing that may need an Entra ID change is the **federated
credential** that maps GitHub OIDC tokens to the app registration, and only
when the Tauri build runs from somewhere the current credential does not
cover.

### Same repo / same environment → change nothing

If the Tauri signing job runs in `nareinnprs-create/ORBO` under the same
environment or ref as the existing signing job, the existing
federated credential covers it. The existing `AZURE_CLIENT_ID`
and `AZURE_TENANT_ID` just work.

### Different repo → add one federated credential

Federated credential subjects are **exact-match only** — no wildcards, no
org-wide `repo:org/*` coverage. A credential scoped to
`repo:nareinnprs-create/ORBO:...` does not cover any other repository. On
the SAME app registration the existing signing lane uses, add a new
federated credential:

- **Issuer:** `https://token.actions.githubusercontent.com`
- **Audience:** `api://AzureADTokenExchange`
- **Subject:** the new repo's token subject, e.g.
  `repo:<owner>/<tauri-repo>:environment:release` or
  `repo:<owner>/<tauri-repo>:ref:refs/heads/main`

Subject format caveat (important for 2026+): repositories created after
July 15, 2026 emit an **immutable subject format** by default —
`repo:owner@owner-id/repo@repo-id:ref:...` with numeric IDs embedded.
If the Tauri repo is brand new, its OIDC token's `sub` claim uses that
format and the credential subject must match it exactly. Before creating
the credential, run a debug workflow that requests the OIDC token and
prints the `sub` claim; copy it verbatim.

Alternative for many repos: Entra **flexible federation** (claims-matching
expressions) allows a single credential to cover multiple repositories —
prefer it when a third or fourth signing repo becomes likely.

### Cross-repo checklist (complete)

In the OTHER repository:

1. Add the federated credential on the existing app registration (above).
2. Set repo variables: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`
   (same values as the owner repo), plus `AZURE_KEY_VAULT_URL` and
   `CODE_SIGNING_CERT_NAME`. Values do NOT share across repos — either
   recreate them per repo, or hoist the non-sensitive values (tenant ID,
   client ID, vault URL, cert name) to organization-level Actions
   variables so both repos read one source of truth.
3. Create the signing environment (e.g., `release`) if the credential
   subject is environment-scoped, and apply protection rules to it.
4. Declare `permissions: id-token: write` on the signing job.
5. Install AzureSignTool in the job the way the ORBO lane does: download the
   pinned `AzureSignTool` release executable and verify its SHA-256 before use.
6. Add the signing overlay (`tauri.windows-signing.conf.json`, never
   `tauri.windows.conf.json`) + wrapper script (repo-local).

### Blast radius: shared identity vs separate identity

Adding the credential to the existing app registration means the Tauri
repo shares the exact identity that can invoke `keys/sign` on the owner's
code-signing key: anyone who can trigger the signing job in that repo can
sign anything with the owner cert. Since the cert is typically OV,
SmartScreen reputation accrues to the shared publisher — a compromised
signing job in any repo damages the owner's whole signing reputation.
Mitigations that cost nothing in Azure:

- Scope the federated credential to a **protected environment** (subject
  `...:environment:release`) with required reviewers, rather than a plain
  branch ref, so signing only runs after approval.
- Keep the `signing-mode: none | keyvault` gate in the new repo, matching
  the ORBO seam, so unprovisioned PRs can never trigger signing.

If isolation is required instead, create a SEPARATE app registration for
the Tauri repo — this is the one variant that DOES require new Azure
access rights, because the new service principal must be granted Key Vault
signing/cert-read rights on the vault manually.

## Verification

After a build, verify before publishing:

```powershell
# Authenticode + certificate chain + RFC 3161 timestamp
signtool verify /pa /v /all path\to\App.exe

# PowerShell alternative
Get-AuthenticodeSignature path\to\App.exe | Format-List

# Expected: Status Valid, SignerCertificate subject <PUBLISHER_SUBJECT>,
# TimeStamperCertificate from the timestamp authority, timestamped within
# the cert validity.
```

For NuGet packages (separate lane, same vault):
`dotnet nuget verify Package.nupkg --verbosity detailed`.

Bringing a new repo online, in order:

1. Debug workflow: request the OIDC token and print the `sub` claim.
2. Create the federated credential with that exact subject.
3. `azure/login`, then read-only smoke test:
   `az keyvault certificate show --vault-name <vault> --name <cert>`.
4. If the smoke test passes, `keys/sign` will pass too — the sign
   permission is already proven by every vault-backed release.
5. Full `tauri build` with signing enabled.

## Failure modes and diagnosis

- **azure/login "federated credential not found"**: subject mismatch. Print
  the job's `sub` claim and compare character-for-character with the
  credential subject — watch for the immutable format
  (`owner@owner-id/repo@repo-id`) on repos created after 2026-07-15, and
  for environment vs ref scoping.
- **OIDC token not issued / login gets no token**: the job lacks
  `permissions: id-token: write`.
- **"signCommand" not invoked / binaries unsigned**: check that the config
  landed under `bundle.windows` (not a v1-style top-level `windows` key),
  and that the command exits 0 — a non-zero exit fails the bundle step.
- **AzureSignTool not found**: the ORBO lane downloads the pinned
  `AzureSignTool` release executable and verifies its SHA-256 in the same
  job that runs the build — replicate that rather than installing a
  floating `dotnet tool` version.
- **401 / invalid token from the vault**: the access token must be scoped
  to `https://vault.azure.net` (Key Vault resource), not Azure Graph or
  management endpoints. Re-check the `--resource` in the token command.
- **403 on sign in a NEW repo but not the old one**: unexpected — same SPN,
  same operations. Check whether someone created a separate app registration
  for the new repo instead of reusing the existing one; if so, that SPN
  needs signing/cert-read rights on the vault.
- **Signature valid locally but SmartScreen still warns**: expected for OV
  certificates on new apps. It is a reputation state, not a defect — do not
  "fix" it by changing certificates or re-signing repeatedly.
- **Updater verification failing**: updater signatures come from the
  Tauri minisign key pair (`tauri signer generate`), never from the vault
  cert. Generate and configure them separately if updater support is needed.
