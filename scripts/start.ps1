#requires -Version 5.1
#
# This file is PowerShell and cannot be read by sh, bash or Git Bash: those shells meet the first
# PowerShell construct below and stop with a syntax error, having run nothing. The line above that
# construct is this one. Run this script as:
#
#   powershell -NoProfile -File scripts\start.ps1      (Windows PowerShell 5.1)
#   pwsh -NoProfile -File scripts\start.ps1            (PowerShell 7+)
#
<#
.SYNOPSIS
  Start the local ORBO stack on Windows, without Git Bash.

  A native mirror of scripts/start.sh: the same four stages, the same settings resolution (process
  environment, then .env, then the same defaults), the same two secrets generated and written back
  to .env on first run, the same restart guard for a server that is up but stale, the same
  "already up" probes, the same service selection for docker compose, and the same per-service
  logs under .logs. Safe to rerun: matching services are left running, and unrelated port holders
  are reported.

.PARAMETER CheckOnly
  Resolve settings, report what would run, and touch nothing: no .env writes, no processes
  started, no Docker calls that change anything, no .logs directory. -WhatIf does the same.

.PARAMETER Help
  Show this help and exit.

.NOTES
  Differences from scripts/start.sh, every one of them deliberate, and none of them silent:

  1. Docker guidance. start.sh dies under `set -e` with whatever docker printed. Here the engine
     is checked first and a failure names scripts\fix-docker.ps1 and scripts\install.ps1, because
     on a Windows machine "the engine is not running" is the ordinary first-run state, not an
     error message.

  2. Bun is checked up front, with the install address, instead of failing at the first
     background launch some stages later and reporting it as "server never answered".

  3. The runtime health check (licence, then registered Bots) parses /api/copilotkit/info with
     ConvertFrom-Json instead of piping it into `bun run -` with a heredoc. The same checks, the
     same messages, the same exit codes, one fewer process.

  4. Background processes are launched through `cmd /s /c ... > log 2>&1` in a hidden console,
     where start.sh relies on bash backgrounding and inherited redirection. The visible behaviour
     is the same - one log per service in .logs - and the processes outlive this script either
     way.

  5. HTTP probes use .NET's WebRequest rather than curl, so a machine without curl.exe on PATH
     behaves like one with it. Every probe still asks the same question of the same URL.

  6. There is no SIGTERM for a console process on Windows, so every stop in this family is
     Stop-Process -Force (TerminateProcess) - already what scripts/processes.sh does through
     powershell.exe when Git Bash has no `kill` for a Windows pid. scripts\stop.ps1 notes the
     same gap.

  7. A port setting that is not a port number is refused by name, where start.sh would carry the
     garbage into a URL and report a timeout several stages later.

  8. `bash scripts/start.ps1` is not a supported invocation. Unlike start.sh's require-bash.sh
     there is no sentence naming the fix, because a shell that cannot parse this file cannot run
     a guard written in it; the comment at the top is the explanation.

.EXAMPLE
  powershell -NoProfile -File scripts\start.ps1

.EXAMPLE
  pwsh -NoProfile -File scripts\start.ps1 -CheckOnly
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$CheckOnly,

  [Alias('h')]
  [switch]$Help,

  # Bash-style flags (--check-only, --help) and anything else unrecognized land here rather than
  # failing the parameter binder, so the message can name the argument the way stop.sh does.
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

# `holder`, `port_pids`, `kill_pids`, `running` and `stop_matching` as PowerShell functions. See
# that file; it is the mirror of scripts/processes.sh and holds the same reasoning.
. (Join-Path $PSScriptRoot 'processes.ps1')

$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root '.logs'
$EnvPath = Join-Path $Root '.env'
# Relative, because docker runs from $Root exactly where start.sh runs it, and compose resolves
# the paths inside the file from there.
$ComposeFile = 'deploy/compose/docker-compose.yml'

