#requires -Version 5.1
#
# This file is PowerShell and cannot be read by sh, bash or Git Bash: those shells meet the first
# PowerShell construct below and stop with a syntax error, having run nothing. The line above that
# construct is this one. Run this script as:
#
#   powershell -NoProfile -File scripts\install.ps1      (Windows PowerShell 5.1)
#   pwsh -NoProfile -File scripts\install.ps1            (PowerShell 7+)
#
<#
.SYNOPSIS
  One-line self-host install for ORBO on Windows (compose path): prerequisites, .env bootstrap,
  compose up, migrate. Idempotent and safe to rerun.

  A native mirror of scripts/install.sh. What rerunning does: .env is created from .env.example
  only when absent (never overwritten), each secret below is generated only when its key is empty,
  and `docker compose up` is declarative (a service whose configuration has not changed is left
  alone). The compose file is the source of truth for services, profiles and ports; this script
  only selects which of them to bring up, the same way scripts\start.ps1 does.

  By default this ends by handing off to scripts\start.ps1, which starts the host API server, app
  and routine worker on top of these services. Pass -NoStart to prep without launching, or
  -CheckOnly for a side-effect-free preflight (CI/review).

  One line, from a clean checkout:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1

.PARAMETER NoStart
  Prep everything but do not launch the server/app (skip the start.ps1 handoff). `--no-start`
  is accepted too.

.PARAMETER CheckOnly
  Preflight only: check tools and report which required keys are still empty. Touches nothing
  (no .env, no secrets, no Docker changes). Exits 1 when something required is missing.
  `--check-only` is accepted too. -WhatIf does the same.

.PARAMETER Help
  Show this help and exit. `--help` and -h are accepted too.

.NOTES
  Differences from scripts/install.sh, every one of them deliberate, and none of them silent:

  1. Prerequisites are docker, bun and node. install.sh also requires openssl and curl: openssl
     mints the two Bot secrets and curl polls the health endpoints. On Windows both jobs are done
     in-process - the secrets by the .NET random number generator (openssl still wins when it is
     on PATH, exactly as start.ps1 does it) and the polls by .NET's WebRequest - so neither tool
     is needed here. node is checked in their place because the Intelligence login
     (npx copilotkit@latest) and several repo scripts run on it.

  2. A stopped Docker engine is the ordinary first-run state on a Windows machine, not an error
     message. When `docker info` fails, scripts\fix-docker.ps1 -CheckOnly is run for its
     read-only diagnosis and its output is relayed, and the message names the elevated repair
     run - the same guidance start.ps1 gives, from the script whose job it is to repair.

  3. There is no `exec` in PowerShell, so the handoff to start.ps1 is a call, not a replacement
     process. start.ps1 launches every host process detached, so this script returning after the
     handoff is not the stack going down.

  4. A health endpoint that never answers points at `docker compose logs <service>`, where
     install.sh points at a per-service file under .logs that only start.sh writes.

  5. `bash scripts\install.ps1` is not a supported invocation. Unlike install.sh's
     require-bash.sh there is no sentence naming the fix, because a shell that cannot parse this
     file cannot run a guard written in it; the comment at the top is the explanation.

.EXAMPLE
  powershell -NoProfile -File scripts\install.ps1

.EXAMPLE
  pwsh -NoProfile -File scripts\install.ps1 -NoStart

.EXAMPLE
  pwsh -NoProfile -File scripts\install.ps1 -CheckOnly
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$NoStart,

  [switch]$CheckOnly,

  [Alias('h')]
  [switch]$Help,

  # Bash-style flags (--no-start, --check-only, --help) and anything else unrecognized land here
  # rather than failing the parameter binder, so the message can name the argument the way
  # install.sh does.
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root '.logs'
$EnvPath = Join-Path $Root '.env'
$EnvExamplePath = Join-Path $Root '.env.example'
# Relative, because docker runs from $Root exactly where install.sh runs it, and compose resolves
# the paths inside the file from there.
$ComposeFile = 'deploy/compose/docker-compose.yml'

