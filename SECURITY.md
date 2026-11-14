# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1.0 | No        |

The project is pre-1.0 and only the current release line receives fixes. <!-- OWNER: Decide how long a release line stays supported and what gets backported (the proposal in docs/versioning.md); delete this comment and the confirm marker once decided, and keep the two files in step. -->
Whether fixes are backported to earlier tags, and how long a line stays supported after its
successor ships, are [OWNER TO CONFIRM: support window and backport policy — the proposal in docs/versioning.md].

## Reporting a vulnerability

Reports go to the security contact by email — do not open a public issue for a suspected
vulnerability. The intended machine-readable disclosure channel is a `security.txt` file
following RFC 9116, published at `/.well-known/security.txt` on the project's domain and on
operated deployment domains, with `Contact:` pointing at the same mailbox, so a reporter never
has to find this file first.

<!-- OWNER: Create the security mailbox and publish /.well-known/security.txt pointing at it (Contact, plus Expires, Preferred-Languages, and this policy's URL); replace the two slots below with the real address and dates, then delete this comment. -->
- Security contact: [OWNER TO CONFIRM: security email — the mailbox vulnerability reports go to].
- `security.txt`: [OWNER TO CONFIRM: the published /.well-known/security.txt URL, once live].

Expected timelines (proposal; the owner may adjust them):

- **Acknowledgement within 2 business days** of a report arriving at the contact above.
- **A status update at least every 7 days** while a fix is being prepared.
- **Coordinated disclosure**: a public advisory only after a fix ships, or after 90 days,
  whichever the reporter agrees to first.
<!-- OWNER: Confirm the acknowledgement, update, and disclosure timelines above, or replace them; delete this comment and the confirm marker once decided. -->
[OWNER TO CONFIRM: the acknowledgement, update, and coordinated-disclosure timelines above].

A report should include:

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
them here. <!-- OWNER: Confirm the scope above and whether any deployed demo/bounty-host infrastructure counts as in scope; delete this comment and the confirm marker once confirmed. --> [OWNER TO CONFIRM: scope confirmation, including any deployed demo/bounty-host infrastructure that counts as in scope.]

There is no bounty program. <!-- OWNER: Delete this sentence and the confirm marker if a bounty program is established, and say where it lives. --> [OWNER TO CONFIRM: delete this line if a bounty program is established.]

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
