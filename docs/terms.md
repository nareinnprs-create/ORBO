# Terms of Use (draft)

> Status: draft for owner review. Every owner-specific fact is marked
> `[OWNER TODO: ...]`. Do not publish until each placeholder is resolved.
>
> This is not legal advice.
> `[OWNER TODO: have counsel review before first customer deployment]`.

## 1. License

ORBO is proprietary software. Use is governed by the proprietary license
in `LICENSE` (© 2026 Opraiz Technology Pvt Ltd): no use, copying,
modification, distribution, or sublicensing except with prior written
permission or under a separate written agreement. Third-party components
shipped with or required by ORBO remain under their own licenses; see
`NOTICE.md`.

`[OWNER TODO: name the commercial license / subscription agreement that grants the customer their rights, and how to request it]`.

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
   with `[OWNER TODO: licensor name]` permits.

`[OWNER TODO: add age requirements, regional restrictions, and any use-case restrictions (e.g. safety-critical, surveillance)]`.

## 4. Third-party services

ORBO depends on third-party services that process your data under their
own terms when used: CopilotKit Intelligence (durable threads/memory —
mandatory), your configured model provider, Parallel Search, Google and
Notion connectors, Composio-brokered apps, and sign-in identity providers.
What is sent where is disclosed in `docs/privacy.md` §2. Availability,
pricing, and subprocessing terms of those services are theirs, not ours.

`[OWNER TODO: link each provider's terms/DPA the deployment relies on]`.

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

`[OWNER TODO: state any paid support/SLA separately — the license warranty disclaimer above does not create one — plus support URL and response targets]`.

## 7. Changes, suspension, governing terms

- `[OWNER TODO: how these terms may change and how users are notified]`.
- `[OWNER TODO: suspension/termination policy]`.
- `[OWNER TODO: governing law and dispute venue]`.
- `[OWNER TODO: contact email for licensing and legal inquiries]`.
- `[OWNER TODO: effective date and version history]`.
