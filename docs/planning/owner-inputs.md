# Owner inputs — every fill-in slot in the public docs

Working checklist of every `[OWNER ...]` / `[OWNER TO CONFIRM: ...]` slot an
owner decision must resolve before the public-facing docs can be published as
final. Slots are tagged with `<!-- OWNER: ... -->` comments in the source files;
each row says what to fill in and the cheapest sensible answer.

## Count correction

An earlier estimate said ~29 slots. The real count is **52 across 8 files**
(54 `OWNER`-mention hits, minus 2 lines that only describe the slot *convention*
— `docs/terms.md:5`, `docs/privacy.md:5`). `README.md`, `LICENSE`, `NOTICE.md`,
and `docs/releasing.md` carry no owner slots. Every slot below was verified
against the current file contents on 2026-11-14.

Shared decisions (counsel review, governing law, effective date) appear in both
legal drafts — answer once, apply to both, keep the two files in step.

## docs/terms.md — Terms of Use (10)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 1 | terms.md:10 | Counsel review of the terms before first customer deployment | Legal sign-off; then delete comment + marker |
| 2 | terms.md:22 | Name the commercial license / subscription agreement granting customer rights, and how to request it | Keep interim default already in the file: use governed solely by `LICENSE`; inquiries to Opraiz Technology Pvt Ltd |
| 3 | terms.md:67 | Age requirements, regional restrictions, use-case restrictions (safety-critical, surveillance) | Keep interim default (legal capacity + operator-disclosed regional limits; no stated threshold) unless counsel wants specifics |
| 4 | terms.md:83 | Links to each provider's terms/DPA (Intelligence, model providers, Parallel, Google, Notion, Composio, sign-in providers) | Collect the public ToS/DPA URLs once and paste; nothing to draft |
| 5 | terms.md:107 | Paid support/SLA — support URL + response targets, or confirm none | Confirm interim default: no SLA; support only under a separate written agreement |
| 6 | terms.md:118 | How the terms may change and how users are notified | Keep interim default (revised copy + new effective date; continued use = acceptance); pick the notice channel (email or in-app banner) |
| 7 | terms.md:124 | Suspension / termination policy | Keep interim default: violation-based suspension with prior notice where practicable |
| 8 | terms.md:126 | Governing law and dispute venue | India (registered company seat); share the decision with privacy.md:162 |
| 9 | terms.md:128 | Contact email for licensing and legal inquiries | `devops@opraiz.com` or a dedicated `legal@` alias the owner creates |
| 10 | terms.md:130 | Effective date + version history of the terms | Effective date = first customer deployment; add a small version-history table |

## docs/privacy.md — Privacy Notice (12)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 11 | privacy.md:11 | Counsel review of the privacy notice before first customer deployment | Legal sign-off; then delete comment + marker |
| 12 | privacy.md:70 | Desktop telemetry stays opt-out vs opt-in for customer builds; named endpoint/processor | Keep opt-out (current shipped behavior; endpoint from `COPILOTKIT_TELEMETRY_URL`) — matches the disclosure already in the notice |
| 13 | privacy.md:82 | Fixed retention period (days) for hosted/customer deployments | Pick one if hosting customers (e.g. 365); otherwise keep software default (forever unless operator sets `AUDIT_RETENTION_DAYS`) |
| 14 | privacy.md:106 | Backup schedule + retention for hosted/customer deployments | Adopt the suggested starting point in `docs/backup-restore.md`: daily `pg_dump`, 7 days retained, off-site encrypted copy |
| 15 | privacy.md:112 | Account-deletion timeline for hosted/customer deployments | Confirm the suggested default: actioned within 30 days of a confirmed request, including §5.5 forwarding |
| 16 | privacy.md:138 | Operator runbook + support contact for data-subject requests | Until a DSR runbook ships: `docs/backup-restore.md` + `docs/configuration.md` + `/admin/audit`; contact = row 18's privacy email |
| 17 | privacy.md:148 | Intelligence (CopilotKit) DPA / subprocessor terms for the managed default, linked | Obtain the DPA URL from CopilotKit and link it |
| 18 | privacy.md:156 | Company registered address | Opraiz Technology Pvt Ltd registered office |
| 19 | privacy.md:158 | Privacy contact email | `privacy@opraiz.com` alias (or reuse the security mailbox) |
| 20 | privacy.md:160 | Support URL + data-request procedure, published | `https://orbo.opraiz.com` support page + mailto procedure |
| 21 | privacy.md:162 | Governing law / jurisdiction | Same decision as row 8; keep in step |
| 22 | privacy.md:164 | Effective date + change history of the notice | Same as row 10 |

