#requires -Version 5.1
#
# This file is PowerShell and cannot be read by sh, bash or Git Bash: those shells meet the first
# PowerShell construct below and stop with a syntax error, having run nothing. The line above that
# construct is this one. Run this script as:
#
#   powershell -NoProfile -File scripts\stop.ps1      (Windows PowerShell 5.1)
#   pwsh -NoProfile -File scripts\stop.ps1            (PowerShell 7+)
#
<#
.SYNOPSIS
  Stop everything scripts\start.ps1 started, in the reverse order it started them.

  A native mirror of scripts/stop.sh: the app, then the routine worker, then the API server, then
  the Docker services, then each Bot's computer - stopped in that order so nothing is left calling
  something that has gone. Safe to rerun: anything already stopped is reported and skipped.

.PARAMETER KeepComputers
  Leave the Bot computers running, so their browsers stay signed in and warm. Their files and
  browser profiles are Docker volumes and survive either way. `--keep-computers` is accepted too.

.PARAMETER CheckOnly
  Report what would be stopped, and stop nothing. -WhatIf does the same.

.PARAMETER Help
  Show this help and exit.

.NOTES
  Differences from scripts/stop.sh, every one of them deliberate, and none of them silent:

  1. No SIGTERM exists for a console process on Windows, so every stop here is
     Stop-Process -Force (TerminateProcess) - already what scripts/processes.sh does through
     powershell.exe when Git Bash has no `kill` for a Windows pid. The wait between the stop and
     the check keeps its meaning: a process still holding the port afterwards is stopped again by
     id, which is what stop.sh's kill -9 does. A port holder that changes hands while it is being
     stopped is left alone and named, rather than killed by its old id.

  2. Stopping a process takes its tree with it - descendants always, and bun.exe/node.exe
     ancestors too, so `bun run dev` goes along with the Vite process that held the app's port.
     The walk stops at the first ancestor that is not Bun or Node, so a user's own terminal is
     never on the list. pkill has no such notion; killing only the listener would orphan the rest.

  3. A missing Docker engine is reported as "not running", not as an error: stopping what is left
     after a Docker Desktop crash is exactly when this script is run. stop.sh does the same
     silently, through `docker ... 2>/dev/null`.

  4. `bash scripts\stop.ps1` is not a supported invocation. Unlike stop.sh's require-bash.sh there
     is no sentence naming the fix, because a shell that cannot parse this file cannot run a guard
     written in it; the comment at the top is the explanation.

.EXAMPLE
  powershell -NoProfile -File scripts\stop.ps1

.EXAMPLE
  pwsh -NoProfile -File scripts\stop.ps1 -KeepComputers
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Alias('keep-computers')]
  [switch]$KeepComputers,

  [switch]$CheckOnly,

  [Alias('h')]
  [switch]$Help,

  # Bash-style flags (--keep-computers, --help) and anything else unrecognized land here rather
  # than failing the parameter binder, so the message can name the argument the way stop.sh does.
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

# `holder`, `port_pids`, `kill_pids`, `running` and `stop_matching` as PowerShell functions. See
# that file; it is the mirror of scripts/processes.sh and holds the same reasoning.
. (Join-Path $PSScriptRoot 'processes.ps1')

$Root = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $Root '.env'
$ComposeFile = 'deploy/compose/docker-compose.yml'

# Last-wins lines of .env. See Get-OrboSetting.
$script:EnvLines = $null

function Write-OrboGreen {
  param([string]$Text)
  Write-OrboText -Text $Text -Color Green
}

function Write-OrboRed {
  param([string]$Text)
  Write-OrboText -Text $Text -Color Red
}

function Write-OrboInfo {
  param([string]$Text)
  Write-OrboText -Text $Text -Color DarkGray
}

# Colour through the host's own attribute rather than ANSI escapes: Windows PowerShell 5.1 on a
# plain conhost predates VT support, and a raw ESC byte there is noise on the line rather than a
# colour. Falling back to plain text keeps a redirected run readable.
function Write-OrboText {
  param([string]$Text, [ConsoleColor]$Color)
  $previous = $null
  try { $previous = $Host.UI.RawUI.ForegroundColor } catch { $previous = $null }
  if ($null -eq $previous) {
    Write-Host $Text
    return
  }
  try {
    $Host.UI.RawUI.ForegroundColor = $Color
    Write-Host $Text
  } finally {
    try { $Host.UI.RawUI.ForegroundColor = $previous } catch { }
  }
}

function Show-OrboUsage {
  Write-Host ''
  Write-Host 'Usage: powershell -NoProfile -File scripts\stop.ps1 [-KeepComputers] [-CheckOnly] [-WhatIf] [-Help]'
  Write-Host ''
  Write-Host 'Stops the app, the routine worker, the API server, the Docker services, and'
  Write-Host 'each Bot''s computer.'
  Write-Host ''
  Write-Host '  -KeepComputers  Leave the Bot computers running, so their browsers stay signed in and warm.'
  Write-Host '  -CheckOnly      Report what would be stopped, and stop nothing. -WhatIf does the same.'
  Write-Host '  -Help           Show this help.'
}

