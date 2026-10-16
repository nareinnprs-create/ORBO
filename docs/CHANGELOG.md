# Changelog

What changed, for somebody running ORBO and deciding whether to upgrade.
ORBO's changelog lives here at `docs/CHANGELOG.md`. The root `CHANGELOG.md`
is the upstream OpenBot history keep-file, not ORBO's.

Newest first. `Unreleased` is what is on `main` and not yet tagged.

## Unreleased

Initial ORBO tree toward `0.1.0` (`package.json` already carries `0.1.0`;
no `v0.1.0` tag exists yet, so there is no upgrade from a prior ORBO release).
Scope below is only what the 19 `ORBO*` commits on `main` and the tree prove.

- Mechanical rebrand of the merged tree away from the upstream project names.
- Planning and inventory slices: surface inventories, execution slices, Dots fold
  mapping, DIYA preparation and seeding, desktop inventory and wrapper plan.
- Scaffolding: `packages/ui`, `apps/app` wiring, route guard, coverage gate,
  delivery-store quarantine, signing-doc neutralization.
- Desktop and release plumbing: installer config, CI bundles, Docker slimming,
  explicit release secrets, executable s6 scripts, desktop test hygiene.
- UI batches: Carousel, Questionnaire, Avatar, BrandMark, Message, Bubble, and
  prior batches 2-4.
- Decision and execution waves: W0 decision packet, Wave 1 threads/notifications
  tables, Wave 2 approvals interop and delegation, W3 computers/connectors/work
  slices, notifications API and finance import work.

No operator upgrade action is documented in this range.

## 0.1.0

Not yet tagged. Stub held for the first release; content is tracked under
`Unreleased` above until the release workflow promotes it.