# Last-wins lines of .env, re-read only when the file is (re)written. See Get-OrboSetting.
$script:EnvLines = $null
# Whether this run minted a secret something already running may not have. See Set-OrboGeneratedSecret.
$script:SecretsRotated = $false

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
  Write-Host 'Usage: powershell -NoProfile -File scripts\start.ps1 [-CheckOnly] [-WhatIf] [-Help]'
  Write-Host ''
  Write-Host 'Starts the Docker services, the API server, the routine sweep worker and the app,'
  Write-Host 'and verifies each one answers as ORBO. Safe to rerun.'
  Write-Host ''
  Write-Host '  -CheckOnly  Resolve settings and report what would run. Writes nothing, starts nothing.'
  Write-Host '  -WhatIf     The same as -CheckOnly.'
  Write-Host '  -Help       Show this help.'
}

if ($null -ne $Rest) {
  foreach ($argument in $Rest) {
    switch ($argument) {
      '--check-only' { $CheckOnly = $true }
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
# matched pair of surrounding quotes is taken off the way the `sed` expression in start.sh did.
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

# The environment first, then .env, then the default. Compose and the API server both read .env,
# so a port or token configured there is what this script must use as well. An absent OR an empty
# value takes the default, the same as `${value:-fallback}` in start.sh - which is the whole
# reason .env.example can ship a key with an empty value and still mean "not set".
function Get-OrboSetting {
  param([string]$Name, [string]$Fallback)
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrEmpty($value)) { $value = Get-OrboDotEnvValue -Name $Name }
  if ([string]::IsNullOrEmpty($value)) { return $Fallback }
  return $value
}

function Get-OrboPortSetting {
  param([string]$Name, [int]$Fallback)
  $raw = Get-OrboSetting -Name $Name -Fallback ([string]$Fallback)
  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -gt 0 -and $parsed -lt 65536) { return $parsed }
  Write-OrboRed "  $Name is not a port number: '$raw'. Fix the line in .env, or remove it to take the default of $Fallback."
  exit 1
}

# Set NAME in .env, replacing any existing line for it and appending when there was none - the
# same rewrite start.sh does with grep -v plus a printf. Written as UTF-8 (with the byte-order
# mark only if the file already had one: a BOM this script added would become part of the first
# key for every reader that does not skip it), and with the file's own line endings, because
# compose, bun and this script all read the result afterwards.
function Set-OrboDotEnvValue {
  param([string]$Name, [string]$Value)
  if ($DryRun) { return }
  $bytes = [System.IO.File]::ReadAllBytes($EnvPath)
  $hadBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $text = [System.IO.File]::ReadAllText($EnvPath)
  $newline = "`n"
  if ($text.Contains("`r`n")) { $newline = "`r`n" }
  $hadKey = $false
  $lines = New-Object 'System.Collections.Generic.List[string]'
  foreach ($line in ($text -split "`r?`n")) {
    if ($line -match ('^' + [regex]::Escape($Name) + '=')) { $hadKey = $true } else { $lines.Add($line) }
  }
  if (-not $hadKey) { $lines.Add('') }
  $lines.Add("$Name=$Value")
  $encoding = New-Object System.Text.UTF8Encoding($hadBom)
  [System.IO.File]::WriteAllText($EnvPath, ($lines -join $newline), $encoding)
  $script:EnvLines = @($lines)
}

# 32 random bytes as base64, the value openssl rand -base64 32 would produce. openssl first, so
# the value is byte-identical to what start.sh writes on a machine that has it; the .NET random
# number generator is the fallback for the ordinary Windows machine where openssl is not on PATH.
function New-OrboSecret {
  $openssl = Get-Command openssl -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $openssl) {
    $probe = Invoke-OrboNative -FilePath $openssl.Source -ArgumentList @('rand', '-base64', '32')
    if ($probe.Status -eq 0 -and $probe.Output.Count -ge 1) {
      $line = $probe.Output[0].Trim()
      if ($line -ne '') { return $line }
    }
  }
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $bytes = New-Object byte[] 32
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  } finally {
    $generator.Dispose()
  }
}