if ($null -ne $Rest) {
  foreach ($argument in $Rest) {
    switch ($argument) {
      '--keep-computers' { $KeepComputers = $true }
      '--help' {
        Show-OrboUsage
        exit 0
      }
      default {
        Write-OrboRed "Unknown argument: $argument. Try -Help."
        exit 1
      }
    }
  }
}
if ($Help) {
  Show-OrboUsage
  exit 0
}

$DryRun = $CheckOnly -or [bool]$WhatIfPreference

# The last line of .env that sets NAME, or nothing. Comments do not match (the name is anchored at
# the start of the line), a later line beats an earlier one the way `grep | tail -1` did, and one
# matched pair of surrounding quotes is taken off the way the `sed` expression in stop.sh did.
function Get-OrboDotEnvValue {
  param([string]$Name)
  if ($null -eq $script:EnvLines) { return $null }
  $found = $null
  $pattern = '^' + [regex]::Escape($Name) + '=(.*)$'
  foreach ($line in $script:EnvLines) {
    if ($line -match $pattern) { $found = $Matches[1] }
  }
  if ($null -eq $found) { return $null }
  if ($found.Length -ge 2) {
    $first = $found[0]
    $last = $found[$found.Length - 1]
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      return $found.Substring(1, $found.Length - 2)
    }
  }
  return $found
}

# The environment first, then .env, then the default - the same resolution order start.ps1 uses, so
# a port configured there is the port stopped here. A missing .env is not an error for stopping:
# the defaults still find whatever a previous run left behind, as in stop.sh.
function Get-OrboSetting {
  param([string]$Name, [string]$Fallback)
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrEmpty($value)) { $value = Get-OrboDotEnvValue -Name $Name }
  if ([string]::IsNullOrEmpty($value)) { return $Fallback }
  return $value
}

# A native command run without this script's $ErrorActionPreference turning the stderr records it
# emits into terminating errors. The output is captured and the exit code returned; docker's own
# words belong to the caller, the way they do in the bash script.
function Invoke-OrboNative {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$LogFile
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @ArgumentList 2>&1
    $status = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  $lines = @($output | ForEach-Object { [string]$_ })
  if ($LogFile) {
    [System.IO.File]::WriteAllLines($LogFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
  }
  return [pscustomobject]@{ Output = $lines; Status = $status }
}

function Invoke-OrboGet {
  param([string]$Url, [int]$TimeoutSec = 3)
  $result = [pscustomobject]@{ Ok = $false; Status = 0; Body = '' }
  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = 'GET'
    $request.Timeout = $TimeoutSec * 1000
    $request.Proxy = $null
    $response = $request.GetResponse()
    try {
      $result.Status = [int]$response.StatusCode
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      try { $result.Body = $reader.ReadToEnd() } finally { $reader.Close() }
    } finally {
      $response.Close()
    }
    $result.Ok = ($result.Status -ge 200 -and $result.Status -lt 300)
  } catch [System.Net.WebException] {
    if ($null -ne $_.Exception.Response) {
      try { $result.Status = [int]$_.Exception.Response.StatusCode } catch { }
      try { $_.Exception.Response.Close() } catch { }
    }
  } catch {
    $result.Status = 0
  }
  return $result
}

# Does whatever holds this port answer as ORBO, rather than merely answer?
#
# The same question start.ps1 asks before starting, asked here for the opposite reason. Starting on
# an occupied port is a failed run; killing the occupant of a port is somebody else's editor
# server gone. So a port holder is only killed once it has identified itself, and is otherwise
# named and left alone.
function Test-OrboIdentity {
  param([int]$Port, [string]$Name)
  switch ($Name) {
    'server' {
      $response = Invoke-OrboGet -Url "http://localhost:$Port/api/copilotkit/info"
      return ($response.Ok -and $response.Body.Contains('"licenseStatus"'))
    }
    'app' {
      $response = Invoke-OrboGet -Url "http://localhost:$Port/"
      if (-not $response.Ok) { return $false }
      return [regex]::IsMatch($response.Body, '(?i)<title>[^<]*ORBO')
    }
    default {
      $response = Invoke-OrboGet -Url "http://localhost:$Port/health"
      return $response.Ok
    }
  }
}

# True when the compose CLI and the engine behind it both answer. Used only to decide whether
# stage 4 has anything to do: a machine where Docker is not running is reported as "not running"
# rather than as a failure, because that is the state this script is often run in.
function Test-OrboDockerUsable {
  $docker = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $docker) { return $false }
  $compose = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', 'version')
  if ($compose.Status -ne 0) { return $false }
  $daemon = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('info')
  return ($daemon.Status -eq 0)
}

