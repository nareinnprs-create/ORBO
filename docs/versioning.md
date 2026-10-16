# Versioning and changelog policy

## Source of truth

The root `package.json` `version` field (currently `0.1.0`) is the release version source.
Everything else tracks it, and CI rejects drift:

- The desktop Cargo manifest and lockfile must carry the same version. After a manual root
  version change, run `bun desktop/scripts/desktop-version.ts sync`; CI runs the same script
  with `check`. Tauri itself reads its version directly from the root `package.json`.
- The Helm chart's `appVersion` must match `package.json`. The release workflow moves them
  together; CI fails the tree if they come apart.

Internal (non-release) desktop artifacts use `X.Y.Z-internal.g<commit>` so testers can identify
the source revision, with the full commit and release version recorded in `build-version.json`.
See [releasing.md](releasing.md#desktop-build-versions) for the local build commands.

## Semver

Versions are `major.minor.patch`. The person cutting the release chooses `patch`, `minor`, or
`major` when running the **Create release PR** workflow. The repo states no further rule for
which bump a given change deserves — [OWNER TODO: bump guidance, e.g. what counts as breaking
for an ORBO deployment].

## Changelog policy

`CHANGELOG.md` is written for the person running ORBO and deciding whether to upgrade, not for
the person who wrote the commit. The convention, from the file's own header:

- Newest release first; `## Unreleased` at the top is what is on `main` and not yet tagged.
- A line belongs here when a deployment behaves differently afterwards, and does not when only
  the code moved.
- Upgrades that need operator action say so up front under a **Before upgrading** heading
  (migrations with rollback caveats, short windows of cross-version behavior).
- Nothing is generated from commit subjects.

The pull request template enforces this per change: every PR adds a line under `Unreleased`,
or says in one sentence why a deployment behaves no differently afterwards.

## How a release is tagged

Two workflows, one deliberate human act (see [releasing.md](releasing.md) for the full story):

1. **Propose.** Run **Create release PR** (`.github/workflows/release.yml`) from the Actions
   tab with `patch`, `minor`, or `major` (`dry_run` shows the version and notes without opening
   anything). It updates `package.json`, promotes the changelog's `## Unreleased` heading to
   `## X.Y.Z`, moves the chart's `appVersion` and the desktop Cargo package/lockfile to the
   same version, and opens a pull request from `release/publish/vX.Y.Z` carrying the `release`
   label.
2. **Review and merge.** Merging that PR is the publish. `publish-release.yml` runs on every
   push to `main` but only acts when the commit is that PR's merge (same-repo branch with the
   `release` label). It verifies the tree's version against the branch and the changelog
   section, builds and pushes images (tagged with the version, the commit, and `latest`, plus
   OIDC build provenance attestations), then creates the tag `vX.Y.Z` and a GitHub Release
   whose notes are the changelog section, with `container-images.json` attached.

Deploy those digests, not the moving tags; a tag can be repointed and a digest cannot. The
smoke journey in `tests/smoke` cannot run in CI and is a manual pre-merge step on the release
PR (real Intelligence credentials plus a signed-in session cookie) — see
[releasing.md](releasing.md#the-one-thing-ci-cannot-do).

Support window, backport policy, and who may cut a release are [OWNER TODO].
