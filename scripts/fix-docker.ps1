#Requires -Version 5.1
<#
.SYNOPSIS
  One-click repair for Docker Desktop on Windows when the engine hangs or
  the underlying WSL VM is stale.

.DESCRIPTION
  Idempotent, safe recovery sequence:
    1. Verify Docker Desktop is actually installed (bail with installer URL if not).
    2. Stop Docker Desktop processes (tray, backend, frontend).
    3. wsl --shutdown to clear a stale/locked docker-desktop distro.
    4. Restart WSLService and com.docker.service (if present).
    5. Start Docker Desktop and poll `docker version` until the engine
       answers (default timeout 120s).
    6. Print next steps (scripts/install.sh, scripts/start.sh).

  Run with -CheckOnly for a non-elevated, read-only diagnosis that prints
  the exact elevated command to run. -WhatIf shows what would be done
  without touching anything (also works non-elevated for the dry plan,
  but elevation is still required for a real run).

.EXAMPLE
  .\scripts\fix-docker.ps1 -CheckOnly
  .\scripts\fix-docker.ps1 -WhatIf
  .\scripts\fix-docker.ps1            # must be elevated
  .\scripts\fix-docker.ps1 -TimeoutSeconds 180
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Read-only diagnosis; never mutates, works non-elevated.
    [switch]$CheckOnly,
    # Seconds to wait for the engine to answer after startup.
    [ValidateRange(30, 600)]
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$DockerDesktopExe = Join-Path ${env:ProgramFiles} 'Docker\Docker\Docker Desktop.exe'
$DockerInstallUrl = 'https://docs.docker.com/desktop/setup/windows-install/'
$DockerProcessNames = @(
    'Docker Desktop',
    'com.docker.backend',
    'com.docker.build',
    'com.docker.dev-envs',
    'com.docker.extensions',
    'com.docker.gateway',
    'com.docker.ia-helper',
    'com.docker.metadata',
    'com.docker.proxy',
    'com.docker.service',
    'DockerCli',
    'dockerd',
    'vpnkit-bridge'
)

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}
function Write-Info([string]$Message) { Write-Host "    $Message" }
function Write-Ok([string]$Message)   { Write-Host "    OK: $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message){ Write-Host "    WARN: $Message" -ForegroundColor Yellow }
function Write-Err2([string]$Message) { Write-Host "    ERROR: $Message" -ForegroundColor Red }

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-DockerEngineInfo {
    # Returns a hashtable: @{ Started; ExitCode; Output } - never throws,
    # and bounds the wait so a hung named-pipe cannot freeze the script.
    $result = @{ Started = $false; ExitCode = -1; Output = '' }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'docker'
        $psi.Arguments = 'version'
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $result.Started = $true
        if (-not $proc.WaitForExit(30000)) {
            try { $proc.Kill() } catch { }
            $result.Output = 'docker version timed out after 30s (engine pipe hung)'
            return $result
        }
        $result.ExitCode = $proc.ExitCode
        $result.Output = $proc.StandardOutput.ReadToEnd() + $proc.StandardError.ReadToEnd()
    } catch {
        $result.Output = $_.Exception.Message
    }
    return $result
}

function Get-ServiceSafe([string]$Name) {
    Get-Service -Name $Name -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 0. Pre-flight: is Docker Desktop even installed?
# ---------------------------------------------------------------------------
Write-Step 'Step 0/6: Checking Docker Desktop installation'
$dockerInstalled = Test-Path -LiteralPath $DockerDesktopExe
if (-not $dockerInstalled) {
    Write-Err2 "Docker Desktop is NOT installed ($DockerDesktopExe not found)."
    Write-Host ''
    Write-Host '  This script only repairs an existing Docker Desktop install.' -ForegroundColor Yellow
    Write-Host "  Install Docker Desktop first: $DockerInstallUrl" -ForegroundColor Yellow
    Write-Host '  Then re-run this script if the engine still does not start.'
    exit 2
}
Write-Ok "Found Docker Desktop at $DockerDesktopExe"

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCli) { Write-Ok "docker CLI on PATH: $($dockerCli.Source)" }
else { Write-Warn2 'docker CLI not on PATH (will rely on Docker Desktop to add it on start)' }

# ---------------------------------------------------------------------------
# 1. Elevation gate
# ---------------------------------------------------------------------------
$elevated = Test-IsElevated
Write-Step 'Step 1/6: Elevation check'
if ($elevated) { Write-Ok 'Running elevated (Administrator).' }
else { Write-Warn2 'NOT running elevated.' }