# The secret a managed Bot is given, generated and written back on first run - not a fixed default.
# A Bot publishes a port, so a well-known token from a public repository would be no boundary at
# all. Generated once per machine and persisted in .env rather than exported for this run alone,
# because the server and the Bot are separate processes that have to agree on it across restarts
# and because `docker compose up` by hand later must see the same value.
function Set-OrboGeneratedSecret {
  param([string]$Name)
  $value = Get-OrboSetting -Name $Name -Fallback ''
  if (-not [string]::IsNullOrEmpty($value)) { return $value }
  $script:SecretsRotated = $true
  $value = New-OrboSecret
  Set-OrboDotEnvValue -Name $Name -Value $value
  if ($DryRun) {
    Write-OrboInfo "  would generate $Name and write it to .env"
  } else {
    Write-OrboInfo "  Generated $Name and wrote it to .env."
  }
  return $value
}

# A native command run without this script's $ErrorActionPreference turning the stderr records it
# emits into terminating errors. The output is captured (optionally to a log file) and the exit
# code returned; docker's own words belong to the caller, the way they do in the bash scripts,
# where stderr is either the terminal or /dev/null and never `set -e`.
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

# The worker handoff probe. POST the route with this run's secret and a deliberately empty body:
# in server/src/app.ts the secret is checked before the body is parsed, so a server holding this
# same secret rejects the empty body with 400 - the healthy answer. 401 means it does not hold
# this secret; 404 means it predates the route. Both are cured by a restart into this run's
# environment.
function Invoke-OrboHandoffProbe {
  param([string]$Url, [string]$Token)
  $result = [pscustomobject]@{ Status = 0 }
  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = 'POST'
    $request.Timeout = 3000
    $request.Proxy = $null
    $request.ContentType = 'application/json'
    $request.Headers.Add('Authorization', "Bearer $Token")
    $body = [System.Text.Encoding]::UTF8.GetBytes('{}')
    $request.ContentLength = $body.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($body, 0, $body.Length) } finally { $stream.Close() }
    $response = $request.GetResponse()
    try { $result.Status = [int]$response.StatusCode } finally { $response.Close() }
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
# The same question start.sh asks, for the same reason: any single-page app serves its own
# index.html for every path it does not recognise, so an unrelated dashboard on a default port
# answers 200 to /api/capabilities as readily as this server does. So each surface is asked for
# something only it can produce - a field of this server's own payload, the app's title, or a
# route named for this stack.
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

function Get-OrboPortReport {
  param([int]$Port, [string]$Name)
  $holder = Get-OrboPortHolder -Port $Port
  if ([string]::IsNullOrEmpty($holder)) { return 'free' }
  if (Test-OrboIdentity -Port $Port -Name $Name) { return "already up ($holder)" }
  return "held by something that is not ORBO: $holder"
}

# Starting on an occupied port is a failed run, so a port holder is only left alone once it has
# identified itself, and is otherwise named and refused.
function Assert-OrboPortFree {
  param([int]$Port, [string]$Name)
  $holder = Get-OrboPortHolder -Port $Port
  if ([string]::IsNullOrEmpty($holder)) { return }
  if (Test-OrboIdentity -Port $Port -Name $Name) {
    Write-OrboInfo "  ${Name}: already up on $Port ($holder)"
    return
  }
  Write-OrboRed "  ${Name}: port $Port is held by something that is not ORBO: $holder"
  Write-OrboRed "  Re-run with $($Name.ToUpper())_PORT=<free port>, or stop that process yourself."
  exit 1
}

# As Wait-OrboUrl, but satisfied only by ORBO answering, not by anything answering.
function Wait-OrboIdentity {
  param([int]$Port, [string]$Name, [int]$Tries = 40)
  for ($try = 1; $try -le $Tries; $try++) {
    if (Test-OrboIdentity -Port $Port -Name $Name) {
      Write-OrboGreen "  $Name ready"
      return
    }
    Start-Sleep -Seconds 1
  }
  Write-OrboRed "  $Name never answered as ORBO on port $Port"
  Write-OrboRed '  Either it failed to start, or that port belongs to another process.'
  Write-OrboRed "  Log: $(Join-Path $Logs ($Name + '.log'))"
  exit 1
}

function Wait-OrboUrl {
  param([string]$Url, [string]$Name, [int]$Tries = 40)
  for ($try = 1; $try -le $Tries; $try++) {
    $response = Invoke-OrboGet -Url $Url
    if ($response.Ok) {
      Write-OrboGreen "  $Name ready"
      return
    }
    Start-Sleep -Seconds 1
  }
  Write-OrboRed "  $Name never became ready at $Url"
  Write-OrboRed "  Log: $(Join-Path $Logs ($Name + '.log'))"
  exit 1
}

