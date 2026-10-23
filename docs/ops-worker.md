# op worker operations (host and VM deployments)

## What the worker is

`worker/src/index.ts` is the routine sweep for deployments that do not run Kubernetes. In a
chart install (`deploy/charts/orbo-diya/templates/routines/cronjob.yaml`) the same sweep —
`offerDueRoutines` and `dispatchClaimedRoutines` from `server/src/routines/sweep.ts` — is driven
by a **CronJob** (`*/5 * * * *` by default, `concurrencyPolicy: Forbid`, `activeDeadlineSeconds:
240`), and a failed run pages somebody through the job's failure state. On a host or VM there is
no CronJob process around the sweep, so `worker/src/index.ts` supplies the recurrence itself: a
30-second loop running the very same phases in-process, with each phase's error caught and
logged so a transient database blip does not kill the worker.

It reads exactly three settings (`worker/src/env.ts`), all required:

- `DATABASE_URL` — Postgres, to due-offer and claim against.
- `SERVER_INTERNAL_URL` — where claimed runs are handed: `POST /internal/routines/run`.
- `WORKER_SHARED_SECRET` — the bearer credential for that handoff.

`scripts/start.sh` (and `start.ps1`) normally launch it as a background process from the
deployment root, logging to `.logs/worker.log`, after composing up the Docker services.

## Why silent death is bad

Outside a chart install, the worker background process has no restart policy watching it: no
systemd unit, no scheduled task, no HTTP endpoint of its own to health-check — it is a bare
loop. If the process dies (machine reboot, OOM kill, an unhandled one-time failure in the
process itself), nothing notices: **routines quietly stop firing**. Bots stop answering scheduled
work, no alarm goes off, and the first evidence is a person asking why a routine did not run
days ago. That gap is the reason this document and the installer scripts exist: make the
start-at-boot and restart story come from something that actually watches.

## Install: register a boot-start service

The two siblings below do the same job on their own platform. Both are idempotent — rerunning
rewrites the registration in place — and both refuse before registering if the env file is
missing any of the three settings above, because a dependency that boots and instantly dies is a
scheduled failure nobody is watching.

### Windows (scheduled task)

```powershell
pwsh scripts/worker-install.ps1                    # root = repo/deployment root, env = <root>/.env
pwsh scripts/worker-install.ps1 -Root C:\orbo -EnvFile C:\orbo\.env
```

Registers the task `ORBOWorker` with the Task Scheduler:

- trigger: **at system startup**, as `NT AUTHORITY\SYSTEM`, no signed-in session needed;
- action: `pwsh -NoProfile -Command`, which sources the env file's values, then runs the bun
  resolved at install time (its absolute path is pinned into the task) with
  `worker/src/index.ts`, working directory = root;
- output appends to `.logs/worker-service.log`;
- builtin restart support: `-RestartCount 3 -RestartInterval 1m`, and `-ExecutionTimeLimit` is
  disabled so the loop is never killed for running forever.

To start it now without rebooting: `Start-ScheduledTask -TaskName ORBOWorker`.

### Linux (systemd)

```bash
sudo bash scripts/worker-install.sh
sudo bash scripts/worker-install.sh --root /srv/orbo --env-file /srv/orbo/.env
```

Writes `/etc/systemd/system/orbo-worker.service`:

- `ExecStart=<pinned bun path> worker/src/index.ts`, `WorkingDirectory=<root>`,
  `EnvironmentFile=<env file>` (this is how `DATABASE_URL`/`SERVER_INTERNAL_URL`/
  `WORKER_SHARED_SECRET` arrive — they live in the env file, not in the unit);
- `Restart=on-failure`, `RestartSec=5` — for the boot case where Postgres is not up yet, and
  for anything that takes the loop down despite its internal try/catch;
- stdout and stderr both append to `.logs/worker-service.log`;
- enabled under `multi-user.target`, so it starts with the machine.

Installs need root (`sudo`). Both scripts pin bun's absolute path at install time rather than
resolving it at launch, so a later PATH change cannot reshape what boots.

## Verify (last-run status)

Windows:

```powershell
pwsh scripts/worker-install.ps1 -Status
```

Reports task state, `LastRunTime`, and `LastTaskResult`; a nonzero result means the launch
failed, and the worker's own output is in `.logs/worker-service.log`.

Linux:

```bash
bash scripts/worker-install.sh --status
```

Runs `systemctl status orbo-worker.service`; recent output via `systemctl status`/`journalctl
-u orbo-worker.service`, and the same `.logs/worker-service.log` tail.

Either way, the strongest quick signal is the log itself: the worker emits one JSON line per
tick (`routine-sweep`), so a silent log means a silent worker.

## Uninstall

```powershell
pwsh scripts/worker-install.ps1 -Remove      # unregisters the scheduled task
```

```bash
sudo bash scripts/worker-install.sh --remove # disables, stops, deletes the unit
```

Both leave the currently running worker process intact (stop the `bun worker/src/index.ts`
process by hand, or reboot), and both are safe to run when nothing is registered.

## Kubernetes does not need this

In a chart install the worker-as-a-service exists as a **CronJob**, already — see
`deploy/charts/orbo-diya/templates/routines/cronjob.yaml` (gated on `routines.enabled` from
`values.yaml`; schedule overridable with `routines.schedule`, default `*/5 * * * *`). A CronJob
replaces the loop with repetition *outside* the process — a failed run is marked failed and
pages somebody, which is easier to see than a background process quietly gone. The boot-start
services above are only for the host/VM deployments that have no Kubernetes watcher.