# Live diagnosis (read-only, always safe)
# wsl.exe emits UTF-16LE on some builds; decode it properly or the table garbles.
$prevEnc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = [System.Text.Encoding]::Unicode } catch { }
$wslStatus = $null
try { $wslStatus = (& wsl.exe --status 2>&1 | Out-String).Trim() } catch { $wslStatus = $_.Exception.Message }
$wslDistros = @()
try { $wslDistros = @(& wsl.exe -l -v 2>&1 | ForEach-Object { $_.ToString() }) } catch { }
try { [Console]::OutputEncoding = $prevEnc } catch { }
$wslService = Get-ServiceSafe 'WSLService'
$vmcompute  = Get-ServiceSafe 'vmcompute'
$dockerSvc  = Get-ServiceSafe 'com.docker.service'
$runningProcs = @(Get-Process -Name $DockerProcessNames -ErrorAction SilentlyContinue)
$engine = Get-DockerEngineInfo

$wslServiceDesc = if ($wslService) { '{0} ({1})' -f $wslService.Status, $wslService.StartType } else { 'not found' }
$vmcomputeDesc  = if ($vmcompute)  { '{0} ({1})' -f $vmcompute.Status,  $vmcompute.StartType  } else { 'not found' }
$dockerSvcDesc  = if ($dockerSvc)  { '{0} ({1})' -f $dockerSvc.Status,  $dockerSvc.StartType  } else { 'not found' }
Write-Host ''
Write-Host '    --- Live state ---' -ForegroundColor DarkGray
Write-Host "    WSLService: $wslServiceDesc"
Write-Host "    vmcompute:  $vmcomputeDesc"
Write-Host "    com.docker.service: $dockerSvcDesc"
Write-Host "    Docker processes running: $($runningProcs.Count)"
foreach ($d in $wslDistros | Where-Object { $_ -match '\S' }) { Write-Host "    WSL distro: $($d.ToString().Trim())" }
Write-Host "    docker version exit code: $($engine.ExitCode)"
if ($engine.Output) {
    foreach ($line in ($engine.Output -split "`r?`n" | Where-Object { $_ -match '\S' } | Select-Object -First 8)) {
        Write-Host "      $line"
    }
}

if ($CheckOnly) {
    Write-Step 'CheckOnly mode: no changes made.'
    if ($engine.ExitCode -eq 0) {
        Write-Ok 'Docker engine is responsive. Nothing to fix right now.'
        exit 0
    }
    Write-Host '  Diagnosis summary:' -ForegroundColor Yellow
    if (-not $elevated) {
        Write-Host '  * Not elevated. To run the repair, open an ELEVATED PowerShell (Run as administrator) and run:'
        Write-Host "      powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor White
    }
    if ($engine.ExitCode -ne 0) {
        Write-Host '  * Docker engine is not answering. The elevated repair will:'
        Write-Host '      stop Docker processes -> wsl --shutdown -> restart WSL/Docker services -> start Docker Desktop -> poll engine.'
    }
    exit $(if ($engine.ExitCode -eq 0) { 0 } else { 1 })
}

# ---------------------------------------------------------------------------
# 2. Gate for mutating steps
# ---------------------------------------------------------------------------
if (-not $elevated) {
    Write-Host ''
    Write-Err2 'This repair must run ELEVATED (it restarts Windows services and shuts down WSL).'
    Write-Host ''
    Write-Host '  How to run it (pick one):' -ForegroundColor Yellow
    Write-Host '  1. Press Win+X -> "Terminal (Admin)" or "Windows PowerShell (Admin)", then:'
    Write-Host '       cd C:\Users\manag\ORBO' -ForegroundColor White
    Write-Host '       powershell -ExecutionPolicy Bypass -File .\scripts\fix-docker.ps1' -ForegroundColor White
    Write-Host '  2. Or from a normal PowerShell:'
    Write-Host '       Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""' -ForegroundColor White
    Write-Host ''
    Write-Host '  Tip: run -CheckOnly first (no elevation needed) to see the live state.'
    exit 3
}

# ---------------------------------------------------------------------------
# 3. Stop Docker Desktop processes
# ---------------------------------------------------------------------------
Write-Step 'Step 2/6: Stopping Docker Desktop processes'
$current = @(Get-Process -Name $DockerProcessNames -ErrorAction SilentlyContinue)
if ($current.Count -eq 0) {
    Write-Ok 'No Docker processes are running (already stopped).'
} elseif ($PSCmdlet.ShouldProcess("$($current.Count) Docker process(es)", 'Stop-Process')) {
    foreach ($p in $current) {
        Write-Info "Stopping $($p.ProcessName) (PID $($p.Id))"
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { Write-Warn2 "Could not stop PID $($p.Id): $($_.Exception.Message)" }
    }
    Start-Sleep -Seconds 2
    $left = @(Get-Process -Name $DockerProcessNames -ErrorAction SilentlyContinue)
    if ($left.Count -eq 0) { Write-Ok 'All Docker processes stopped.' }
    else { Write-Warn2 "$($left.Count) process(es) still alive; continuing anyway." }
} else {
    Write-Info 'WhatIf: would stop Docker Desktop / com.docker.* / DockerCli processes.'
}