# The launch patterns stop_matching and start-restart-guard.test.ts care about: the server as this
# script starts it, and the older `src/index.ts` shape some checkouts still have running.
function Stop-OrboServerForRestart {
  Stop-OrboMatching -Pattern 'bun --env-file=../.env src/production-entry.ts'
  Stop-OrboMatching -Pattern 'bun --env-file=../.env src/index.ts'
}

# Start a process on Bun, detached from this script, with its output in a log file.
#
# Through `cmd /s /c ... > log 2>&1` because that is the one redirection this platform offers that
# gives the child a file rather than this script's pipes: a child holding a pipe this script later
# closes dies with it. The /s /c quoting is cmd's documented "strip the first and last quote"
# rule, which is what lets an executable path contain spaces and still be one word.
function Start-OrboBackground {
  param(
    [string]$WorkingDirectory,
    [string[]]$ArgumentList,
    [string]$LogFile,
    [hashtable]$Environment
  )
  $bun = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $bun) {
    Write-OrboRed '  Bun is not on PATH any more, and every process below runs on it.'
    Write-OrboRed '  Install it from https://bun.sh, then rerun this script.'
    exit 1
  }
  $inner = '"' + $bun.Source + '" ' + ($ArgumentList -join ' ') + ' > "' + $LogFile + '" 2>&1'
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $env:ComSpec
  if ([string]::IsNullOrEmpty($startInfo.FileName)) { $startInfo.FileName = 'cmd.exe' }
  $startInfo.Arguments = '/s /c "' + $inner + '"'
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  if ($null -ne $Environment) {
    foreach ($key in $Environment.Keys) { $startInfo.EnvironmentVariables[$key] = [string]$Environment[$key] }
  }
  [System.Diagnostics.Process]::Start($startInfo) | Out-Null
}

# $null when the engine is usable, else the lines to show. Checked rather than assumed because on
# a Windows machine a stopped Docker Desktop is the ordinary first-run state, and `set -e` in
# start.sh would report it as nothing at all.
function Get-OrboDockerProblem {
  $docker = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $docker) {
    return @(
      'Docker is not installed, or not on PATH. The database and every Bot run in containers, so nothing below can start.'
      'Run scripts\fix-docker.ps1 -CheckOnly to diagnose; a real repair run of scripts\fix-docker.ps1 needs an elevated shell.'
      'For a full first-time setup (prerequisites, .env, compose), run scripts\install.ps1.'
    )
  }
  $compose = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', 'version')
  if ($compose.Status -ne 0) {
    return @(
      'Docker is on PATH but the Compose v2 plugin ("docker compose") is not working.'
      'Run scripts\fix-docker.ps1 -CheckOnly to diagnose, or start Docker Desktop and try again.'
    )
  }
  $daemon = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('info')
  if ($daemon.Status -ne 0) {
    return @(
      'Docker is installed but its engine is not running (docker info failed).'
      'Start Docker Desktop from the Start menu and wait for its whale icon to be steady, then rerun this script.'
      'With the WSL 2 backend, "wsl -d docker-desktop" is what starts the engine.'
      'For a stale or hung engine, scripts\fix-docker.ps1 -CheckOnly diagnoses it and the repair run needs an elevated shell.'
    )
  }
  return $null
}

if ($DryRun) {
  # Nothing below creates the directory in a check-only run.
} elseif (-not (Test-Path -LiteralPath $Logs -PathType Container)) {
  New-Item -ItemType Directory -Path $Logs | Out-Null
}

if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
  Write-OrboRed '.env is missing. Copy .env.example to .env and fill in the required settings.'
  Write-OrboRed 'For a first-time setup that also checks Docker and Bun, run scripts\install.ps1.'
  exit 1
}

$bun = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $bun) {
  Write-OrboRed 'Bun is not on PATH, and the API server, the app and the routine worker all run on it.'
  Write-OrboRed 'Install it from https://bun.sh, then rerun this script.'
  exit 1
}