# Stop the process listening on a port, once it proved to be ours, together with the tree around
# it - the wait is what makes the next start.ps1 see the port free.
function Stop-OrboPort {
  param([int]$Port, [string]$Name)
  $holder = Get-OrboPortHolder -Port $Port
  if ([string]::IsNullOrEmpty($holder)) {
    Write-OrboInfo "  ${Name}: not running on $Port"
    return
  }
  if (-not (Test-OrboIdentity -Port $Port -Name $Name)) {
    Write-OrboRed "  ${Name}: port $Port is held by something that is not ORBO: $holder"
    Write-OrboRed '  Left it alone. Stop it yourself if it is in the way.'
    return
  }
  $pids = @(Get-OrboPortPids -Port $Port)
  if ($pids.Count -eq 0) {
    Write-OrboInfo "  ${Name}: not running on $Port"
    return
  }
  if ($DryRun) {
    Write-OrboInfo "  ${Name}: would stop ($holder)"
    return
  }
  $map = Get-OrboProcessMap
  Stop-OrboPids -Ids (Expand-OrboProcessTree -RootIds $pids -Map $map -IncludeAncestors)
  Start-Sleep -Seconds 2
  $remaining = @(Get-OrboPortPids -Port $Port)
  if ($remaining.Count -gt 0) {
    if (Test-OrboIdentity -Port $Port -Name $Name) {
      Stop-OrboPids -Ids $remaining
    } else {
      Write-OrboRed "  ${Name}: port $Port was taken by something else while stopping: left it alone."
    }
  }
  Write-OrboGreen "  ${Name}: stopped ($holder)"
}

$appPortText = Get-OrboSetting -Name 'APP_PORT' -Fallback '3010'
$serverPortText = Get-OrboSetting -Name 'SERVER_PORT' -Fallback '3001'
$appPort = 3010
$serverPort = 3001
if (-not [int]::TryParse($appPortText, [ref]$appPort)) { $appPort = 3010 }
if (-not [int]::TryParse($serverPortText, [ref]$serverPort)) { $serverPort = 3001 }

Push-Location -LiteralPath $Root

Write-Host ''
Write-Host 'ORBO'
Write-Host '======='

Write-OrboInfo '1/4  App'
Stop-OrboPort -Port $appPort -Name 'app'

Write-OrboInfo '2/4  Routine worker'
# The same pattern start.ps1 starts it with, and it has to stay that specific: a bare
# `bun src/index.ts` matches the server, computer and supervisor containers on a Linux host too.
if (Test-OrboRunning -Pattern 'bun worker/src/index.ts') {
  if ($DryRun) {
    Write-OrboInfo '  worker: would stop'
  } else {
    Stop-OrboMatching -Pattern 'bun worker/src/index.ts'
    Write-OrboGreen '  worker: stopped'
  }
} else {
  Write-OrboInfo '  worker: not running'
}

Write-OrboInfo '3/4  API server'
Stop-OrboPort -Port $serverPort -Name 'server'

Write-OrboInfo '4/4  Docker'
if (-not (Test-OrboDockerUsable)) {
  Write-OrboInfo '  compose services: not running (Docker is unavailable)'
  Write-OrboInfo '  Bot computers: none running (Docker is unavailable)'
} else {
  $listing = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', '-f', $ComposeFile, 'ps', '--quiet')
  $hasServices = $false
  foreach ($line in $listing.Output) { if ($line.Trim() -ne '') { $hasServices = $true } }
  if (-not $hasServices) {
    Write-OrboInfo '  compose services: not running'
  } elseif ($DryRun) {
    Write-OrboInfo '  compose services: would be stopped (docker compose down)'
  } else {
    $down = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', '-f', $ComposeFile, 'down')
    if ($down.Status -ne 0) {
      Write-OrboRed "  compose services: docker compose down failed (exit code $($down.Status))."
      Pop-Location
      exit 1
    }
    Write-OrboGreen '  compose services: stopped'
  }

  # The Bot computers are made by the supervisor rather than by compose, so `docker compose down`
  # leaves them running - and they are the heaviest thing here, one Chromium each.
  $computers = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('ps', '-q', '--filter', 'label=orbo.supervisor=true')
  $ids = @($computers.Output | Where-Object { $_.Trim() -ne '' })
  if ($ids.Count -eq 0) {
    Write-OrboInfo '  Bot computers: none running'
  } elseif ($KeepComputers) {
    Write-OrboInfo "  Bot computers: left running ($($ids.Count)), as asked"
  } elseif ($DryRun) {
    Write-OrboInfo "  Bot computers: would be removed ($($ids.Count))"
  } else {
    Invoke-OrboNative -FilePath 'docker' -ArgumentList (@('rm', '-f') + $ids) | Out-Null
    Write-OrboGreen "  Bot computers: removed ($($ids.Count))"
  }
}

if ($DryRun) {
  Write-Host ''
  Write-OrboGreen 'Check only. Nothing was stopped.'
  Pop-Location
  exit 0
}

Write-Host ''
Write-OrboGreen 'Stopped.'
Write-Host ''
Write-Host 'Nothing was deleted. PostgreSQL, each Bot''s files and each Bot''s browser profile are Docker'
Write-Host 'volumes, so channels, credentials and signed-in sessions are all still there next time.'
Write-Host ''
Write-OrboGreen 'Start again: powershell -NoProfile -File scripts\start.ps1'

Pop-Location
