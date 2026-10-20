//! Choose a release for a new deployment and retain an existing deployment's exact version.

use std::path::Path;

use serde::Deserialize;

use crate::deployment;

const LATEST_RELEASE: &str = "https://api.github.com/repos/nareinnprs-create/ORBO/releases/latest";

/// The first release whose fetched deployment is internally consistent.
///
/// Releases published before it declare workspaces in the root `package.json` and `bun.lock` —
/// `apps/app`, `packages/ui` — that a fetched deployment never contains, so `bun install` in that
/// tree fails every time and an install pinned to one of those releases can never repair itself.
/// v0.1.5 is where the workspace fix lands, which makes it the oldest pin worth keeping: at or
/// above it the tree installs its own workspaces and the pin is retained exactly as before, and
/// below it the pin is offered the latest release once, because the fetch that follows rewrites
/// the stamp and the same offer is never made twice.
const FIRST_COMPLETE_DEPLOYMENT: &str = "v0.1.5";

/// Only a fresh deployment, or a pin older than `FIRST_COMPLETE_DEPLOYMENT`, consults GitHub.
/// The fetcher records the exact tag after the source and image manifest have both downloaded
/// successfully; restarts and repairs retain that pin, and a failed lookup keeps it too, so an
/// offline machine starts from what it already has.
/// Uses blocking HTTP, so callers in an async runtime must use a blocking task.
pub fn resolve_version(root: &Path) -> Result<String, String> {
    resolve_version_with(root, || {
        let body = deployment::get(LATEST_RELEASE).map_err(|error| {
            if error.contains("404") {
                format!(
                    "could not find the latest ORBO release: {error}. \
                     The repository is private; set ORBO_RELEASES_TOKEN to a fine-grained \
                     personal access token with Contents: Read on nareinnprs-create/ORBO."
                )
            } else {
                format!("could not find the latest ORBO release: {error}")
            }
        })?;
        release_tag(&body)
    })
}

fn resolve_version_with(
    root: &Path,
    latest: impl FnOnce() -> Result<String, String>,
) -> Result<String, String> {
    let Some(installed) = deployment::installed(root) else {
        return latest();
    };
    let first_complete = version_tuple(FIRST_COMPLETE_DEPLOYMENT)
        .expect("FIRST_COMPLETE_DEPLOYMENT is written in this file as a vX.Y.Z release tag");
    let retained = match version_tuple(&installed.version) {
        Some(found) => found >= first_complete,
        // A stamp that is not a vX.Y.Z tag is not one to gamble on: the pin this app recorded is
        // kept, because replacing an installation whose version cannot be compared could rewrite
        // a working deployment with something older.
        None => true,
    };
    if retained {
        return Ok(installed.version);
    }
    // Older than the first self-consistent release, so the tree on disk cannot install its own
    // workspaces and only the latest release says what to replace it with. Offline that lookup
    // fails and the pin is kept rather than refusing to start a machine that still has a
    // deployment it can run.
    latest().or(Ok(installed.version))
}

