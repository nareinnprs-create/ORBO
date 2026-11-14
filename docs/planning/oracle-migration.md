# Oracle migration runbook — orbo-live off RunPod onto OCI Always-Free

Runbook only — nothing here has been executed. It mirrors the working
one-container procedure recorded in `deploy/runpod-deploy.md` (untracked,
kept out of the repo) onto an Oracle Cloud Always-Free ARM instance, so the
same deployment runs at $0/month instead of $175/month. No tunnel, DNS, or
account identifiers are included here on purpose.

## Why

| Option | Spec | Cost |
|---|---|---|
| RunPod (current) | 8 vCPU / 16 GB, `orbo-live` | $0.24/hr ≈ **$175/mo** running 24/7 ($0 while EXITED) |
| RunPod downsized | 4 vCPU / 8 GB | ≈ $0.12/hr ≈ **$88/mo** |
| Oracle A1.Flex (target) | 4 OCPU Ampere / 24 GB, Ubuntu 24.04 | **$0** (Always-Free) |

Always-Free A1 quota is 4 OCPU / 24 GB RAM per tenancy — exactly the target
shape. Other relevant free limits: 200 GB total block storage, 10 TB/month
egress. All comfortably above what one ORBO server needs.

## The one real risk: ARM

The RunPod build ran on x86. A1.Flex is **ARM (aarch64) only**. The repo builds
Bun-based images and Bun supports arm64, and the Playwright/Chromium headless
shell the computer-use stack installs has arm64 Linux builds — but this repo's
Docker image has **never been built on arm64**. Before any cutover, do the
build step (§5) on the Oracle box and confirm the image boots and `/health`
answers. If arm64 fails somewhere, the fallback is not another Oracle shape
(A1 is ARM-only; the free micro VM is far too small) — it is staying on RunPod.

## Target instance

- Shape: `VM.Standard.A1.Flex`, 4 OCPU, 24 GB RAM.
- Image: Ubuntu 24.04 (canonical image).
- Boot volume: **50 GB** (the clone + build artifacts + image are large; the
  RunPod containerDisk was 30 GB and stayed tight). Keeps total block storage
  well inside the 200 GB free quota.
- Subnet: default VCN security list is fine. **Ingress: TCP 22 from the admin
  IP only. Egress: all.** That is the whole rule set — the app binds to
  127.0.0.1 only and reaches Cloudflare through the outbound tunnel, so no
  public app port ever exists.

## OS firewall — do not touch it

Oracle's Ubuntu images ship host iptables rules (netfilter-persistent) that
REJECT everything except 22 and ICMP. That is correct for this shape:
loopback-only app port, tunnel is outbound. Do not delete or loosen the
default rules; just make sure SSH stays allowed.

## Steps

1. **Launch the instance** with the spec above; note its public IP; SSH in
   (`ssh ubuntu@<ip>`).
