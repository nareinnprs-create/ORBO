#Requires -Version 7

<#
.SYNOPSIS
  Registers (or removes) a Windows scheduled task that launches the ORBO routine worker at boot,
  so a host or VM deployment keeps its routine sweep without a shell keeping it alive.

.DESCRIPTION
  What this is for, and why: `worker/src/index.ts` is a bare loop with no HTTP endpoint of its
  own, and outside Kubernetes nothing supervises it. `scripts/start.ps1` starts it as a
  background process with no restart policy watching it — a worker that dies stays dead, and
  routines quietly stop firing until a person notices. This script registers a boot trigger with
  the Task Scheduler instead: the task starts at system startup, runs as SYSTEM, and needs no
  signed-in session.

  The launcher command (see -Registration below) sets the worker's three settings from the env
  file, points the working directory at the deployment root, and appends output to
  `.logs/worker-service.log`.

  Idempotent: rerunning rewrites the task definition in place (Register-ScheduledTask -Force).
  -Remove unregisters it. -Status reports the last run time and result.

.EXAMPLE
  pwsh scripts/worker-install.ps1
  pwsh scripts/worker-install.ps1 -Root C:\orbo -EnvFile C:\orbo\.env
  pwsh scripts/worker-install.ps1 -Status
  pwsh scripts/worker-install.ps1 -Remove
#>

param(
  [string]$Root = (Split-Path (Split-Path $PSScriptRoot)),
  [string]$EnvFile = '',
  [switch]$Remove,
  [switch]$Status,
  [string]$TaskName = 'ORBOWorker'
)

$ErrorActionPreference = 'Stop'

function Write-OrboGreen { param($Text) Write-Host "  $Text" -ForegroundColor Green }
function Write-OrboRed { param($Text) Write-Host "  $Text" -ForegroundColor Red }
function Write-OrboInfo { param($Text) Write-Host "  $Text" -ForegroundColor DarkGray }

$envFilePath = if ($EnvFile -ne '') { $EnvFile } else { Join-Path $Root '.env' }

if ($Status) {
  $info = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue |
    Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
  if ($null -eq $info) {
    Write-OrboRed "$TaskName is not registered with the Task Scheduler."
    exit 1
  }
  Write-OrboInfo "task:           $TaskName"
  Write-OrboInfo "state:          $((Get-ScheduledTask -TaskName $TaskName).State)"
  Write-OrboInfo "last run:       $($info.LastRunTime)"
  Write-OrboInfo "last result:    $($info.LastTaskResult)"
  if ($info.LastTaskResult -eq 0) {
    Write-OrboGreen 'last task result: 0 (the task is recorded as having succeeded)'
  } else {
    Write-OrboRed "last task result: $($info.LastTaskResult) — nonzero means the launch failed; the worker's own output is in $Root\.logs\worker-service.log"
  }
  exit 0
}

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    Write-OrboInfo "$TaskName is not registered; nothing to remove."
    exit 0
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-OrboGreen "$TaskName unregistered. The currently running worker process, if any, keeps running: stop it by hand (it is the `bun worker/src/index.ts` process) or reboot."
  exit 0
}

if (-not (Test-Path -LiteralPath $Root)) {
  Write-OrboRed "Deployment root not found: $Root. Pass -Root with the path scripts/install.ps1 set up."
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'worker/src/index.ts'))) {
  Write-OrboRed "worker/src/index.ts not found under $Root. Not running from a deployment root: pass -Root."
  exit 1
}
$envFileItem = Get-Item -LiteralPath $envFilePath -ErrorAction SilentlyContinue
if ($null -eq $envFileItem) {
  Write-OrboRed "Env file not found: $envFilePath. The worker's settings (DATABASE_URL, SERVER_INTERNAL_URL, WORKER_SHARED_SECRET) are read from it; pass -EnvFile."
  exit 1
}

# The same three settings `scripts/start.ps1` hands the worker by hand. Refused here before the
# task exists, for the reason the worker itself refuses at boot: a registered task that starts and
# immediately dies on a missing setting is a scheduled failure nobody is watching.
$requiredKeys = @('DATABASE_URL', 'SERVER_INTERNAL_URL', 'WORKER_SHARED_SECRET')
$values = @{}
switch -Regex -File $envFileItem.FullName {
  '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' {
    $values[$Matches[1].Trim()] = $Matches[2].Trim('"', "'").Trim()
  }
}
$missing = $requiredKeys | Where-Object { -not $values[$_] }
if ($missing.Count -gt 0) {
  Write-OrboRed "The env file $envFilePath is missing the keys the worker needs: $($missing -join ', '). The worker itself refuses to start without them (see worker/src/env.ts); fix the file and rerun."
  exit 1
}

# Pinned at install time, not at launch: the task records the absolute path to this bun, the way
# scripts/install.ps1 records what it finds, so a later PATH change cannot reshape what boots.
$bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $bun) {
  Write-OrboRed 'Bun is not on PATH, and the worker runs on it: bun cannot be pinned into the task. Install bun and rerun.'
  exit 1
}

# Runs from $Root with `bun worker/src/index.ts`, by the full path, matching nothing else in the
# repo — the same command line scripts/start.sh reasons about, and the shape that keeps the
# process-check guard above from matching the supervisor's computer containers.
$logsDir = Join-Path $Root '.logs'
$workerLog = Join-Path $logsDir 'worker-service.log'
$envFileForTask = $envFileItem.FullName
$launch = (
  "Get-Content -LiteralPath '$envFileForTask' | ForEach-Object { if (`$_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { Set-Item -Path (Join-Path 'env:' `$Matches[1]) -Value `$Matches[2].Trim([char]34, [char]39) } }; " +
  "New-Item -ItemType Directory -Force -Path '$logsDir' | Out-Null; " +
  "& '$bun' 'worker/src/index.ts' *>> '$workerLog'"
)
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument @(
  '-NoProfile'
  '-NonInteractive'
  '-ExecutionPolicy'
  'Bypass'
  '-Command'
  $launch
) -WorkingDirectory $Root

# Startup trigger, because a laptop or VM reboots out of hours: the worker has no reason to wait
# for a sign-in, and the boot trigger is also what keeps the task from piling onto a `docker
# compose up` that is already handed off. RunLevel Limited: the worker needs no elevation.
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
} catch {
  Write-OrboRed "Registering the task failed (the Task Scheduler needs an elevated session): $_"
  exit 1
}

Write-OrboGreen "$TaskName registered: starts at boot as SYSTEM, runs 'bun worker/src/index.ts' from $Root."
Write-OrboGreen "Output is appended to $workerLog; check it with: pwsh scripts/worker-install.ps1 -Status"
Write-OrboInfo 'The task fires on the next boot; to start it now without rebooting, run:  Start-ScheduledTask -TaskName ORBOWorker'
Write-OrboInfo 'Remove it with:  pwsh scripts/worker-install.ps1 -Remove'
