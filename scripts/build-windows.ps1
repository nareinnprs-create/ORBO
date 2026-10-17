#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [string]$Bundles = "msi",
    [ValidateSet("internal", "release")]
    [string]$Channel = "internal"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopDir = Join-Path $repoRoot "desktop"
$bundleRoot = Join-Path $desktopDir "src-tauri\target\release\bundle"
$artifactsDir = Join-Path $repoRoot "artifacts"
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($dir in @(
        (Join-Path $env:USERPROFILE ".rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"),
        (Join-Path $env:USERPROFILE ".cargo\bin"),
        (Join-Path $env:USERPROFILE ".bun\bin")
    )) {
    if ((Test-Path -LiteralPath $dir) -and ($env:Path -notlike "*$dir*")) {
        $env:Path = "$dir;$env:Path"
        Write-Host "Prepended to PATH: $dir"
    }
}

function Get-CommandPath([string]$name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$failures = @()
Write-Host "=== Required tools ==="
foreach ($tool in @("cargo", "rustc", "bun", "node")) {
    $path = Get-CommandPath $tool
    if ($path) {
        $version = & $tool --version 2>$null
        Write-Host ("  {0,-6} {1}  ({2})" -f $tool, $version, $path)
    } else {
        Write-Host "  $tool MISSING"
        $failures += $tool
    }
}

if ($failures.Count -gt 0) {
    throw "Missing required tools: $($failures -join ', '). Install Rust (rustup), Bun and Node, then re-run."
}

Write-Host "=== Optional bundler tools (Tauri CLI auto-downloads if absent) ==="
$nsis = Get-CommandPath "makensis"
if (-not $nsis -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe"))) {
    $nsis = Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe"
}
$wix = Get-CommandPath "candle"
if (-not $wix) {
    $wix = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "tauri\WiX*\bin\candle.exe") -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}
Write-Host "  NSIS makensis: $(if ($nsis) { $nsis } else { 'not found (tauri CLI will download)' })"
Write-Host "  WiX candle:    $(if ($wix) { $wix } else { 'not found (tauri CLI will download)' })"

$hostTriple = (& rustc -vV | Select-String "^host:").ToString() -replace "^host: ", ""
$arch = switch -Regex ($hostTriple) {
    "^x86_64" { "x64" }
    "^aarch64" { "arm64" }
    "^i686" { "x86" }
    default { $hostTriple }
}
Write-Host "Host triple: $hostTriple (arch label: $arch)"

$link = Get-CommandPath "link"
if (-not $link) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $link = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    }
}
if ($link -or $hostTriple -notmatch "msvc") {
    Write-Host "MSVC linker: $link"
} else {
    Write-Host "MSVC linker: not detected (rustc may still find it via vswhere)"
}

$tauriBuild = "bun run tauri build --config src-tauri/tauri.build-version.conf.json --bundles $Bundles"
if ($CheckOnly) {
    Write-Host "=== CheckOnly: no build performed. Would run, in $desktopDir ==="
    Write-Host "  bun install --frozen-lockfile"
    Write-Host "  bun scripts/desktop-version.ts $Channel"
    Write-Host "  $tauriBuild"
    Write-Host "  Copy bundle output from $bundleRoot to $artifactsDir as orbo-desktop-<version>-$arch.<ext>"
    Write-Host "All required tools present. CheckOnly passed in $([math]::Round($stopwatch.Elapsed.TotalSeconds, 1))s."
    exit 0
}

Push-Location $desktopDir
try {
    Write-Host "=== bun install --frozen-lockfile ==="
    bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "bun install failed with exit code $LASTEXITCODE" }

    Write-Host "=== desktop-version.ts $Channel ==="
    bun "scripts/desktop-version.ts" $Channel
    if ($LASTEXITCODE -ne 0) { throw "desktop-version.ts failed with exit code $LASTEXITCODE" }

    Write-Host "=== $tauriBuild ==="
    bun run tauri build --config src-tauri/tauri.build-version.conf.json --bundles $Bundles
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$metadata = Get-Content -Raw (Join-Path $desktopDir "build-version.json") | ConvertFrom-Json
$version = $metadata.version

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
$copied = @()
foreach ($bundle in $Bundles.Split(",")) {
    $subdir = Join-Path $bundleRoot $bundle.Trim()
    if (-not (Test-Path -LiteralPath $subdir)) { continue }
    $patterns = switch ($bundle.Trim()) {
        "msi" { "*.msi" }
        "nsis" { "*-setup.exe" }
        default { "*.*" }
    }
    Get-ChildItem -Path $subdir -Filter $patterns -File -ErrorAction SilentlyContinue | ForEach-Object {
        $ext = $_.Extension.ToLowerInvariant()
        $dest = Join-Path $artifactsDir "orbo-desktop-$version-$arch$ext"
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
        $copied += Get-Item -LiteralPath $dest
    }
}

if ($copied.Count -eq 0) {
    throw "Build finished but no bundle output found under $bundleRoot (bundles requested: $Bundles)"
}

Write-Host "=== Artifacts ==="
foreach ($file in $copied) {
    Write-Host ("  {0}  ({1:N1} MB)" -f $file.FullName, ($file.Length / 1MB))
}
Write-Host ("Build completed in {0:N0}s. Version: {1}" -f $stopwatch.Elapsed.TotalSeconds, $version)