$script:EnvLines = [System.IO.File]::ReadAllText($EnvPath) -split "`r?`n"

$appPort = Get-OrboPortSetting -Name 'APP_PORT' -Fallback 3010
$serverPort = Get-OrboPortSetting -Name 'SERVER_PORT' -Fallback 3001
$computerPort = Get-OrboPortSetting -Name 'ORBO_COMPUTER_PORT' -Fallback 4100
$botPort = Get-OrboPortSetting -Name 'BOT_PORT' -Fallback 4200
$langgraphPort = Get-OrboPortSetting -Name 'LANGGRAPH_PORT' -Fallback 4201
$supervisorPort = Get-OrboPortSetting -Name 'SUPERVISOR_PORT' -Fallback 4500
$botProvider = (Get-OrboSetting -Name 'BOT_PROVIDER' -Fallback 'openai').Trim().ToLowerInvariant()
# Compared case-sensitively, as bash's `[ "$ONE_COMPUTER_EACH" = "true" ]` does: a .env that says
# True is read the same by both stacks rather than quietly meaning something else here.
$oneComputerEach = Get-OrboSetting -Name 'ORBO_ONE_COMPUTER_EACH' -Fallback 'true'
$supervisorToken = Get-OrboSetting -Name 'SUPERVISOR_TOKEN' -Fallback 'orbo-dev-supervisor-token'
$computerToken = Get-OrboSetting -Name 'ORBO_COMPUTER_TOKEN' -Fallback 'orbo-dev-computer-token'
$workerSharedSecret = Get-OrboSetting -Name 'WORKER_SHARED_SECRET' -Fallback 'orbo-dev-worker-secret'
# The laptop stack runs orbo-langgraph on LANGGRAPH_PORT. The one-container image does not, so this
# default stays in the script rather than in .env, for start.sh's reason: a
# `docker run --env-file .env` must not inherit a URL pointing at a process the image lacks.
$agUiUrl = Get-OrboSetting -Name 'ORBO_MANAGED_AGENT_AG_UI_URL' -Fallback "http://localhost:$langgraphPort/ag-ui"
$managedAgentToken = Set-OrboGeneratedSecret -Name 'ORBO_MANAGED_AGENT_TOKEN'
$agentToolToken = Set-OrboGeneratedSecret -Name 'ORBO_AGENT_TOOL_TOKEN'

# The same values start.sh exports, so compose and every child process see what this run resolved.
# PORT is deliberately not among them: start.sh passes it to the server process alone, and a
# process-wide PORT here would reach compose too.
$env:APP_PORT = [string]$appPort
$env:SERVER_PORT = [string]$serverPort
$env:ORBO_MANAGED_AGENT_AG_UI_URL = $agUiUrl
$env:ORBO_MANAGED_AGENT_TOKEN = $managedAgentToken
$env:ORBO_AGENT_TOOL_TOKEN = $agentToolToken
$env:SUPERVISOR_TOKEN = $supervisorToken
$env:ORBO_COMPUTER_TOKEN = $computerToken
$env:WORKER_SHARED_SECRET = $workerSharedSecret
$env:ORBO_COMPUTER_PORT = [string]$computerPort
$env:BOT_PORT = [string]$botPort
$env:LANGGRAPH_PORT = [string]$langgraphPort
$env:SUPERVISOR_PORT = [string]$supervisorPort
# Quiet progress, for start.sh's reason: newer Compose picks its interactive build display when it
# sees a terminal, and stops with "failed to get console". An environment variable rather than
# `--progress`, because a Compose too old to know the flag refuses it and one too old to know the
# variable ignores it.
$env:COMPOSE_PROGRESS = 'quiet'

Push-Location -LiteralPath $Root

Write-Host ''
Write-Host 'ORBO'
Write-Host '======='

