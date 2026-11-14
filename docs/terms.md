# Terms of Use (draft)

> Status: draft for owner review. Every owner-specific fact is a fill-in
> slot: an `<!-- OWNER: ... -->` comment says what to fill in, and a visible
> `[OWNER TO CONFIRM: ...]` marker marks the spot. Do not publish until each
> placeholder is resolved.
>
> This is not legal advice.
> <!-- OWNER: Have counsel review these terms before the first customer deployment; delete this comment and the confirm marker on sign-off. -->
> `[OWNER TO CONFIRM: reviewed by counsel before first customer deployment]`.

## 1. License

ORBO is proprietary software. Use is governed by the proprietary license
in `LICENSE` (© 2026 Opraiz Technology Pvt Ltd): no use, copying,
modification, distribution, or sublicensing except with prior written
permission or under a separate written agreement. Third-party components
shipped with or required by ORBO remain under their own licenses; see
`NOTICE.md`.

<!-- OWNER: Name the commercial license / subscription agreement that grants the customer their rights, and how to request it; delete this comment and the confirm marker once named. -->
`[OWNER TO CONFIRM: name the commercial license / subscription agreement that grants the customer their rights, and how to request it]`.
Interim default — confirm with counsel: unless and until such an
agreement names different terms, use is governed solely by the
proprietary license in `LICENSE` (© 2026 Opraiz Technology Pvt Ltd; no
use, copying, modification, distribution, or sublicensing except with
prior written permission or under a separate written agreement), and
licensing inquiries are directed to Opraiz Technology Pvt Ltd as stated
in `LICENSE`.

## 2. What you are responsible for

- You must have the rights to connect any account, mailbox, drive,
  workspace, or other system you link (Google, Notion, any Composio app),
  and to let Bots read or act in it under the grants you approve.
- You are responsible for the prompts you submit, the tools you grant to
  Bots, and the approvals you confirm — including mail/calendar drafts,
  file changes, and actions taken through brokered apps.
- You will not use ORBO to break the law, infringe rights, access systems
  without authorization, or abuse third-party services (model providers,
  Intelligence, Parallel, Google, Notion, Composio) in violation of their
  terms.

## 3. Acceptable use

You must not:

1. Attempt to bypass authorization, approvals, audit logging, or policy
   enforcement, or to use another person's connected accounts.
2. Exfiltrate or misuse credentials, tokens, or personal data through
   Bots, custom MCP servers, generative-UI components, or computer
   actions.
3. Run ORBO against systems you do not own or administer without
   permission (including pointing Bots or computers at private/internal
   addresses to probe networks you do not control).
4. Remove or alter license notices, third-party notices (`NOTICE.md`),
   or audit/attribution metadata.
5. Resell, sublicense, or publicly host ORBO except as your agreement
   with Opraiz Technology Pvt Ltd permits.

Interim default — confirm with counsel: you must have the legal capacity
to enter a binding agreement and comply with the laws that apply to you;
operators disclose any additional age or regional limits for their own
deployments. No specific age threshold, regional restriction, or
safety-critical/surveillance use-case ban is stated here.
<!-- OWNER: Add the age requirements, regional restrictions, and use-case restrictions (e.g. safety-critical, surveillance) the owner decides on; delete this comment and the confirm marker once added. -->
`[OWNER TO CONFIRM: age requirements, regional restrictions, and any use-case restrictions (e.g. safety-critical, surveillance)]`.

## 4. Third-party services

ORBO depends on third-party services that process your data under their
own terms when used: CopilotKit Intelligence (durable threads/memory —
mandatory), your configured model provider, Parallel Search, Google and
Notion connectors, Composio-brokered apps, and sign-in identity providers.
What is sent where is disclosed in `docs/privacy.md` §2. Availability,
pricing, and subprocessing terms of those services are theirs, not ours.
This notice names the providers (CopilotKit Intelligence, the configured
model provider, Parallel Search, Google and Notion connectors,
Composio-brokered apps, sign-in identity providers) but states no
third-party URLs here.

<!-- OWNER: Link each provider's terms/DPA the deployment relies on (Intelligence, the model providers, Parallel, Google, Notion, Composio, sign-in providers); delete this comment and the confirm marker once linked. -->
`[OWNER TO CONFIRM: links to each provider's terms/DPA the deployment relies on]`.

## 5. Administrator responsibilities

If you operate a deployment, you accept the operator duties in
`docs/privacy.md` §5 (keys and sign-in, retention and backups, connector
review, data-subject requests), plus:

- Granting Bots only the tools and computers they need, and reviewing
  the audit trail (`/admin/audit`).
- Keeping the server, database, and connected harnesses patched and
  backed up.
- Ensuring your own privacy notice and agreements cover what your
  deployment processes.

## 6. No warranty; limitation of liability

As stated in `LICENSE`, the software is provided "AS IS", without warranty
of any kind, express or implied, including merchantability, fitness for a
particular purpose, and non-infringement; the authors and copyright holders
are not liable for claims, damages, or other liability arising from or in
connection with the software or its use.

<!-- OWNER: State any paid support/SLA separately, with the support URL and response targets, or confirm the interim default below stands; delete this comment and the confirm marker once decided. The license warranty disclaimer above does not create one. -->
`[OWNER TO CONFIRM: paid support/SLA — support URL and response targets, or confirmation that none is offered outside a separate written agreement]`.
Interim default — confirm with counsel: these terms include no paid
support and no SLA or response-time guarantee; any support or SLA is
only as stated in a separate written agreement.

## 7. Changes, suspension, governing terms

- Changes (interim default — confirm with counsel): the owner may update
  these terms by publishing a revised copy with a new effective date;
  continued use after the effective date constitutes acceptance.
  <!-- OWNER: Confirm how these terms may change and how users are notified; delete this comment and the confirm marker once decided. -->
  `[OWNER TO CONFIRM: how these terms may change and how users are notified]`.
- Suspension/termination (interim default — confirm with counsel): the
  operator may suspend or terminate access for violations of these terms
  (including §3) or for unlawful or abusive use of third-party services,
  with prior notice where practicable.
  <!-- OWNER: Confirm the suspension/termination policy; delete this comment and the confirm marker once decided. -->
  `[OWNER TO CONFIRM: suspension/termination policy]`.
- <!-- OWNER: State the governing law and dispute venue; delete this comment and the confirm marker once stated. -->
  `[OWNER TO CONFIRM: governing law and dispute venue]`.
- <!-- OWNER: Name the contact email for licensing and legal inquiries; delete this comment and the confirm marker once named. -->
  `[OWNER TO CONFIRM: contact email for licensing and legal inquiries]`.
- <!-- OWNER: State the effective date and keep a version history of these terms; delete this comment and the confirm marker once stated. -->
  `[OWNER TO CONFIRM: effective date and version history]`.