# Last-wins lines of .env, re-read only when the file is (re)written. See Get-OrboSetting.
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
# colour. Falling back to plain text keeps a redirected run readable. Same as start.ps1.
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
  Write-Host 'Usage: powershell -NoProfile -File scripts\install.ps1 [-NoStart] [-CheckOnly] [-WhatIf] [-Help]'
  Write-Host ''
  Write-Host 'Idempotent self-host installer (compose path). Checks prerequisites, creates .env'
  Write-Host 'from .env.example when absent (never overwrites), generates the two loopback Bot'
  Write-Host 'secrets start.ps1 manages, brings the compose services up, runs migrations, waits for'
  Write-Host 'health, then hands off to scripts\start.ps1.'
  Write-Host ''
  Write-Host '  -NoStart    Prep everything but do not launch the server/app (skip the start.ps1 handoff).'
  Write-Host '  -CheckOnly  Preflight only: check tools and report which required keys are still'
  Write-Host '              empty. Touches nothing (no .env, no secrets, no Docker changes). Exits 1'
  Write-Host '              when something required is missing.'
  Write-Host '  -WhatIf     The same as -CheckOnly.'
  Write-Host '  -Help       Show this help.'
}

if ($null -ne $Rest) {
  foreach ($argument in $Rest) {
    switch ($argument) {
      '--no-start' { $NoStart = $true }
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
# matched pair of surrounding quotes is taken off the way the `sed` expression in install.sh did.
# Same as start.ps1.
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

# The environment first, then .env, then the default - the same resolution order install.sh's
# `setting()` uses, so a port or token configured in either place is what this script uses. An
# absent OR an empty value takes the default, which is the whole reason .env.example can ship a
# key with an empty value and still mean "not set". Same as start.ps1.
function Get-OrboSetting {
  param([string]$Name, [string]$Fallback)
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrEmpty($value)) { $value = Get-OrboDotEnvValue -Name $Name }
  if ([string]::IsNullOrEmpty($value)) { return $Fallback }
  return $value
}

# Set NAME in .env, replacing any existing line for it and appending when there was none - the
# same rewrite install.sh does with grep -v plus a printf. Written as UTF-8 (with the byte-order
# mark only if the file already had one: a BOM this script added would become part of the first
# key for every reader that does not skip it), and with the file's own line endings, because
# compose, bun and this script all read the result afterwards. Same as start.ps1.
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
# the value is byte-identical to what install.sh writes on a machine that has it; the .NET random
# number generator is the fallback for the ordinary Windows machine where openssl is not on PATH.
# Same as start.ps1.
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
# and because `docker compose up` by hand later must see the same value. Same as start.ps1, and
# the same two names install.sh's ensure_secret mints.
function Set-OrboGeneratedSecret {
  param([string]$Name)
  $value = Get-OrboSetting -Name $Name -Fallback ''
  if (-not [string]::IsNullOrEmpty($value)) { return $value }
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
# code returned; docker's own words belong to the caller, the way they do in the bash scripts.
# Same as start.ps1.
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
  $result = [pscustomobject]@{ Ok = $false; Status = 0 }
  try {
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = 'GET'
    $request.Timeout = $TimeoutSec * 1000
    $request.Proxy = $null
    $response = $request.GetResponse()
    try {
      $result.Status = [int]$response.StatusCode
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

# install.sh's wait_for: sixty one-second tries at a health URL. The log the failure names is
# `docker compose logs <service>`, because these services belong to compose and their output is
# not in any file under .logs until start.ps1 launches something of its own.
function Wait-OrboUrl {
  param([string]$Url, [string]$Name, [string]$Service, [int]$Tries = 60)
  for ($try = 1; $try -le $Tries; $try++) {
    $response = Invoke-OrboGet -Url $Url
    if ($response.Ok) {
      Write-OrboGreen "  $Name ready"
      return
    }
    Start-Sleep -Seconds 1
  }
  Write-OrboRed "  $Name never became ready at $Url"
  Write-OrboRed "  Logs: docker compose -f $ComposeFile logs $Service"
  exit 1
}

# The read-only half of scripts\fix-docker.ps1, run for its diagnosis when the engine is down and
# relayed as it prints: -CheckOnly writes its findings with Write-Host, which is the host's own
# output rather than the pipeline, so the honest passthrough is to let it print here instead of
# trying to capture and re-indent it. It mutates nothing, which is why it is safe to run from
# both a real install and a -CheckOnly preflight.
function Invoke-OrboFixDockerDiagnosis {
  $fixDocker = Join-Path $PSScriptRoot 'fix-docker.ps1'
  if (-not (Test-Path -LiteralPath $fixDocker -PathType Leaf)) { return }
  Write-Host ''
  Write-OrboInfo '  Diagnosis, from scripts\fix-docker.ps1 -CheckOnly (read-only):'
  & $fixDocker -CheckOnly
  Write-Host ''
}

# $null when the engine is usable, else the lines to show. The same three questions start.ps1
# asks, in the same order: on PATH, Compose v2 working, daemon answering.
function Get-OrboDockerProblem {
  $docker = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $docker) {
    return @(
      'Docker is not installed, or not on PATH. The database and every Bot run in containers, so nothing below can start.'
      'Install Docker Desktop: https://docs.docker.com/desktop/setup/windows-install/'
      'scripts\fix-docker.ps1 only repairs an existing install; it cannot install one.'
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
    Invoke-OrboFixDockerDiagnosis
    return @(
      'Docker is installed but its engine is not running (docker info failed).'
      'Start Docker Desktop from the Start menu and wait for its whale icon to be steady, then rerun this script.'
      'With the WSL 2 backend, "wsl -d docker-desktop" is what starts the engine.'
      'For a stale or hung engine, run the repair ELEVATED (it restarts Windows services and shuts down WSL):'
      '  powershell -ExecutionPolicy Bypass -File scripts\fix-docker.ps1'
    )
  }
  return $null
}

if ($DryRun) {
  # Nothing below creates the directory in a check-only run. Same as start.ps1.
} elseif (-not (Test-Path -LiteralPath $Logs -PathType Container)) {
  New-Item -ItemType Directory -Path $Logs | Out-Null
}

Write-Host ''
Write-Host 'ORBO self-host install'
Write-Host '======================'
Write-Host ''

Write-OrboInfo '1/5  Prerequisites'
$missingTools = $false
foreach ($tool in @('docker', 'bun', 'node')) {
  $command = Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $command) {
    Write-OrboInfo "  ${tool}: found ($($command.Source))"
  } else {
    switch ($tool) {
      'bun' {
        Write-OrboRed '  bun: missing - install it first: https://bun.sh (see docs/self-host.md)'
      }
      'node' {
        Write-OrboRed '  node: missing - the Intelligence login (npx copilotkit@latest) and several repo scripts need it (see docs/self-host.md)'
      }
      default {
        Write-OrboRed "  ${tool}: missing - install it first (see docs/self-host.md)"
      }
    }
    $missingTools = $true
  }
}
if ($missingTools) { exit 1 }

$dockerProblem = Get-OrboDockerProblem
if ($null -ne $dockerProblem) {
  foreach ($line in $dockerProblem) { Write-OrboRed "  $line" }
  exit 1
}
$composeShort = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', 'version', '--short')
$composeVersionText = 'available'
if ($composeShort.Status -eq 0 -and $composeShort.Output.Count -ge 1) {
  $trimmed = $composeShort.Output[0].Trim()
  if ($trimmed -ne '') { $composeVersionText = $trimmed }
}
Write-OrboInfo "  docker daemon: reachable"
Write-OrboInfo "  docker compose: $composeVersionText"
Write-OrboGreen '  prerequisites ok'

if (-not (Test-Path -LiteralPath $EnvExamplePath -PathType Leaf)) {
  Write-OrboRed '.env.example is missing. Run from the repository root.'
  exit 1
}

# Report one required key. install.sh phrases this twice - once for the preflight, once for the
# advisory pass - with the same question and nearly the same words; here one function serves both,
# and the caller decides whether the answer ends the run.
function Test-OrboRequiredKey {
  param(
    [string]$Name,
    [string]$Hint,
    [string]$Label,
    [switch]$AnyOf
  )
  if ([string]::IsNullOrEmpty($Label)) { $Label = $Name }
  $names = @($Name)
  if ($AnyOf) { $names = $Name -split ',' }
  foreach ($one in $names) {
    if (-not [string]::IsNullOrEmpty((Get-OrboSetting -Name $one -Fallback ''))) {
      Write-OrboInfo "  ${Label}: set"
      return $false
    }
  }
  Write-OrboRed "  ${Label}: MISSING - $Hint"
  return $true
}

function Test-OrboRequiredKeys {
  param([switch]$Fatal)
  $problems = $false
  $keyEncryptionKey = Get-OrboSetting -Name 'KEY_ENCRYPTION_KEY' -Fallback ''
  if ([string]::IsNullOrEmpty($keyEncryptionKey) -or $keyEncryptionKey -ceq 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') {
    Write-OrboRed '  KEY_ENCRYPTION_KEY: missing or still the public example value - generate one: openssl rand -base64 32'
    $problems = $true
  } else {
    Write-OrboInfo '  KEY_ENCRYPTION_KEY: set'
  }
  if (Test-OrboRequiredKey -Name 'INTELLIGENCE_API_KEY' -Hint 'from: npx --yes copilotkit@latest login && npx --yes copilotkit@latest project select') { $problems = $true }
  if (Test-OrboRequiredKey -Name 'OPENAI_API_KEY,ANTHROPIC_API_KEY,GOOGLE_API_KEY,CLAUDE_CODE_OAUTH_TOKEN' -AnyOf -Label 'model key' -Hint 'set OPENAI_API_KEY (or ANTHROPIC_API_KEY / GOOGLE_API_KEY)') { $problems = $true }
  $singleUser = Get-OrboSetting -Name 'ORBO_SINGLE_USER' -Fallback ''
  if ($singleUser -cne 'true') {
    if (Test-OrboRequiredKey -Name 'GOOGLE_OAUTH_CLIENT_ID,MICROSOFT_OAUTH_CLIENT_ID,OKTA_OAUTH_CLIENT_ID' -AnyOf -Label 'sign-in' -Hint 'configure a provider (GOOGLE_/MICROSOFT_/OKTA_OAUTH_*) or set ORBO_SINGLE_USER=true on a private address only') { $problems = $true }
  } else {
    Write-OrboInfo '  sign-in: set'
  }
  if ($problems -and $Fatal) {
    Write-Host ''
    Write-OrboRed 'Preflight failed: fill the keys above in .env, then rerun without -CheckOnly.'
    exit 1
  }
  return $problems
}

if ($DryRun) {
  Write-OrboInfo '2/5  Required keys (preflight - nothing will be written)'
  [void](Test-OrboRequiredKeys -Fatal)
  Write-Host ''
  Write-OrboGreen 'Preflight passed.'
  exit 0
}

Write-OrboInfo '2/5  Environment file'
if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
  Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvPath
  Write-OrboInfo '  Created .env from .env.example. Fill in the required keys (step 3 reports them).'
} else {
  Write-OrboInfo '  .env exists, left alone (never overwritten by this script).'
}
$script:EnvLines = [System.IO.File]::ReadAllText($EnvPath) -split "`r?`n"

# The two secrets start.ps1 manages, generated the same way and written back the same way. Both
# guard loopback-bound Bot ports, so a generated-and-persisted value is the right default here;
# every other secret (KEY_ENCRYPTION_KEY, BETTER_AUTH_SECRET, provider keys) is deployment-owned
# and only reported in step 3, never invented. Exported after the write, the way install.sh
# exports them, so compose and every child process see the same value this run resolved.
$env:ORBO_MANAGED_AGENT_TOKEN = Set-OrboGeneratedSecret -Name 'ORBO_MANAGED_AGENT_TOKEN'
$env:ORBO_AGENT_TOOL_TOKEN = Set-OrboGeneratedSecret -Name 'ORBO_AGENT_TOOL_TOKEN'

Write-OrboInfo '3/5  Required keys (fill what is missing, then rerun - nothing below needs them)'
[void](Test-OrboRequiredKeys)

Write-OrboInfo '4/5  Compose services'
$appPort = Get-OrboSetting -Name 'APP_PORT' -Fallback '3010'
$serverPort = Get-OrboSetting -Name 'SERVER_PORT' -Fallback '3001'
$computerPort = Get-OrboSetting -Name 'ORBO_COMPUTER_PORT' -Fallback '4100'
$botPort = Get-OrboSetting -Name 'BOT_PORT' -Fallback '4200'
$langgraphPort = Get-OrboSetting -Name 'LANGGRAPH_PORT' -Fallback '4201'
$supervisorPort = Get-OrboSetting -Name 'SUPERVISOR_PORT' -Fallback '4500'
$botProvider = (Get-OrboSetting -Name 'BOT_PROVIDER' -Fallback 'openai').Trim().ToLowerInvariant()
# Compared case-sensitively, as bash's `[ "$ONE_COMPUTER_EACH" = "true" ]` does: a .env that says
# True is read the same by both stacks rather than quietly meaning something else here.
$oneComputerEach = Get-OrboSetting -Name 'ORBO_ONE_COMPUTER_EACH' -Fallback 'true'
$pickedHarnessImage = Get-OrboSetting -Name 'PICKED_HARNESS_IMAGE' -Fallback ''
$supervisorToken = Get-OrboSetting -Name 'SUPERVISOR_TOKEN' -Fallback 'orbo-dev-supervisor-token'
$computerToken = Get-OrboSetting -Name 'ORBO_COMPUTER_TOKEN' -Fallback 'orbo-dev-computer-token'
$workerSharedSecret = Get-OrboSetting -Name 'WORKER_SHARED_SECRET' -Fallback 'orbo-dev-worker-shared-secret'
# The same values install.sh exports, so compose sees what this run resolved.
$env:APP_PORT = $appPort
$env:SERVER_PORT = $serverPort
$env:SUPERVISOR_TOKEN = $supervisorToken
$env:ORBO_COMPUTER_TOKEN = $computerToken
$env:WORKER_SHARED_SECRET = $workerSharedSecret
$env:ORBO_COMPUTER_PORT = $computerPort
$env:BOT_PORT = $botPort
$env:LANGGRAPH_PORT = $langgraphPort
$env:SUPERVISOR_PORT = $supervisorPort
# Quiet progress, for start.ps1's reason: newer Compose picks its interactive build display when
# it sees a terminal, and stops with "failed to get console". An environment variable rather than
# `--progress`, because a Compose too old to know the flag refuses it and one too old to know the
# variable ignores it.
$env:COMPOSE_PROGRESS = 'quiet'

# The same service selection install.sh and start.ps1 make: postgres and the computer always, the
# supervisor for one-computer-each, both shipped Bots except the OpenAI-only sample on an
# Anthropic deployment. The harness service lives behind the `harness` profile in the compose
# file (an unset PICKED_HARNESS_IMAGE would otherwise fail the whole up), so the profile is
# passed only when a harness was actually picked.
$services = @('postgres')
if ($oneComputerEach -ceq 'true') { $services += 'supervisor' }
$services += 'orbo-computer'
if ($botProvider -ceq 'anthropic') {
  Write-OrboInfo '  orbo-bot: skipped for Anthropic (OpenAI-only sample)'
} else {
  $services += 'orbo-bot'
}
$services += 'orbo-langgraph'
$profileArgs = @()
if (-not [string]::IsNullOrEmpty($pickedHarnessImage)) {
  $profileArgs = @('--profile', 'harness')
  $services += 'orbo-harness'
}

Push-Location -LiteralPath $Root

$composeUp = @('compose', '-f', $ComposeFile) + $profileArgs + @('up', '-d', '--build') + $services
& docker @composeUp | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-OrboRed "  docker compose up failed (exit code $LASTEXITCODE). The services above did not start; docker's own message is just above."
  exit 1
}
Write-OrboGreen "  compose services up: $($services -join ', ')"

$migrate = Invoke-OrboNative -FilePath 'docker' -ArgumentList @('compose', '-f', $ComposeFile, 'run', '--rm', '--build', 'migrate') -LogFile (Join-Path $Logs 'migrate.log')
if ($migrate.Status -ne 0) {
  Write-OrboRed '  Migrations did not apply. The database is not the schema this server expects.'
  Write-OrboRed "  Log: $(Join-Path $Logs 'migrate.log')"
  exit 1
}
Write-OrboGreen '  migrations applied'

Wait-OrboUrl -Url "http://localhost:$computerPort/health" -Name 'orbo-computer' -Service 'orbo-computer'
# orbo-bot is not waited for on an Anthropic deployment: it was never started.
if ($botProvider -cne 'anthropic') {
  Wait-OrboUrl -Url "http://localhost:$botPort/health" -Name 'orbo-bot' -Service 'orbo-bot'
}
Wait-OrboUrl -Url "http://localhost:$langgraphPort/health" -Name 'orbo-langgraph' -Service 'orbo-langgraph'

Write-OrboInfo '5/5  Next steps'
Write-Host ''
Write-OrboGreen 'Self-host prep complete.'
Write-Host '  Database migrations are applied and the compose services answer health checks:'
Write-Host "    - Bot computer:  http://localhost:$computerPort/health"
Write-Host "    - Framework Bot: http://localhost:$langgraphPort/health"
Write-Host ''

if ($NoStart) {
  Write-Host 'Next steps:'
  Write-Host ''
  Write-Host '  1. Fill any missing keys from step 3 in .env (server, Intelligence, model, sign-in).'
  Write-Host '  2. Launch the API server, app and routine worker: powershell -NoProfile -File scripts\start.ps1'
  Write-Host "  3. Open the app: http://localhost:$appPort"
  Write-Host "     Direct Bot chat: http://localhost:$appPort/bot - Bots: http://localhost:$appPort/bots"
  Write-Host ''
  Write-Host 'Full guide: docs/self-host.md - Manual single-container path: docs/deployment.md'
  Write-Host 'Stop everything: powershell -NoProfile -File scripts\stop.ps1'
  Pop-Location
  exit 0
}

Write-OrboInfo 'Handing off to scripts\start.ps1 (API server, app, routine worker)'
Write-Host ''
Pop-Location

# The handoff. start.ps1 shares no scope with this script, so its functions and its exits are its
# own; a nonzero exit code from it becomes this script's too. $LASTEXITCODE is reset first because
# a child script that finishes without calling `exit` leaves whatever the last native command
# inside it set, and only an explicit `exit N` from start.ps1 should be propagated.
$global:LASTEXITCODE = 0
& (Join-Path $PSScriptRoot 'start.ps1')
if ($global:LASTEXITCODE -ne 0) { exit $global:LASTEXITCODE }
exit 0