/// A release tag read as numbers, so `v0.1.10` is newer than `v0.1.5` the way the releases
/// happened.
///
/// String comparison says the opposite, which would move a working install backwards. Anything
/// that is not `vX.Y.Z` answers `None` instead of a guess, leaving the decision — keep the pin, or
/// treat the constant as a mistake — to the caller.
fn version_tuple(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.trim().strip_prefix('v')?.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn release_tag(body: &[u8]) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Release {
        tag_name: String,
    }

    let release: Release = serde_json::from_slice(body)
        .map_err(|error| format!("the latest ORBO release is not readable: {error}"))?;
    if release.tag_name.trim().is_empty() {
        return Err("the latest ORBO release has no version tag".into());
    }
    Ok(release.tag_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_root;

    fn scratch(label: &str) -> std::path::PathBuf {
        let root = temp_root(label);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn a_fresh_install_selects_latest_without_recording_an_unfinished_download() {
        let root = scratch("release-fresh");
        let version = resolve_version_with(&root, || Ok("v0.0.9".into())).unwrap();
        assert_eq!(version, "v0.0.9");
        assert!(deployment::installed(&root).is_none());
        assert!(deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn an_installed_version_does_not_query_github_or_upgrade() {
        let root = scratch("release-installed");
        deployment::record(&root, "v0.1.6").unwrap();
        std::fs::write(deployment::images_path(&root), "{}").unwrap();
        let version = resolve_version_with(&root, || panic!("must work offline")).unwrap();
        assert_eq!(version, "v0.1.6");
        assert!(!deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_missing_manifest_repairs_the_pinned_version() {
        let root = scratch("release-repair");
        deployment::record(&root, "v0.1.5").unwrap();
        let version = resolve_version_with(&root, || panic!("keep the installed pin")).unwrap();
        assert_eq!(version, "v0.1.5");
        assert!(deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A pin below the first self-consistent release can never repair its own tree, so it is
    /// offered the latest release, and the fetch that follows rewrites the stamp.
    #[test]
    fn a_pin_older_than_the_first_complete_release_is_moved_forward_once() {
        let root = scratch("release-pre-complete");
        deployment::record(&root, "v0.1.4").unwrap();
        std::fs::write(deployment::images_path(&root), "{}").unwrap();
        let version = resolve_version_with(&root, || Ok("v0.1.5".into())).unwrap();
        assert_eq!(version, "v0.1.5");
        assert!(
            deployment::needs_fetch(&root, &version),
            "the wanted tag differs from the stamp, so the caller fetches and repairs"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Offline, an older pin keeps running instead of blocking startup on a failed lookup.
    #[test]
    fn a_failed_lookup_keeps_an_older_pin() {
        let root = scratch("release-offline-pin");
        deployment::record(&root, "v0.1.4").unwrap();
        std::fs::write(deployment::images_path(&root), "{}").unwrap();
        let version = resolve_version_with(&root, || Err("GitHub answered 403".into())).unwrap();
        assert_eq!(version, "v0.1.4");
        assert!(!deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Ten is newer than five; only a numeric comparison leaves the newer pin alone.
    #[test]
    fn a_lexically_smaller_pin_is_not_moved_backwards() {
        let root = scratch("release-numeric-order");
        deployment::record(&root, "v0.1.10").unwrap();
        std::fs::write(deployment::images_path(&root), "{}").unwrap();
        let version = resolve_version_with(&root, || Ok("v0.1.5".into())).unwrap();
        assert_eq!(version, "v0.1.10");
        assert!(!deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    /// The boundary itself: at the first complete release the lookup is never attempted.
    #[test]
    fn the_first_complete_pin_is_retained_without_a_lookup() {
        let root = scratch("release-first-complete");
        deployment::record(&root, "v0.1.5").unwrap();
        std::fs::write(deployment::images_path(&root), "{}").unwrap();
        let version = resolve_version_with(&root, || panic!("must work offline")).unwrap();
        assert_eq!(version, "v0.1.5");
        assert!(!deployment::needs_fetch(&root, &version));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_lookup_is_reported_without_recording_a_version() {
        let root = scratch("release-lookup-failed");
        let error = resolve_version_with(&root, || Err("GitHub answered 403".into()))
            .expect_err("a failed lookup must not fall back to an old release");
        assert!(error.contains("403"));
        assert!(deployment::installed(&root).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn githubs_exact_tag_is_used_instead_of_the_release_title() {
        assert_eq!(
            release_tag(br#"{"name":"ORBO September release","tag_name":"v0.0.9"}"#).unwrap(),
            "v0.0.9"
        );
    }

    #[test]
    fn missing_or_unreadable_release_metadata_is_refused() {
        for body in [b"not json".as_slice(), b"{}", br#"{"tag_name":" "}"#] {
            assert!(release_tag(body).is_err());
        }
    }

    /// Exercises the production resolver and downloader against GitHub in an empty directory.
    #[test]
    #[ignore = "downloads the latest public release from GitHub"]
    fn live_latest_release_is_downloaded_and_pinned() {
        let root = scratch("release-live");
        let version = resolve_version(&root).expect("resolve the public release");
        assert!(deployment::installed(&root).is_none());
        deployment::fetch(&root, &version).expect("download the tagged deployment and manifest");
        assert_eq!(deployment::installed(&root).unwrap().version, version);
        let images: deployment::Images =
            serde_json::from_slice(&std::fs::read(deployment::images_path(&root)).unwrap())
                .unwrap();
        assert_eq!(images.version, version);
        let package: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("package.json")).unwrap()).unwrap();
        assert_eq!(package["version"], version.trim_start_matches('v'));
        for path in deployment::REQUIRED {
            assert!(root.join(path).exists(), "missing {path}");
        }
        assert_eq!(
            resolve_version_with(&root, || panic!("restart must not need GitHub")).unwrap(),
            version
        );
        assert!(!deployment::needs_fetch(&root, &version));
        println!("Downloaded and pinned {version}; tagged source, image manifest, and offline reuse verified.");
        std::fs::remove_dir_all(root).unwrap();
    }
}