Write-OrboInfo '1/4  Docker services'
$services = @('postgres')
if ($oneComputerEach -ceq 'true') { $services += 'supervisor' }
# Every selected Bot service, every run, whether or not it is already answering: answering says the
# process is alive, not that its environment still matches this deployment. A skipped service is
# never handed to `docker compose up`, so compose never compares its configuration - which is how a
# Bot ends up holding a secret this deployment no longer accepts, and how every tool call it makes
# is refused at the door and returned to its own model as "no results".
$services += 'orbo-computer'
# The managed coworker uses LangGraph. The separate legacy sample only accepts OpenAI keys, so
# requiring it would stop an Anthropic-only deployment from reaching its managed Bot.
if ($botProvider -ceq 'anthropic') {
  Write-OrboInfo '  orbo-bot: skipped for Anthropic (OpenAI-only sample)'
} else {
  $services += 'orbo-bot'
}
$services += 'orbo-langgraph'

$dockerProblem = Get-OrboDockerProblem
if ($DryRun) {
  Write-OrboInfo "  compose services: $($services -join ', ')"
  if ($null -ne $dockerProblem) {
    foreach ($line in $dockerProblem) { Write-OrboRed "  $line" }
    Write-OrboRed '  A real run stops here until Docker is available.'
  } else {
    Write-OrboInfo "  would run: docker compose -f $ComposeFile up -d --build $($services -join ' ')"
    Write-OrboInfo '  would apply migrations, wait for each Bot service to answer, and check the coworker tables.'
  }
} else {
  if ($null -ne $dockerProblem) {
    foreach ($line in $dockerProblem) { Write-OrboRed "  $line" }
    exit 1
  }
  & docker compose -f $ComposeFile up -d --build @services | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-OrboRed "  docker compose up failed (exit code $LASTEXITCODE). The services above did not start; docker's own message is just above."
    exit 1
  }
  $migrate = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', '-f', $ComposeFile, 'run', '--rm', '--build', 'migrate') -LogFile (Join-Path $Logs 'migrate.log')
  if ($migrate.Status -ne 0) {
    Write-OrboRed '  Migrations did not apply. The database is not the schema this server expects.'
    Write-OrboRed "  Log: $(Join-Path $Logs 'migrate.log')"
    exit 1
  }
  Wait-OrboUrl -Url "http://localhost:$computerPort/health" -Name 'orbo-computer'
  # orbo-bot is not waited for on an Anthropic deployment: it was never started.
  if ($botProvider -cne 'anthropic') {
    Wait-OrboUrl -Url "http://localhost:$botPort/health" -Name 'orbo-bot'
  }
  Wait-OrboUrl -Url "http://localhost:$langgraphPort/health" -Name 'orbo-langgraph'

  foreach ($table in @('agent_profiles', 'agent_preferences')) {
    $check = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', '-f', $ComposeFile, 'exec', '-T', 'postgres', 'psql', '-U', 'orbo', '-d', 'orbo', '-tAc', "select to_regclass('public.$table')")
    $found = $false
    foreach ($line in $check.Output) { if ($line.Trim() -eq $table) { $found = $true } }
    if (-not $found) {
      Write-OrboRed "  $table is missing. Run: bun run --cwd server db:migrate"
      exit 1
    }
  }
  Write-OrboGreen '  coworker tables migrated'
  Write-OrboGreen "  managed coworker endpoint: $agUiUrl"
}