# ---------------------------------------------------------------------------
# 4. wsl --shutdown
# ---------------------------------------------------------------------------
Write-Step 'Step 3/6: Shutting down WSL (clears stale docker-desktop distro)'
$wslRunning = @(Get-Process -Name 'wslservice', 'vmmemWSL', 'vmmem' -ErrorAction SilentlyContinue)
if ($PSCmdlet.ShouldProcess('WSL VM (all distros)', 'wsl --shutdown')) {
    Write-Info 'Running: wsl --shutdown'
    & wsl.exe --shutdown 2>&1 | Out-String | ForEach-Object { if ($_.Trim()) { Write-Info $_.Trim() } }
    Start-Sleep -Seconds 3
    Write-Ok 'WSL shutdown issued.'
} else {
    Write-Info 'WhatIf: would run wsl --shutdown.'
}

# ---------------------------------------------------------------------------
# 5. Restart services
# ---------------------------------------------------------------------------
Write-Step 'Step 4/6: Restarting WSL and Docker services'
foreach ($svcName in @('WSLService', 'com.docker.service')) {
    $svc = Get-ServiceSafe $svcName
    if (-not $svc) {
        Write-Info "Service '$svcName' not found - skipping."
        continue
    }
    if ($PSCmdlet.ShouldProcess($svcName, 'Restart-Service')) {
        try {
            Write-Info "Restarting $svcName (was: $($svc.Status))..."
            Restart-Service -Name $svcName -Force -ErrorAction Stop
            Start-Sleep -Seconds 1
            $svc.Refresh()
            Write-Ok "$svcName is now $($svc.Status)."
        } catch {
            Write-Warn2 "Could not restart ${svcName}: $($_.Exception.Message) (trying stop+start...)"
            try {
                Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
                Start-Service -Name $svcName -ErrorAction Stop
                $svc.Refresh()
                Write-Ok "$svcName is now $($svc.Status)."
            } catch {
                Write-Err2 "Failed to restart ${svcName}: $($_.Exception.Message)"
            }
        }
    } else {
        Write-Info "WhatIf: would restart $svcName."
    }
}

# ---------------------------------------------------------------------------
# 6. Start Docker Desktop + poll engine
# ---------------------------------------------------------------------------
Write-Step 'Step 5/6: Starting Docker Desktop'
$alreadyUp = $false
if ($PSCmdlet.ShouldProcess($DockerDesktopExe, 'Start (Docker Desktop)')) {
    if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
        Write-Info "Launching `"$DockerDesktopExe`"..."
        Start-Process -FilePath $DockerDesktopExe
    } else {
        Write-Info 'Docker Desktop UI process already running.'
    }

    Write-Step "Step 6/6: Waiting for Docker engine (timeout ${TimeoutSeconds}s)"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0
    do {
        $attempt++
        $engine = Get-DockerEngineInfo
        if ($engine.ExitCode -eq 0) {
            $versionLine = ($engine.Output -split "`r?`n" | Where-Object { $_ -match '^\s*Version:' } | Select-Object -First 1)
            Write-Ok "Docker engine is UP after $attempt attempt(s). $($versionLine.Trim())"
            $alreadyUp = $true
            break
        }
        $shown = if ($engine.Output) { (($engine.Output -split "`r?`n" | Where-Object { $_ -match '\S' } | Select-Object -First 1)) } else { 'no output' }
        Write-Info "Attempt $attempt - engine not ready yet ($shown)"
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    if (-not $alreadyUp) {
        Write-Err2 "Docker engine did not answer within ${TimeoutSeconds}s."
        Write-Host ''
        Write-Host '  Next steps:' -ForegroundColor Yellow
        Write-Host '  * Check the Docker Desktop tray icon / logs: %LOCALAPPDATA%\Docker\log\'
        Write-Host '  * Run this script once more (a second pass clears most stale states).'
        Write-Host '  * Reboot Windows if the WSL VM refuses to restart cleanly.'
        exit 1
    }
} else {
    Write-Info 'WhatIf: would start Docker Desktop and poll docker version.'
    $alreadyUp = $true
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ''
Write-Ok 'Repair complete.'
Write-Host ''
Write-Host '  Next steps:' -ForegroundColor Yellow
Write-Host '    docker version                      # verify engine (should print client+server)'
Write-Host '    bash scripts/install.sh             # project setup'
Write-Host '    bash scripts/start.sh               # start the app stack'
Write-Host ''
exit 0
