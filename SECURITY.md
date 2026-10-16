# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1.0 | No        |

The project is pre-1.0 and only the current release line receives fixes. Whether fixes are
backported to earlier tags, and how long a line stays supported after its successor ships, are
[OWNER TODO].

## Reporting a vulnerability

[OWNER TODO: security contact — where reports go (e.g. an email address or private channel),
what acknowledgement and remediation timelines to expect, and whether coordinated disclosure
is wanted.]

Do not open a public issue for a suspected vulnerability. Include:

- What you found and where (file, route, or commit if you have it).
- Steps to reproduce, and what you think the impact is.
- Your contact details, so the fix can be confirmed with you.

Please do not include live credentials, customer data, or transcripts in a report; redact
secrets the same way the product redacts them from recorded commands. Do not probe other
people's deployments, access data that is not yours, or disrupt a running service to prove a
point.

## Scope

This policy covers the code in this repository: the app, the API server, the worker, the
agent harnesses and computers, the supervisor, the desktop and mobile clients, the Helm
chart, and the container images the release workflows publish. Third-party services ORBO
talks to (identity providers, model vendors, Composio, CopilotKit Intelligence) belong to
their own vendors — report issues in them to the vendor, and report issues in ORBO's use of
them here. [OWNER TODO: confirm scope and any deployed demo/bounty-host infrastructure that
counts as in scope.]

There is no bounty program. [OWNER TODO: remove this line if the owner establishes one.]

## Posture notes for reporters

What "secure" means for this deployment, so reports can be judged against it:

- **Authentication is required.** A deployment with no identity provider (Google, Microsoft,
  or Okta) refuses to start unless `ORBO_SINGLE_USER=true` says it meant an open deployment,
  and that flag is refused on a public address. A report that an unconfigured deployment is
  open is the guardrail working, not a bypass — unless the guardrail itself can be evaded.
- **Secrets stay server-side.** Session signing, OAuth clients, provider keys, and the
  `KEY_ENCRYPTION_KEY` vault key live in the deployment's environment. The example encryption
  key in `.env.example` is public and refused in production; a deployment running on it is
  misconfigured, not vulnerable in this code.
- **The vault is encrypted at rest by that key.** Stolen database rows without the key do not
  expose credentials; a stolen key with the rows does. Treat key handling accordingly.
- **Network surface is loopback by default.** Compose publishes database, computer,
  supervisor, and Bot ports on loopback only; tokens (`ORBO_COMPUTER_TOKEN`,
  `SUPERVISOR_TOKEN`, `ORBO_MANAGED_AGENT_TOKEN`, `ORBO_AGENT_TOOL_TOKEN`,
  `WORKER_SHARED_SECRET`) are request controls, not network boundaries. Per-Bot egress
  proxies are attribution, not a boundary.
- **The audit trail is append-only.** Nothing but retention (`AUDIT_RETENTION_DAYS`) removes
  rows. Gaps in the trail are a finding; the retention setting emptying old rows is not.
- **Bot isolation is per-computer.** Each Bot's files and browser profile belong to its own
  container; the supervisor alone holds the Docker socket. The one-container image shares one
  browser across Bots by design (see [deployment.md](docs/deployment.md)), which is a
  documented deployment shape, not an isolation failure within it.