Write-OrboInfo '2/4  Server'
Assert-OrboPortFree -Port $serverPort -Name 'server'
$serverRestartReason = ''
if ($script:SecretsRotated) {
  $serverRestartReason = 'a secret was generated this run, so the server is restarted to pick it up'
}
# A running server is left alone UNLESS this run minted a secret, or unless it fails the handoff
# probe below - it read its environment once at startup and cannot notice the file changed under it.
if ($serverRestartReason -eq '' -and (Test-OrboIdentity -Port $serverPort -Name 'server')) {
  $probe = Invoke-OrboHandoffProbe -Url "http://localhost:$serverPort/internal/routines/run" -Token $workerSharedSecret
  if ($probe.Status -eq 401) {
    $serverRestartReason = 'server: up, but refuses the worker''s secret (401), so it is restarted to pick it up'
  } elseif ($probe.Status -eq 404) {
    $serverRestartReason = 'server: up, but has no /internal/routines/run (404: an older checkout), so it is restarted'
  }
}
if ($serverRestartReason -ne '') {
  if ($DryRun) {
    if ($script:SecretsRotated) {
      Write-OrboInfo '  server: a secret would be generated this run, so a running server would be restarted to pick it up'
    } else {
      Write-OrboInfo "  server: would be restarted ($serverRestartReason)"
    }
  } else {
    Write-OrboInfo "  $serverRestartReason"
    Stop-OrboServerForRestart
    Start-Sleep -Seconds 1
  }
}
if (-not (Test-OrboIdentity -Port $serverPort -Name 'server')) {
  if ($DryRun) {
    Write-OrboInfo "  would start the API server (log: $(Join-Path $Logs 'server.log'))"
  } else {
    $serverEnvironment = @{
      PORT                 = [string]$serverPort
      WORKER_SHARED_SECRET = $workerSharedSecret
    }
    if ($oneComputerEach -ceq 'true') {
      $serverEnvironment['ORBO_COMPUTER_SUPERVISOR_URL'] = "http://localhost:$supervisorPort"
      $serverEnvironment['SUPERVISOR_TOKEN'] = $supervisorToken
      $serverEnvironment['ORBO_COMPUTER_TOKEN'] = $computerToken
    }
    Start-OrboBackground -WorkingDirectory (Join-Path $Root 'server') -ArgumentList @('--env-file=../.env', 'src/production-entry.ts') -LogFile (Join-Path $Logs 'server.log') -Environment $serverEnvironment
  }
}
if ($DryRun) {
  Write-OrboInfo "  server: $(Get-OrboPortReport -Port $serverPort -Name 'server')"
} else {
  Wait-OrboIdentity -Port $serverPort -Name 'server'
}

# The worker: a local stand-in for the routines CronJob, looping the same sweep a cluster would run
# on a schedule. Started only now, because dispatching a claimed routine is one HTTP call to this
# server's own /internal/routines/run, and the wait above is what confirms that call has somewhere
# to land.
#
# Guarded by a process check rather than an HTTP one, the same way the restart guard matches the
# server's own command line: the worker loop has no endpoint of its own to ask. Launched from $Root
# with `bun worker/src/index.ts`, not `cd worker && bun src/index.ts`, so the pattern matches
# nothing else in the repo - on a Linux host the old shape matched the server, computer and
# supervisor containers too and the worker silently never started.
if (Test-OrboRunning -Pattern 'bun worker/src/index.ts') {
  Write-OrboInfo '  worker: already running'
} elseif ($DryRun) {
  Write-OrboInfo '  would start the worker (routine sweep loop)'
} else {
  $workerDatabaseUrl = Get-OrboSetting -Name 'DATABASE_URL' -Fallback 'postgres://orbo:orbo@localhost:5432/orbo'
  Start-OrboBackground -WorkingDirectory $Root -ArgumentList @('worker/src/index.ts') -LogFile (Join-Path $Logs 'worker.log') -Environment @{
    DATABASE_URL         = $workerDatabaseUrl
    SERVER_INTERNAL_URL  = "http://localhost:$serverPort"
    WORKER_SHARED_SECRET = $workerSharedSecret
  }
  Write-OrboInfo '  worker: started (routine sweep loop)'
  Start-Sleep -Seconds 1
  if (-not (Test-OrboRunning -Pattern 'bun worker/src/index.ts')) {
    Write-OrboRed "  worker: did not stay up, check $(Join-Path $Logs 'worker.log')"
  }
}

