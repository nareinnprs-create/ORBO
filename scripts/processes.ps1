# Find and stop this stack's own processes, for scripts/start.ps1 and scripts/stop.ps1.
#
# Dot-sourced by both, the way scripts/processes.sh is sourced by scripts/start.sh and
# scripts/stop.sh. Not executable and not a script anybody runs.
#
# Both scripts ask the same two questions processes.sh asks, of Windows directly, which is the
# whole difference from that file: Git Bash has no lsof/pgrep/pkill and its ps cannot see a native
# process's arguments, so processes.sh falls back to powershell.exe for every answer on Windows.
# Here the questions go to the platform in its own language:
#
#   What is listening on a TCP port   Get-NetTCPConnection (the same source processes.sh used
#                                     through powershell.exe)
#   Is one of our processes running   Get-CimInstance Win32_Process, whose CommandLine is the same
#                                     signal pgrep -f matched by pattern
#
# There is no SIGTERM for a console process on Windows. Stop-Process -Force is TerminateProcess,
# the SIGKILL equivalent, and that is what every stop below is - exactly what processes.sh's
# kill_pids already does through powershell.exe when Git Bash has no `kill` for a Windows pid.
# The TERM-then-KILL escalation in stop.sh has no counterpart here; what is kept is the wait, so
# a port is not checked a moment after the process that held it was told to go.
#
# Every function here is pure: no output, no colour, no exit. The scripts that dot-source this
# file decide what a failure means.

# What is listening on a TCP port, as "name (address:port)", or the empty string when the port is
# free. The shape processes.sh's `holder` produces, so both stacks report the same thing.
function Get-OrboPortHolder {
  param([int]$Port)
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $connection) { return '' }
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  $name = 'unknown'
  if ($null -ne $process) { $name = $process.ProcessName }
  return ('{0} ({1}:{2})' -f $name, $connection.LocalAddress, $connection.LocalPort)
}

# The ids of whatever is listening on a TCP port. One address family's listener is enough to know
# the port is taken, but both families may hold it under the same id or two, so every id comes back
# and the caller stops all of them.
function Get-OrboPortPids {
  param([int]$Port)
  return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
}

# A pid -> name/parent map of every process on the system, for the tree walk below. One CIM call:
# Expand-OrboProcessTree consults it repeatedly and a query per lookup would be a query per process.
function Get-OrboProcessMap {
  $map = @{}
  foreach ($process in (Get-CimInstance Win32_Process)) {
    if ($null -eq $process.ProcessId) { continue }
    $map[[int]$process.ProcessId] = [pscustomobject]@{
      Parent = [int]$process.ParentProcessId
      Name   = [string]$process.Name
    }
  }
  return $map
}

# The ids of processes whose command line is the pattern, such as `bun worker/src/index.ts`.
#
# The same rule processes.sh takes to Windows: the first word of the pattern is matched against the
# process name (Windows records the executable as a path, C:\...\bun.exe) and the rest against the
# command line, which must contain it preceded by a space so `src/index.ts` never matches
# `src/index-two.ts`.
function Get-OrboMatchingPids {
  param([string]$Pattern)
  $split = $Pattern.IndexOf(' ')
  if ($split -lt 0) {
    $executable = $Pattern
    $rest = ''
  } else {
    $executable = $Pattern.Substring(0, $split)
    $rest = $Pattern.Substring($split + 1)
  }
  $wanted = $executable + '.exe'
  $ids = @()
  foreach ($process in (Get-CimInstance Win32_Process)) {
    if ($process.Name -ne $wanted) { continue }
    if (-not $process.CommandLine) { continue }
    if ($rest -eq '') {
      $ids += [int]$process.ProcessId
      continue
    }
    if ($process.CommandLine.Contains(' ' + $rest)) { $ids += [int]$process.ProcessId }
  }
  return $ids
}

# `pgrep -f <pattern>`: true when such a process is running.
function Test-OrboRunning {
  param([string]$Pattern)
  return (@(Get-OrboMatchingPids -Pattern $Pattern).Count -gt 0)
}

# The given ids plus every descendant of each, found through the parent links in one process map.
#
# A killed parent orphans its children on Windows instead of taking them with it, and the app's
# `bun run dev` is a wrapper around the Vite process that actually holds the port - stopping only
# the wrapper leaves the child answering. So anything stopped through this file is stopped as a
# tree.
#
# -IncludeAncestors additionally walks up from each id through bun.exe and node.exe parents only.
# The wrapper that launched a process is worth taking with it; the user's own terminal is not, so
# the walk stops at the first ancestor that is not Bun or Node and never reaches cmd.exe,
# powershell.exe or anything else a person owns.
function Expand-OrboProcessTree {
  param(
    [int[]]$RootIds,
    [hashtable]$Map,
    [switch]$IncludeAncestors
  )
  $children = @{}
  foreach ($entry in $Map.GetEnumerator()) {
    $parent = $entry.Value.Parent
    if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }
    $children[$parent] += $entry.Key
  }
  $selected = New-Object 'System.Collections.Generic.HashSet[int]'
  $queue = New-Object System.Collections.Queue
  foreach ($id in @($RootIds)) {
    if ($selected.Add([int]$id)) { $queue.Enqueue([int]$id) }
  }
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $children.ContainsKey($current)) { continue }
    foreach ($child in $children[$current]) {
      if ($selected.Add([int]$child)) { $queue.Enqueue([int]$child) }
    }
  }
  if ($IncludeAncestors) {
    foreach ($root in @($RootIds)) {
      $cursor = [int]$root
      # Bounded because a cycle in the parent links (which Windows permits after a pid is reused)
      # would otherwise walk forever.
      for ($step = 0; $step -lt 16; $step++) {
        if (-not $Map.ContainsKey($cursor)) { break }
        $parent = [int]$Map[$cursor].Parent
        if ($parent -le 0 -or -not $Map.ContainsKey($parent)) { break }
        $parentName = [string]$Map[$parent].Name
        if ($parentName -ne 'bun.exe' -and $parentName -ne 'node.exe') { break }
        if (-not $selected.Add($parent)) { break }
        $cursor = $parent
      }
    }
  }
  return @($selected)
}

# Stop these ids and wait for them to be gone, up to five seconds, the way processes.sh's kill_pids
# does: a stopped process takes a moment to release its port, and the next check must not see it.
function Stop-OrboPids {
  param([int[]]$Ids)
  $list = @($Ids)
  if ($list.Count -eq 0) { return }
  Stop-Process -Id $list -Force -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(5)
  do {
    Start-Sleep -Milliseconds 250
    $alive = @($list | Where-Object { $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue) })
  } while ($alive.Count -gt 0 -and (Get-Date) -lt $deadline)
}

# `pkill -f <pattern>`, and the tree under each match: the same matches stop_matching would find,
# then Expand-OrboProcessTree so nothing a match started is left holding a port or a database
# connection.
function Stop-OrboMatching {
  param([string]$Pattern)
  $ids = @(Get-OrboMatchingPids -Pattern $Pattern)
  if ($ids.Count -eq 0) { return }
  $map = Get-OrboProcessMap
  Stop-OrboPids -Ids (Expand-OrboProcessTree -RootIds $ids -Map $map)
}
