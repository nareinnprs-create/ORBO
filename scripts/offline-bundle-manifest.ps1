#requires -Version 5.1
#
# This file is PowerShell and cannot be read by sh, bash or Git Bash: those shells meet the first
# PowerShell construct below and stop with a syntax error, having run nothing. The line above that
# construct is this one. Run this script as:
#
#   powershell -NoProfile -File scripts\offline-bundle-manifest.ps1    (Windows PowerShell 5.1)
#   pwsh -NoProfile -File scripts\offline-bundle-manifest.ps1          (PowerShell 7+)
#
<#
.SYNOPSIS
  Write the sha256 manifest for an ORBO offline bundle: a directory an IT operator has already
  assembled on a machine that DOES have internet, to carry through an air-gap into a deployment.

  This script is a native mirror of scripts/offline-bundle-manifest.sh. It downloads NOTHING. It
  walks a directory the operator points it at, hashes what is there, and reports what the bundle
  needs that is still missing. The manifest is idempotent: rerunning rewrites it, and repointing
  -Dir at a fuller directory finds more of the set.

  What an offline bundle needs, and where each of them normally comes from:
    1. The release source tarball for one version. This is what the desktop app fetches from
       codeload.github.com on first launch (desktop/src-tauri/src/deployment.rs) and unpacks as
       the deployment root. With the bundle it comes from disk instead, placed in the deployment
       root by hand (there is no "install from local tarball" button yet; see docs/it-deployment.md
       for the exact procedure).
    2. container-images.json, the release asset digest-pinning every image the version runs. The
       app fetches it from the same release; with the bundle it is placed beside the tarball in
       the deployment root.
    3. The desktop installer for your platform, from the same release (a .msi on Windows, .dmg on
       macOS, .deb/.AppImage on Linux).
    4. The pinned engine installers the app also downloads at first launch: Podman, Compose and
       Bun. What the app fetches is pinned by sha256 in desktop/src-tauri/src/install.rs, so an
       offline bundle can carry them and the app will accept them into its cache only if the
       digests still match. The pinned versions and digests are reproduced in the Expected table
       below, FROM install.rs, so an offline bundle can pre-verify without building the app. The
       URL column is where the app would have fetched them; the bundle replaces that host with an
       internal mirror or plain file copy.
    5. (Informational, not hashed by this script) The npm dependency set the deployment's
       `bun install --frozen-lockfile` resolving against a *mirrored* registry:
       bun 1.3.14 has no offline command, `bun pm cache` only prints the cache directory
       (~/.bun/install/cache), and a copied cache is undocumented, best-effort behavior. The
       reliable offline npm story is an internal registry mirror reachable at install time, set
       with ORBO_NPM_REGISTRY (or ORBO_NPM_REGISTRY passthrough by the app, desktop/src-tauri/
       src/stack.rs) - see docs/it-deployment.md.

  Where each file is looked up (default to what the filenames are actually called):
    $Dir\{version}.tar.gz                       (release tarball)
    $Dir\container-images.json                  (release asset)
    $Dir\*.msi / *.dmg / *.deb / *.AppImage     (installers; version matched where the name says ORBO_)
    $Dir\podman-installer-*.msi|*.pkg           (Podman 6.1.1, names as install.rs writes them)
    $Dir\docker-compose-*                       (Compose 5.5.1)
    $Dir\bun-*.zip                              (Bun 1.3.14)

  The Expected digests below are copied verbatim from desktop/src-tauri/src/install.rs so that an
  air-gapped pre-verify does not need a toolchain. Re-record them here when install.rs moves:

    File                                     From install.rs (podman_download / compose_download / bun_download)
    podman-installer-windows-amd64.msi       https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
                                             sha256 91d0e8ea0846c0151d531c88c329bb2729387231e4d1e42306a8e3ae9d09fc8a
    podman-installer-windows-arm64.msi       https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
                                             sha256 8ededac563c3b96abe55560f3379962ff59fd8bda1a185ed221891cb6ccf5cba
    podman-installer-macos-arm64.pkg         https://github.com/podman-container-tools/podman/releases/download/v6.1.1/...
                                             sha256 9c7b90b406681e5458d69cdb1164a589f7c9b214cab1ca6705fe375876491c09
                                             (Podman 6.1.1 publishes an arm64 macOS package only; there is no
                                             Intel-Mac Podman installer, matching install.rs)
    docker-compose-windows-x86_64.exe        https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 a3c0c73033eaede90210345d0cc2233edf4fab8fe0282a91dad8fd8436809d2f
    docker-compose-windows-aarch64.exe       https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 4bbb5d1ecc75bde1a9ca4afac43f5907c0d3bd0f88c7f00bf481ee7c8c1737be
    docker-compose-darwin-x86_64             https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1
    docker-compose-darwin-aarch64            https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5
    docker-compose-linux-x86_64              https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576
    docker-compose-linux-aarch64             https://github.com/docker/compose/releases/download/v5.5.1/...
                                             sha256 732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7
    bun-windows-x64-baseline.zip            https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f
    bun-windows-aarch64.zip                  https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 89841f5a57f2348b67ec0839b718f4bf4ea7d07c371c9ba4b77b6c790f918953
    bun-darwin-x64-baseline.zip              https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 3e35ad6f53971a9834bf9e6786e2adf72b5f1921cc9a9c5fde073d2972944076
    bun-darwin-aarch64.zip                   https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620
    bun-linux-x64-baseline.zip               https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7
    bun-linux-aarch64.zip                    https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/...
                                             sha256 a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b

  Exit codes: 0 manifest written (missing files are listed inside, not a failure - an IT
  department typically bundles only its own platform's files); 1 usage error or a stated file is
  not a file; 2 a directory to write into does not exist.

.EXAMPLE
  pwsh scripts\offline-bundle-manifest.ps1 -Version 0.1.6 -Dir D:\orbo-offline -Out D:\orbo-offline\MANIFEST.txt

.EXAMPLE
  pwsh scripts\offline-bundle-manifest.ps1 -Tag 0.1.6 -Dir D:\orbo-offline   # -Tag is an alias of -Version

.EXAMPLE
  pwsh scripts\offline-bundle-manifest.ps1 -Version 0.1.6 -Out manifest.txt  # hashes the current directory

.EXAMPLE
  pwsh scripts\offline-bundle-manifest.ps1 -Help
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [Alias('Tag')]
  [string]$Version,

  [Alias('Dir')]
  [string]$BundleDir,

  [string]$Out,

  # Refuse the run when ANY expected file of the platform set is still missing from $BundleDir,
  # instead of only noting it inside the manifest. Useful as the operator's checklist before
  # sealing the bundle. Exit 1 when something is missing.
  [switch]$RequireAll,

  # Show this help and exit.
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Pinned engine installers, FROM desktop/src-tauri/src/install.rs so the
# bundle overview can pre-verify without a toolchain. Empty digest = "any
# content; this script only records it" - used for artifacts ORBO does not run
# itself (installers and the tarball), where an operator's own download counts.
# ---------------------------------------------------------------------------
$PodmanVersion = '6.1.1'
$ComposeVersion = '5.5.1'
$BunVersion = '1.3.14'

$PodmanDigest = [ordered]@{
  'podman-installer-windows-amd64.msi' = '91d0e8ea0846c0151d531c88c329bb2729387231e4d1e42306a8e3ae9d09fc8a'
  'podman-installer-windows-arm64.msi' = '8ededac563c3b96abe55560f3379962ff59fd8bda1a185ed221891cb6ccf5cba'
  'podman-installer-macos-arm64.pkg'   = '9c7b90b406681e5458d69cdb1164a589f7c9b214cab1ca6705fe375876491c09'
}
$ComposeDigest = [ordered]@{
  'docker-compose-windows-x86_64.exe'   = 'a3c0c73033eaede90210345d0cc2233edf4fab8fe0282a91dad8fd8436809d2f'
  'docker-compose-windows-aarch64.exe'  = '4bbb5d1ecc75bde1a9ca4afac43f5907c0d3bd0f88c7f00bf481ee7c8c1737be'
  'docker-compose-darwin-x86_64'        = 'a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1'
  'docker-compose-darwin-aarch64'       = '998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5'
  'docker-compose-linux-x86_64'         = 'db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576'
  'docker-compose-linux-aarch64'        = '732e3a84c1a0f67256ce80bc2598a24546b10ca05f9faa97efceb1171ece2ef7'
}
$BunDigest = [ordered]@{
  'bun-windows-x64-baseline.zip' = '538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f'
  'bun-windows-aarch64.zip'      = '89841f5a57f2348b67ec0839b718f4bf4ea7d07c371c9ba4b77b6c790f918953'
  'bun-darwin-x64-baseline.zip'  = '3e35ad6f53971a9834bf9e6786e2adf72b5f1921cc9a9c5fde073d2972944076'
  'bun-darwin-aarch64.zip'       = 'd8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620'
  'bun-linux-x64-baseline.zip'   = 'a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7'
  'bun-linux-aarch64.zip'        = 'a27ffb63a8310375836e0d6f668ae17fa8d8d18b88c37c821c65331973a19a3b'
}

function Show-Help {
  Get-Help $PSCommandPath -Full | Out-String | Write-Host
  exit 0
}

function Write-OrboRed { param($Text) Write-Host "  $Text" -ForegroundColor Red }
function Write-OrboGreen { param($Text) Write-Host "  $Text" -ForegroundColor Green }

function Get-Digest([string]$Path) {
  (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Add-Line($Lines, [string]$Digest, [string]$Path, [string]$Expected, [string]$Why) {
  $hash = $Digest
  $size = (Get-Item -LiteralPath $Path).Length
  $found = 'present'
  if ($Expected) {
    if ($hash -ieq $Expected) {
      $found = "matches pinned digest"
    } else {
      $found = "DOES NOT match pinned digest $Expected"
    }
  }
  $Lines.Add(("{0}  {1,-8} {2}  [{3}]  {4}" -f $hash, $size, (Split-Path -Leaf $Path), $found, $Why)) | Out-Null
}

if ($Help) { Show-Help }

if (-not $Version) { $Version = '0.1.6' }

if (-not $BundleDir) { $BundleDir = (Get-Location).ProviderPath }
if (-not (Test-Path -LiteralPath $BundleDir -PathType Container)) {
  Write-OrboRed "Not a directory: $BundleDir"
  exit 1
}
$BundleDirResolved = (Resolve-Path -LiteralPath $BundleDir).ProviderPath

if (-not $Out) { $Out = Join-Path $BundleDirResolved 'MANIFEST.txt' }
$outParent = Split-Path -Path $Out
if (-not $outParent) { $outParent = '.' }
if (-not (Test-Path -LiteralPath $outParent -PathType Container)) {
  Write-OrboRed "Not a directory: $outParent"
  exit 2
}
$outLeaf = Split-Path -Path $Out -Leaf
$OutResolved = Join-Path (Resolve-Path -LiteralPath $outParent).ProviderPath $outLeaf

# ---------------------------------------------------------------------------
# What the bundle expects, per artifact. Order matters: tarball first, then
# the manifest, then installers, then the engine pins.
# ---------------------------------------------------------------------------
$Lines = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]
$present = 0

$timestamp = (Get-Date).ToUniversalTime().ToString('u')
$Lines.Add("ORBO offline bundle manifest") | Out-Null
$Lines.Add("version: $Version") | Out-Null
$Lines.Add("directory: $BundleDirResolved") | Out-Null
$Lines.Add("written: $timestamp") | Out-Null
$Lines.Add("") | Out-Null
$Lines.Add("Each line: sha256  bytes  filename  [how it compares to the digest install.rs pins]  what it is in the deployment.") | Out-Null
$Lines.Add("") | Out-Null

# 1. Source tarball. There is no digest to compare against: the release publishes none and the
# app fetches it over https, so the bundle's checksum is what IT pins in their CMDB.
$tarball = Join-Path $BundleDirResolved "$Version.tar.gz"
if (Test-Path -LiteralPath $tarball -PathType Leaf) {
  Add-Line $Lines (Get-Digest $tarball) $tarball '' "release source tarball for tag $Version; fetched by the app at first launch from codeload.github.com (ORBO_RELEASES_TARBALL_TEMPLATE when overridden); placed in the deployment root when offline"
  $present++
} else {
  $missing.Add($tarball) | Out-Null
  $Lines.Add("MISSING  -         $Version.tar.gz" + "  [release source tarball for tag $Version; the deployment cannot be unpacked without it]") | Out-Null
}

# 2. container-images.json, the release asset digest-pinning every image. The app writes this
# beside the deployment at fetch time; offline it is placed by hand.
$images = Join-Path $BundleDirResolved 'container-images.json'
if (Test-Path -LiteralPath $images -PathType Leaf) {
  Add-Line $Lines (Get-Digest $images) $images '' 'image manifest release asset; fetched by the app from the release (ORBO_RELEASES_ASSETS_TEMPLATE when overridden); placed beside the deployment root'
  $present++
} else {
  $missing.Add($images) | Out-Null
  $Lines.Add("MISSING  -         container-images.json" + "  [image manifest release asset; without it Compose cannot resolve image digests]") | Out-Null
}

# 3. Desktop installers, whatever platform set IT carries. Nothing is rejected because two
# platforms sit in a bundle together; each one worth keeping must be here under its release name.
$installerPatterns = @('*.msi', '*.dmg', '*.deb', '*.AppImage', '*-setup.exe', 'ORBO_*.exe')
$seenInstaller = @{}
foreach ($pattern in $installerPatterns) {
  foreach ($file in @(Get-ChildItem -LiteralPath $BundleDirResolved -File -Filter $pattern -ErrorAction SilentlyContinue)) {
    if ($seenInstaller.ContainsKey($file.Name)) { continue }
    $seenInstaller[$file.Name] = $true
    Add-Line $Lines (Get-Digest $file.FullName) $file.FullName '' 'desktop installer (msi/dmg/deb/AppImage/nsis-setup) for this release'
    $present++
  }
}
if (-not $seenInstaller.Count) {
  $missing.Add('<desktop installer for this release: *.msi / *.dmg / *.deb / *.AppImage / *-setup.exe>') | Out-Null
  $Lines.Add("MISSING  -         <none of *.msi *.dmg *.deb *.AppImage *-setup.exe>" + "  [desktop installer for this release]") | Out-Null
}

# 4. Engine installers the app pulls at first launch, with the digests install.rs refuses to
# deviate from. Podman on macOS ships arm64 only (install.rs refuses an Intel Mac, and so does
# this bundle listing). Linux installs the engine from the distribution, so no generic Podman
# Linux package can be listed here.
foreach ($table in @($PodmanDigest, $ComposeDigest, $BunDigest)) {
  foreach ($name in $table.Keys) {
    $path = Join-Path $BundleDirResolved $name
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      Add-Line $Lines (Get-Digest $path) $path $table[$name] 'container-engine installer or runtime; pinned by desktop/src-tauri/src/install.rs'
      $present++
    } else {
      $missing.Add($path) | Out-Null
      $Lines.Add("MISSING  -         $name" + "  [pinned by install.rs; the app would fetch it at first launch; carry it, or the engine fetch must reach an internal mirror]") | Out-Null
    }
  }
}

$Lines.Add("") | Out-Null

# 5. The npm dependency set. This script cannot hash what has not been resolved: there is no
# frozen-set export in bun 1.3.14 (no `bun install --offline`, no cache export subcommand;
# `bun pm cache` only prints ~/.bun/install/cache). The offline npm story is a mirror + env, per
# docs/it-deployment.md. NOT counted in -RequireAll.
$Lines.Add("npm dependency note (informational, not hashed):") | Out-Null
$Lines.Add("  The deployment runs 'bun install --frozen-lockfile --ignore-scripts' at install time.") | Out-Null
$Lines.Add("  bun 1.3.14 has no offline mode and no cache-export command; 'bun pm cache' prints") | Out-Null
$Lines.Add("  ~/.bun/install/cache only, and copying it is undocumented best-effort, not a") | Out-Null
$Lines.Add("  contract. The supported offline npm path is an internal registry mirror +") | Out-Null
$Lines.Add("  ORBO_NPM_REGISTRY (or a bunfig.toml [install] registry pre-seed) baked into") | Out-Null
$Lines.Add("  the deployment environment - docs/it-deployment.md.") | Out-Null
$Lines.Add("") | Out-Null

if ($RequireAll) {
  if ($missing.Count) {
    foreach ($m in $missing) {
      Write-OrboRed "Missing from the bundle: $(Split-Path -Parent $m)\$(Split-Path -Leaf $m)"
    }
    Write-Host ""
    exit 1
  }
  Write-OrboGreen "Every artifact the bundle needs is present."
}

$Lines | Set-Content -LiteralPath $OutResolved -Encoding UTF8

Write-Host ""
Write-Host "  Manifest written: $OutResolved"
Write-Host "  Present: $present file(s); missing: $($missing.Count) (missing is not an IT error if the bundle is single-platform)."
exit 0