Write-OrboInfo '3/4  Runtime health'
if ($DryRun) {
  Write-OrboInfo '  would check the licence and the registered Bots on the running server.'
} else {
  $info = Invoke-OrboGet -Url "http://localhost:$serverPort/api/copilotkit/info" -TimeoutSec 8
  if (-not $info.Ok) {
    Write-OrboRed "  /api/copilotkit/info did not answer as ORBO on port $serverPort."
    Write-OrboRed '  Either the server failed to start, or that port belongs to another process.'
    Write-OrboRed "  Log: $(Join-Path $Logs 'server.log')"
    exit 1
  }
  $serverInfo = $null
  try { $serverInfo = $info.Body | ConvertFrom-Json } catch { $serverInfo = $null }
  if ($null -eq $serverInfo) {
    Write-OrboRed "  /api/copilotkit/info answered, but not as this server: the body was not JSON. Port $serverPort may belong to another process."
    Write-OrboRed "  Log: $(Join-Path $Logs 'server.log')"
    exit 1
  }
  $licenseStatus = ''
  if ($null -ne $serverInfo.licenseStatus) { $licenseStatus = [string]$serverInfo.licenseStatus }
  $agentNames = @()
  if ($null -ne $serverInfo.agents) {
    $agentNames = @($serverInfo.agents.PSObject.Properties | ForEach-Object { $_.Name })
  }
  if ($licenseStatus -ne 'valid') {
    Write-OrboRed "  licence is '$licenseStatus', not 'valid'."
    Write-OrboRed '  Check INTELLIGENCE_API_KEY: npx copilotkit@latest login && npx copilotkit@latest project select'
    Write-OrboRed '  See README.md for Intelligence setup.'
    exit 1
  }
  if ($agentNames.Count -eq 0) {
    Write-OrboRed '  No Bots registered.'
    exit 1
  }
  Write-OrboGreen "  licence valid - mode $($serverInfo.mode) - Bots: $($agentNames -join ', ')"
}

Write-OrboInfo '4/4  App'
Assert-OrboPortFree -Port $appPort -Name 'app'
if (-not (Test-OrboIdentity -Port $appPort -Name 'app')) {
  if ($DryRun) {
    Write-OrboInfo "  would start the app (log: $(Join-Path $Logs 'app.log'))"
  } else {
    Start-OrboBackground -WorkingDirectory (Join-Path $Root 'app') -ArgumentList @('run', 'dev', '--port', [string]$appPort, '--strictPort') -LogFile (Join-Path $Logs 'app.log') -Environment @{}
  }
}
if ($DryRun) {
  Write-OrboInfo "  app: $(Get-OrboPortReport -Port $appPort -Name 'app')"
} else {
  Wait-OrboIdentity -Port $appPort -Name 'app'
}

if ($DryRun) {
  Write-Host ''
  Write-OrboGreen 'Check only. Nothing was written, started or stopped.'
  Write-OrboInfo "Compose services a real run would bring up: $($services -join ', ')"
  Write-OrboInfo "App: $(Get-OrboPortReport -Port $appPort -Name 'app')"
  Write-OrboInfo "Server: $(Get-OrboPortReport -Port $serverPort -Name 'server')"
  if (Test-OrboRunning -Pattern 'bun worker/src/index.ts') {
    Write-OrboInfo 'Worker: already running'
  } else {
    Write-OrboInfo 'Worker: not running'
  }
  Pop-Location
  exit 0
}

Write-Host ''
Write-OrboGreen "Ready. http://localhost:$appPort"
Write-Host ''
Write-Host 'Next steps:'
Write-Host ''
Write-Host "  - Direct Bot chat:       http://localhost:$appPort/bot"
Write-Host "  - Bots:                  http://localhost:$appPort/bots"
Write-Host "  - Audit trail:           http://localhost:$appPort/admin/audit"
Write-Host "  - Boundaries/policy:     http://localhost:$appPort/admin/boundaries"
Write-Host '  - Setup docs:            README.md'
Write-Host '  - Configuration docs:    docs/configuration.md'
Write-Host ''
Write-Host 'Try:'
Write-Host ''
Write-Host '  1. Open /bot and ask: Open news.ycombinator.com and tell me the top story.'
Write-Host '  2. Create a Bot in /bots and start a channel with it.'
Write-Host '  3. Review browser/file actions in /admin/audit.'
Write-Host '  4. Add a deny rule in /admin/boundaries, then retry the same action.'
Write-Host ''
Write-Host "Logs: $Logs"
Write-Host "  Routine sweep worker: $(Join-Path $Logs 'worker.log')"
Write-Host ''
Write-OrboGreen 'Stop all of it: powershell -NoProfile -File scripts\stop.ps1'
Write-Host '  The app, the worker, the API server, the Docker services, and each Bot''s computer, which compose'
Write-Host '  does not own because the supervisor makes it. Pass -KeepComputers to leave the browsers signed'
Write-Host '  in. Nothing is deleted either way: the database, the files and the browser profiles are volumes.'

Pop-Location