2. **Install packages:**
   ```sh
   sudo apt update && sudo apt -y install docker.io git
   sudo usermod -aG docker ubuntu   # re-login
   ```
   Install `cloudflared` from Cloudflare's arm64 `.deb` repository
   (https://pkg.cloudflare.com/cloudflared — pick the jammy/ noble arm64 pool).
3. **Clone and check out:**
   ```sh
   sudo mkdir /opt/ORBO && sudo chown ubuntu /opt/ORBO
   git clone <repo> /opt/ORBO && cd /opt/ORBO
   git checkout <green sha>          # wave-1-2 now, main after a release
   ```
4. **Env file** `/opt/ORBO/.env.live` (chmod 600, values generated on the box,
   never committed). Same NAME list as the RunPod procedure:
   - `EMBEDDED_POSTGRES=on`, `ORBO_SERVER_HOST=0.0.0.0`, `PORT=3001`,
     `SERVER_PORT=3001`
   - `KEY_ENCRYPTION_KEY` = fresh `openssl rand -base64 32`
   - `BETTER_AUTH_SECRET` = fresh random ≥ 32 chars
   - `BETTER_AUTH_URL=https://orbo.opraiz.com`
   - `TRUSTED_ORIGINS=https://orbo.opraiz.com,https://www.orbo.opraiz.com`
   - `INITIAL_ADMIN_EMAILS` = the owner admin address
   - `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` = placeholder pair (production refuses
     to boot with no provider and refuses `ORBO_SINGLE_USER`; real sign-in
     needs the owner's OAuth client — expected, and gated by Cloudflare Access)
   - `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL`,
     `INTELLIGENCE_API_KEY` = same values as any deployment
   - `SUPERVISOR_TOKEN`, `ORBO_COMPUTER_TOKEN`, `WORKER_SHARED_SECRET`,
     `ORBO_AGENT_TOOL_TOKEN`, `ORBO_MANAGED_AGENT_TOKEN` = fresh randoms ≥ 29 chars
   - Do **not** set `DATABASE_URL` (the image's s6 postgres-init injects it),
     `ORBO_SINGLE_USER`, or `ORBO_AGENT_COMPUTER_ALLOW_PRIVATE_HOSTS`.
5. **Build:**
   ```sh
   nohup docker build -t orbo:live . > /opt/ORBO/build.log 2>&1 &
   tail -f /opt/ORBO/build.log       # 25–40 min; this is the arm64 gate (§ risk)
   ```
6. **Run** (note `--restart unless-stopped`, added so the container survives
   instance reboots — the RunPod procedure omitted it because pods don't
   reboot):
   ```sh
   docker run -d --name orbo --restart unless-stopped \
     --env-file /opt/ORBO/.env.live \
     -p 127.0.0.1:3001:3001 \
     -v orbo-data:/var/lib/postgresql \
     orbo:live
   curl -s http://127.0.0.1:3001/health   # → {"status":"ok"}
   ```
   Volume is the **parent** dir `/var/lib/postgresql`, not
   `/var/lib/postgresql/data` — the repo's deployment docs forbid mounting the
   data dir directly (initdb refuses ext4 volumes that carry lost+found).
7. **Tunnel:** reuse the existing remote-managed tunnel unchanged. Fetch its
   token from the Cloudflare dashboard (or API) and install the service:
   ```sh
   sudo cloudflared service install <tunnel-token>
   ```
   Ingress already points both hostnames at `http://localhost:3001`; DNS
   already CNAMEs to the tunnel. **No Cloudflare change is needed** — the
   tunnel only needs a connector, which the service above provides.
8. **Verify from outside:** `https://orbo.opraiz.com` answers (the www hostname
   still needs the zone cert fix before it resolves TLS — unchanged from the
   RunPod state).

## Cutover order

Build, boot, and verify everything on Oracle **before** deleting the RunPod
pod — the tunnel serves whichever connector is alive, and a stale connector
simply means no traffic until the new one registers. Then delete the pod and
the per-hour bill stops. Keep the existing teardown notes in
`deploy/runpod-deploy.md` for that step.

## RunPod vs Oracle operational differences

| Concern | RunPod pod | Oracle instance |
|---|---|---|
| Reboots | Container disk is ephemeral on recreate | Boot volume persists; `--restart unless-stopped` + cloudflared service cover it |
| Capacity | "not enough free vcpu" scheduling failures | A1 "out of capacity" in busy home regions — retry the launch; upgrading the tenancy to Pay-As-You-Go removes the constraint and A1 stays free within quota |
| Idle reclaim | Exits stop billing | Oracle may reclaim **idle** Always-Free instances (low CPU/network over days) — run a light keepalive or convert the tenancy to PAYG |
| Firewall | Cloud-level | Both cloud SG (22 only) and host iptables (leave defaults) |
| Public port | 3001 mapped http | None — tunnel only |

## Cost summary

| | Monthly |
|---|---|
| RunPod 8 vCPU running 24/7 | ≈ $175 |
| RunPod 4 vCPU running 24/7 | ≈ $88 |
| Oracle A1.Flex 4 OCPU / 24 GB | $0 (PAYG upgrade optional, still $0 for A1 within quota) |
| Cloudflare (tunnel, DNS, Bot Fight Mode) | unchanged, Free plan |

Only optional spend either way: Advanced Certificate Manager (~$10/mo) if the
owner wants `www.orbo.opraiz.com` TLS on a Free-plan zone.