## SECURITY.md (6)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 23 | SECURITY.md:12 | Support window + backport policy (aligns docs/versioning.md) | Adopt the versioning.md proposal (row 30); edit both files in one commit |
| 24 | SECURITY.md:23 | Security mailbox (email vulnerability reports go to) | `security@opraiz.com`; create + monitor it |
| 25 | SECURITY.md:24 | Published `/.well-known/security.txt` URL | Host on `orbo.opraiz.com` (+ deployment domains) once live; `Contact:` = row 24 |
| 26 | SECURITY.md:33 | Acknowledgement / update / coordinated-disclosure timelines | Accept the proposal: 2 business days ack, 7-day updates, disclosure ≤ 90 days |
| 27 | SECURITY.md:53 | Scope confirmation, incl. any deployed demo/bounty-host infrastructure | Confirm repo-only scope; declare any live demo deployment in or out |
| 28 | SECURITY.md:55 | Bounty-program line | Confirm "no bounty program" stands; delete the line only if a program launches |

## docs/versioning.md (2)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 29 | versioning.md:27 | Bump guidance (major/minor/patch) | Adopt the proposal: major = upgrade needs operator action; minor = behaves differently, standard upgrade; patch = neither |
| 30 | versioning.md:73 | Support window, backport scope, who may cut releases | Adopt the proposal: latest line + one line of security/data-loss backports for six months; releases cut by the owners; align SECURITY.md (row 23) |

## docs/backup-restore.md (3)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 31 | backup-restore.md:48 | Off-site location, backup encryption, RPO, RTO | Accept the marker's defaults: RPO ≤ 24 h (daily dump), RTO ≤ 4 h, dumps copied off-site encrypted; owner picks the actual location |
| 32 | backup-restore.md:92 | Who may run a restore + expected recovery time | Deployment administrator; RTO ≤ 4 h; drill quarterly |
| 33 | backup-restore.md:102 | Whether agent workspaces are backed up in this deployment | Decide explicitly; suggested: not backed up (working files, not product state) unless a customer requirement says otherwise |

## CONTRIBUTING.md (2)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 34 | CONTRIBUTING.md:7 | Contribution agreement / licensing contact for external contributors | Same contact as row 9, or whatever CLA process the owner chooses |
| 35 | CONTRIBUTING.md:95 | Where issues are filed + where to ask questions before writing code | Private tracker or email (owner's call); if public issues are opened for this purpose, say so here |

## docs/desktop-updater.md — re-add scaffold (8)

Rows 38–43 are the concrete inputs rows 36–37 feed into; nothing in `desktop/`
may change until both exist.

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 36 | desktop-updater.md:9 | Release domain serving the app + update manifests | `updates.opraiz.com` (HTTPS required), or let the ORBO server serve the manifests once a domain is live |
| 37 | desktop-updater.md:11 | Where the minisign private key lives (secret manager / vault path) | Org password manager or KMS; record the exact path |
| 38 | desktop-updater.md:27 | `pubkey` — contents of `ORBO.key.pub`, verbatim | Run the §2 signer generate, paste the public key (it ships in the repo) |
| 39 | desktop-updater.md:29 | `endpoints` URL built on the release domain | Follows row 36 |
| 40 | desktop-updater.md:67 | Private-key storage location (flow §2) | Same as row 37 |
| 41 | desktop-updater.md:78 | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (CI secret, never committed) | Generate; store beside row 37 |
| 42 | desktop-updater.md:110 | Checklist gate: release domain chosen, HTTPS, DNS live | Action gate, not a value |
| 43 | desktop-updater.md:112 | Checklist gate: private key + password in the vault path | Action gate, not a value |

## docs/mobile-release.md — EAS accounts (9)

| # | File:line | Owner must supply | Suggested answer / interim default |
|---|---|---|---|
| 44 | mobile-release.md:19 | Expo account email + org name (free tier is enough to start) | Owner creates at expo.dev |
| 45 | mobile-release.md:21 | Apple Developer Program team ID + Apple ID | Owner enrols |
| 46 | mobile-release.md:24 | Google Play developer account + Play service-account JSON key | Owner creates; key file stays out of the repo |
| 47 | mobile-release.md:28 | Google Cloud project for FCM | Owner creates in the Play account's cloud project |
| 48 | mobile-release.md:30 | Store listing copy + privacy-policy URL for both stores | Links to rows 16/20; listing copy is owner-written |
| 49 | mobile-release.md:42 | `eas login` with the Expo account | Execution of row 44 |
| 50 | mobile-release.md:47 | `owner` org name in `app.config.ts` (org name, or leave personal) | Follows row 44 |
| 51 | mobile-release.md:69 | iOS submit slots: appleId / ascAppId / appleTeamId | Follows row 45 |
| 52 | mobile-release.md:76 | Keystore backup storage decision | Accept EAS-managed credentials; store the offered keystore backup in the same vault as row 37 |

## How to close a slot

Each source slot is a pair: an `<!-- OWNER: ... -->` comment saying what to
fill in, and a visible `[OWNER TO CONFIRM: ...]` marker at the spot. Closing a
slot means replacing the marked text with the real answer and deleting the
comment. Do not publish any of these files as final while its marker remains.
