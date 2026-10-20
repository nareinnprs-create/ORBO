//! Putting the deployment on disk, which is not what the installer carries.
//!
//! The installer stays small: a Tauri binary and nothing else. What it needs to run a deployment —
//! `deploy/compose/docker-compose.yml`, `server`, `app`, `worker`, the tenant package — is fetched
//! on first run and kept beside it, at a version this app records. Two things follow from that
//! split, and both are the reason for it: the download stays a download rather than becoming part
//! of every installer, and the deployment can be moved forward on its own without shipping a new
//! app.
//!
//! What is fetched is the release's own source tarball, at a tag. Not `main`: an app that pulls
//! whatever is on a branch this morning is not a version anybody can be given, and the images the
//! stack runs are pinned per release, so the tree that names them has to be pinned too.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Written beside the deployment so the app can tell what it already put there.
const STAMP: &str = ".orbo-deployment";

/// The release asset that says which images this version runs.
///
/// Kept beside the deployment because the tree does not contain it: `docker-compose.yml` names
/// `orbo-supervisor:latest` and friends as defaults, which are local build names that exist on a
/// developer's machine and nowhere else. A desktop install has never built anything, so without
/// this file Compose asks Docker Hub for images that are not there and reports a denial, which
/// reads as an authentication problem and is not one.
const IMAGES: &str = "container-images.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Installed {
    pub version: String,
}

/// The tarball GitHub publishes for a tag.
///
/// A release asset rather than a branch, and https rather than git, so nothing needs a git client
/// or credentials to get a deployment.
///
/// `codeload.github.com` rather than `github.com/.../archive/...`: the archive endpoint answers
/// 404 to any request carrying an `Authorization` header, while codeload serves the same tarball
/// with one (needed for a private repository) and without one (a public repository).
pub fn tarball_url(version: &str) -> String {
    format!("https://codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/{version}")
}

/// Where the release publishes its image manifest.
pub fn images_url(version: &str) -> String {
    format!("https://github.com/nareinnprs-create/ORBO/releases/download/{version}/{IMAGES}")
}

pub fn images_path(root: &Path) -> PathBuf {
    root.join(IMAGES)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Image {
    pub reference: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Images {
    pub version: String,
    pub images: BTreeMap<String, Image>,
}

/// The Compose variable each published image answers to.
///
/// A published name on the left, a Compose variable on the right, because the two vocabularies are
/// different and neither is going to change to suit the other. These are the names
/// `deploy/compose/docker-compose.yml` reads: an image variable the file never looks at leaves the
/// service on its local-build default, and an install that has never built anything is left
/// reaching for a name no registry carries.
pub const IMAGE_VARIABLES: [(&str, &str); 5] = [
    ("server", "SERVER_IMAGE"),
    ("supervisor", "SUPERVISOR_IMAGE"),
    ("orbo-computer", "ORBO_COMPUTER_IMAGE"),
    ("orbo-bot", "BOT_IMAGE"),
    ("orbo-langgraph", "LANGGRAPH_IMAGE"),
];

/// Read the manifest laid down beside the deployment and turn it into Compose variables.
///
/// Digests, not tags. A tag can be moved to point at a different image after the version that was
/// tested; a digest is the image that was tested.
pub fn image_variables(root: &Path) -> Result<Vec<(String, String)>, String> {
    let text = std::fs::read_to_string(images_path(root))
        .map_err(|error| format!("could not read {}: {error}", images_path(root).display()))?;
    let manifest: Images = serde_json::from_str(&text)
        .map_err(|error| format!("{IMAGES} is not readable: {error}"))?;
    pin(&manifest)
}

/// One published image's reference, digest-pinned, from the manifest beside the deployment.
///
/// Every image reference comes from here, whether Compose reads it or the shell runs it directly.
/// The alternative was a name built from a version, and an engine given an unqualified name looks
/// it up on Docker Hub: `orbo-langgraph-agui:v0.0.8` became
/// `docker.io/library/orbo-langgraph-agui`, and the person was shown "requested access to
/// the resource is denied", which reads as a credentials problem and is not one.
///
/// An image this release does not publish is named as that. It is the honest answer and the
/// actionable one: the alternative is somebody debugging registry permissions for an image that
/// was never pushed.
pub fn reference(root: &Path, published: &str) -> Result<String, String> {
    let text = std::fs::read_to_string(images_path(root))
        .map_err(|error| format!("could not read {}: {error}", images_path(root).display()))?;
    let manifest: Images = serde_json::from_str(&text)
        .map_err(|error| format!("{IMAGES} is not readable: {error}"))?;
    manifest
        .images
        .get(published)
        .map(|image| image.reference.clone())
        .ok_or_else(|| format!("ORBO {} does not include {published}.", manifest.version))
}

/// Every image the stack runs, or a failure that names the one that is missing.
///
/// Refusing a partial manifest rather than filling the gaps from Compose's defaults: a stack that
/// runs four published images and one local build is neither the released version nor a build, and
/// the difference would only show up as behaviour nobody can reproduce.
pub fn pin(manifest: &Images) -> Result<Vec<(String, String)>, String> {
    let mut pinned = Vec::new();
    for (published, variable) in IMAGE_VARIABLES {
        let image = manifest.images.get(published).ok_or_else(|| {
            format!(
                "{IMAGES} for {} names no {published} image.",
                manifest.version
            )
        })?;
        pinned.push((variable.to_string(), image.reference.clone()));
    }
    Ok(pinned)
}

pub fn stamp_path(root: &Path) -> PathBuf {
    root.join(STAMP)
}

/// What version is already there, if any.
pub fn installed(root: &Path) -> Option<Installed> {
    std::fs::read_to_string(stamp_path(root))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

pub fn record(root: &Path, version: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(root)?;
    let stamp = Installed {
        version: version.to_string(),
    };
    std::fs::write(
        stamp_path(root),
        serde_json::to_string(&stamp).unwrap_or_default(),
    )
}

/// Whether anything needs fetching.
///
/// Answered from the stamp rather than by looking for files, so a half-extracted directory from an
/// interrupted download is replaced rather than trusted: the stamp is written last, and its absence
/// means the fetch did not finish.
///
/// The image manifest is the one exception. A deployment laid down by an app that predates it has a
/// stamp that matches and no manifest, and re-fetching is a better answer than an error about a
/// file the person has never heard of.
pub fn needs_fetch(root: &Path, wanted: &str) -> bool {
    if !images_path(root).exists() {
        return true;
    }
    match installed(root) {
        Some(found) => found.version != wanted,
        None => true,
    }
}

/// Everything the three host processes and Compose need from the tree.
///
/// Named rather than "the whole repository" because most of it is not needed to run: the docs, the
/// tests and the Dockerfiles are not part of a deployment, and copying them makes the directory
/// look like a place to develop rather than a place something runs. `deploy` is one entry because
/// matching happens on the tarball's first path component: it carries the Compose file the whole
/// desktop runtime looks for at `deploy/compose/docker-compose.yml`, the s6 scripts and their
/// environment templates. The Helm chart rides along under it; a small manifest is cheaper than a
/// second, depth-aware copy rule.
pub const REQUIRED: [&str; 4] = ["deploy", "server", "app", "worker"];

/// The rest of what a deployment needs, which is not what it is checked for.
pub const ALSO_COPIED: [&str; 7] = [
    "shared",
    "examples",
    "package.json",
    "bun.lock",
    "scripts",
    // Every package's tsconfig extends this one. Without it vite fails inside `parseExtends`, in a
    // stack trace that names the parser and not the missing file.
    "tsconfig.base.json",
    "bunfig.toml",
];

/// Fetch the tagged tarball and lay the deployment out under `root`.
///
/// The stamp is written last. Anything that fails before that leaves a directory without one, which
/// `needs_fetch` treats as absent, so an interrupted download is retried rather than half-run.
pub fn fetch(root: &Path, version: &str) -> Result<(), String> {
    let body = get(&tarball_url(version)).map_err(|error| {
        format!("could not fetch {version}: {error}. Is that a released version?")
    })?;

    std::fs::create_dir_all(root)
        .map_err(|error| format!("could not make {}: {error}", root.display()))?;

    unpack(root, &body)?;

    fetch_images(root, version)?;

    record(root, version).map_err(|error| format!("could not record the version: {error}"))
}

/// Where an archive entry may be written under `root`, or `None` when it is not
/// part of a deployment.
///
/// The traversal is refused here rather than after the fact. `Path::join`
/// followed by `starts_with` compares components and does not resolve `..`, so
/// `root.join("app/../../elsewhere")` starts with `root` and still lands outside
/// it -- which made the check that was there read as a guard without being one.
/// Every component of a path inside the tree is an ordinary name, so anything
/// else (`..`, an absolute path, a Windows drive prefix) is refused outright.
fn destination_in(root: &Path, path: &Path) -> Result<Option<PathBuf>, String> {
    // GitHub wraps everything in one directory named for the tag. Strip it, so the deployment
    // lands at `root` rather than at `root/ORBO-0.0.7`.
    let mut parts = path.components();
    parts.next();
    let relative: PathBuf = parts.collect();
    if relative.as_os_str().is_empty() {
        return Ok(None);
    }

    // Nothing outside `root`, whatever the archive says. A tarball is somebody else's file.
    if relative
        .components()
        .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err(format!(
            "the download tried to write outside {}: {}",
            root.display(),
            path.display()
        ));
    }

    // Only what a deployment needs. The rest of the tree is a place to develop, not to run.
    let wanted = relative
        .components()
        .next()
        .map(|first| {
            let name = first.as_os_str().to_string_lossy().into_owned();
            REQUIRED.contains(&name.as_str()) || ALSO_COPIED.contains(&name.as_str())
        })
        .unwrap_or(false);
    if !wanted {
        return Ok(None);
    }

    Ok(Some(root.join(&relative)))
}

/// Lay the tarball's deployment files out under `root`.
///
/// Split from [`fetch`] so the part that decides where somebody else's archive
/// is allowed to write can be exercised without a network.
pub fn unpack(root: &Path, body: &[u8]) -> Result<(), String> {
    let decoder = flate2::read::GzDecoder::new(body);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|error| format!("the download is not readable: {error}"))?;

    for entry in entries {
        let mut entry = entry.map_err(|error| format!("could not read the download: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("could not read a path in the download: {error}"))?
            .into_owned();

        let Some(destination) = destination_in(root, &path)? else {
            continue;
        };
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("could not make {}: {error}", parent.display()))?;
        }
        entry
            .unpack(&destination)
            .map_err(|error| format!("could not write {}: {error}", destination.display()))?;
    }

    Ok(())
}

/// Fetch the image manifest and check it before anything depends on it.
///
/// Parsed here rather than at start-up so a release missing an image fails while the person is
/// still looking at a screen that says what is being fetched, not later inside Compose's output.
fn fetch_images(root: &Path, version: &str) -> Result<(), String> {
    let direct = images_url(version);
    let body = if releases_token(&direct).is_some() {
        // A private repository: `github.com/.../releases/download` answers 404 to a request
        // carrying `Authorization`, the same way the archive endpoint does, so the fetch goes
        // through the API — asset id first, then the octet-stream endpoint whose redirect to the
        // signed object URL needs no credential of its own.
        release_asset(version, IMAGES)
            .map_err(|error| format!("could not fetch the image list for {version}: {error}"))?
    } else {
        get(&direct)
            .map_err(|error| format!("could not fetch the image list for {version}: {error}"))?
    };
    let manifest: Images = serde_json::from_slice(&body)
        .map_err(|error| format!("the image list for {version} is not readable: {error}"))?;
    pin(&manifest)?;
    std::fs::write(images_path(root), &body)
        .map_err(|error| format!("could not write {IMAGES}: {error}"))
}

/// One release asset, through the API: find its id by name, then download it as bytes.
///
/// Used where a credential is in play, because the direct download URL rejects authenticated
/// requests outright rather than redirecting them.
fn release_asset(version: &str, name: &str) -> Result<Vec<u8>, String> {
    let base = "https://api.github.com/repos/nareinnprs-create/ORBO/releases";
    let release = get_request(
        &format!("{base}/tags/{version}"),
        &[("Accept", "application/vnd.github+json")],
    )?;
    let release: serde_json::Value = serde_json::from_slice(&release)
        .map_err(|error| format!("the release for {version} is not readable: {error}"))?;
    let id = release["assets"]
        .as_array()
        .and_then(|assets| {
            assets
                .iter()
                .find(|asset| asset["name"].as_str() == Some(name))
        })
        .and_then(|asset| asset["id"].as_i64())
        .ok_or_else(|| format!("the release for {version} has no {name}"))?;
    get_request(
        &format!("{base}/assets/{id}"),
        &[("Accept", "application/octet-stream")],
    )
}

/// Fetch a URL into memory.
///
/// Shared with `install.rs`, which fetches the engine's installers through it and then checks their
/// digests. One client, one user agent, one set of TLS defaults.
///
/// When `ORBO_RELEASES_TOKEN` is set, its value is sent as a bearer token — but only to URLs under
/// `nareinnprs-create/ORBO`, so a private repository's credential never reaches third-party hosts
/// (the engine installers in `install.rs`).
pub fn get(url: &str) -> Result<Vec<u8>, String> {
    get_request(url, &[])
}

/// [`get`] with additional request headers, for endpoints whose answer depends on `Accept`.
fn get_request(url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, String> {
    let mut request = reqwest::blocking::Client::builder()
        .user_agent("orbo-desktop")
        .build()
        .map_err(|error| format!("could not prepare the download: {error}"))?
        .get(url);
    if let Some(token) = releases_token(url) {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    let response = request
        .send()
        .map_err(|error| format!("could not reach {url}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} answered {}", response.status()));
    }
    response
        .bytes()
        .map(|body| body.to_vec())
        .map_err(|error| format!("the download did not finish: {error}"))
}

/// The release credential for this URL, when one is wanted.
///
/// Only URLs under this repository's own name carry the token; every other host gets an
/// unauthenticated request.
fn releases_token(url: &str) -> Option<String> {
    releases_token_for(url, std::env::var("ORBO_RELEASES_TOKEN").ok().as_deref())
}

/// [`releases_token`] with the credential passed in, so the host filter is testable without
/// touching the process environment.
fn releases_token_for(url: &str, token: Option<&str>) -> Option<String> {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return None;
    };
    let host = parsed.host_str().unwrap_or_default();
    let on_github = matches!(
        host,
        "github.com" | "api.github.com" | "codeload.github.com"
    );
    if !on_github || !parsed.path().contains("nareinnprs-create/ORBO") {
        return None;
    }
    token
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(names: &[&str]) -> Images {
        Images {
            version: "v0.0.7".into(),
            images: names
                .iter()
                .map(|name| {
                    (
                        (*name).to_string(),
                        Image {
                            reference: format!("ghcr.io/nareinnprs-create/orbo-{name}@sha256:abc"),
                        },
                    )
                })
                .collect(),
        }
    }

    #[test]
    fn a_deployment_without_an_image_manifest_is_fetched_again_rather_than_refused() {
        let dir = std::env::temp_dir().join(format!("orbo-manifest-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let _ = std::fs::remove_file(images_path(&dir));
        record(&dir, "v0.0.7").unwrap();

        assert!(
            needs_fetch(&dir, "v0.0.7"),
            "a matching stamp is not enough when the images are not named"
        );

        std::fs::write(images_path(&dir), "{}").unwrap();
        assert!(!needs_fetch(&dir, "v0.0.7"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn every_service_compose_can_run_is_pinned_to_a_published_digest() {
        let published: Vec<&str> = IMAGE_VARIABLES.iter().map(|(name, _)| *name).collect();
        let pinned = pin(&manifest(&published)).expect("a complete manifest pins");
        assert_eq!(pinned.len(), IMAGE_VARIABLES.len());
        for (_, reference) in &pinned {
            assert!(
                reference.contains("@sha256:"),
                "a tag is not a version: {reference}"
            );
        }
    }

    #[test]
    fn a_manifest_missing_an_image_is_refused_rather_than_filled_in_from_compose() {
        // Compose's defaults are local build names. Falling back to them would run four published
        // images beside one that does not exist, and say nothing about the difference.
        let missing = pin(&manifest(&[
            "server",
            "supervisor",
            "orbo-computer",
            "orbo-bot",
        ]));
        let error = missing.expect_err("an incomplete manifest is not a deployment");
        assert!(error.contains("orbo-langgraph"), "{error}");
    }

    #[test]
    fn the_image_manifest_is_fetched_from_the_same_version_as_the_tree() {
        let url = images_url("v0.0.7");
        assert!(url.contains("/download/v0.0.7/"), "{url}");
        assert!(url.ends_with("container-images.json"), "{url}");
    }

    #[test]
    fn the_tarball_is_a_tag_rather_than_a_branch() {
        let url = tarball_url("v0.0.7");
        assert!(url.contains("/refs/tags/v0.0.7"), "{url}");
        assert!(!url.contains("/heads/"), "a branch is not a version: {url}");
        assert!(
            url.starts_with("https://"),
            "must not need a git client: {url}"
        );
    }

    #[test]
    fn an_empty_directory_needs_fetching() {
        let dir = std::env::temp_dir().join(format!("orbo-dep-empty-{}", std::process::id()));
        assert!(needs_fetch(&dir, "v0.0.7"));
    }

    /// One tarball, written as bytes rather than through `tar::Builder`.
    ///
    /// The builder refuses a path holding `..` outright ("paths in archives must
    /// not have `..`"), which is the right thing for it to do and makes it the
    /// wrong tool for this: an archive that climbs out of its root is not
    /// produced by a careful writer, it is produced by somebody writing the
    /// bytes. A ustar header is a name, a size, a checksum and padding.
    fn tarball(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar: Vec<u8> = Vec::new();
        for (name, body) in entries {
            let mut header = [0u8; 512];
            let bytes = name.as_bytes();
            assert!(bytes.len() < 100, "the test uses short names");
            header[..bytes.len()].copy_from_slice(bytes);
            header[100..107].copy_from_slice(b"0000644"); // mode
            header[108..115].copy_from_slice(b"0000000"); // uid
            header[116..123].copy_from_slice(b"0000000"); // gid
            let size = format!("{:011o}", body.len());
            header[124..135].copy_from_slice(size.as_bytes());
            header[136..147].copy_from_slice(b"00000000000"); // mtime
            header[156] = b'0'; // a regular file
            header[257..263].copy_from_slice(b"ustar ");
            header[263..265].copy_from_slice(b"00");
            // The checksum is computed with its own field read as spaces.
            header[148..156].copy_from_slice(b"        ");
            let sum: u32 = header.iter().map(|byte| u32::from(*byte)).sum();
            let checksum = format!("{sum:06o}  ");
            header[148..156].copy_from_slice(checksum.as_bytes());

            tar.extend_from_slice(&header);
            tar.extend_from_slice(body);
            tar.resize(tar.len().div_ceil(512) * 512, 0); // pad to a block
        }
        tar.extend_from_slice(&[0u8; 1024]); // two empty blocks end an archive

        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        std::io::Write::write_all(&mut encoder, &tar).expect("the test archive is compressed");
        encoder.finish().expect("the test archive is compressed")
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("orbo-unpack-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("the scratch directory is made");
        dir
    }

    #[test]
    fn the_test_archive_really_carries_the_traversal() {
        // Guards the guard: if the archive did not hold `..` the next test would
        // pass for the wrong reason.
        let archive = tarball(&[("ORBO-0.0.8/app/../../escaped.txt", b"owned")]);
        let decoder = flate2::read::GzDecoder::new(&archive[..]);
        let mut tar = tar::Archive::new(decoder);
        let paths: Vec<String> = tar
            .entries()
            .expect("the test archive is readable")
            .map(|entry| {
                entry
                    .expect("an entry")
                    .path()
                    .expect("a path")
                    .display()
                    .to_string()
            })
            .collect();
        assert_eq!(paths, ["ORBO-0.0.8/app/../../escaped.txt"]);
    }

    #[test]
    fn a_download_that_climbs_out_of_the_root_is_refused() {
        // `root.join("app/../../x")` starts with `root` -- `Path::starts_with`
        // compares components and does not resolve `..` -- so asking where the
        // path landed cannot answer this. The entry sits under `app`, which is a
        // directory a deployment wants, so the wanted-list does not stop it
        // either.
        let dir = scratch("escape");
        let root = dir.join("deployment");
        std::fs::create_dir_all(&root).expect("the root is made");

        let archive = tarball(&[("ORBO-0.0.8/app/../../escaped.txt", b"owned")]);
        let outcome = unpack(&root, &archive);

        let climbed = dir.join("escaped.txt");
        let written = climbed.exists();
        let _ = std::fs::remove_dir_all(&dir);

        assert!(!written, "a file was written above the root");
        assert!(outcome.is_err(), "the traversal was accepted: {outcome:?}");
        assert!(
            outcome.unwrap_err().contains("outside"),
            "the refusal should say what it refused"
        );
    }

    #[test]
    fn an_ordinary_download_still_lands_where_it_should() {
        let dir = scratch("ordinary");

        let archive = tarball(&[
            ("ORBO-0.0.8/app/index.ts", b"export {}"),
            (
                "ORBO-0.0.8/deploy/compose/docker-compose.yml",
                b"services: {}",
            ),
            // Not part of a deployment: skipped, not refused. A root-level compose file from an
            // older layout is in the same bucket — the runtime reads deploy/compose now.
            ("ORBO-0.0.8/docs/readme.md", b"# hi"),
            ("ORBO-0.0.8/docker-compose.yml", b"services: {}"),
        ]);
        unpack(&dir, &archive).expect("an ordinary download is laid out");

        let app = std::fs::read_to_string(dir.join("app/index.ts")).ok();
        let compose = std::fs::read_to_string(dir.join("deploy/compose/docker-compose.yml")).ok();
        let stray_root = dir.join("docker-compose.yml").exists();
        let docs = dir.join("docs").exists();
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(app.as_deref(), Some("export {}"));
        assert_eq!(compose.as_deref(), Some("services: {}"));
        assert!(
            !stray_root,
            "a pre-move compose file is not where the runtime looks"
        );
        assert!(!docs, "the rest of the tree is not part of a deployment");
    }

    #[test]
    fn a_recorded_version_is_not_fetched_again() {
        let dir = std::env::temp_dir().join(format!("orbo-dep-same-{}", std::process::id()));
        record(&dir, "v0.0.7").unwrap();
        std::fs::write(images_path(&dir), "{}").unwrap();
        assert!(!needs_fetch(&dir, "v0.0.7"));
        assert!(
            needs_fetch(&dir, "v0.0.8"),
            "a newer version has to be fetched"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_interrupted_fetch_is_replaced_rather_than_trusted() {
        // Files present, stamp absent: what an interrupted extract leaves behind. The stamp is
        // written last precisely so this case is distinguishable.
        let dir = std::env::temp_dir().join(format!("orbo-dep-partial-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("server")).unwrap();
        std::fs::create_dir_all(dir.join("deploy/compose")).unwrap();
        std::fs::write(
            dir.join("deploy/compose/docker-compose.yml"),
            "services: {}\n",
        )
        .unwrap();
        assert!(
            needs_fetch(&dir, "v0.0.7"),
            "a directory with no stamp is not a deployment"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unreadable_stamp_is_treated_as_absent_rather_than_fatal() {
        let dir = std::env::temp_dir().join(format!("orbo-dep-bad-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(stamp_path(&dir), "{ not json").unwrap();
        assert!(installed(&dir).is_none());
        assert!(needs_fetch(&dir, "v0.0.7"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_shared_tsconfig_is_copied_or_every_package_fails_to_parse_its_own() {
        assert!(
            ALSO_COPIED.contains(&"tsconfig.base.json"),
            "app, server and worker all extend it"
        );
    }

    #[test]
    fn what_is_required_is_what_the_stack_actually_runs() {
        // stack.rs discovers its base file at deploy/compose/docker-compose.yml, so the first
        // component that has to land is `deploy`; the three host processes are copied whole.
        for entry in ["deploy", "server", "app", "worker"] {
            assert!(
                REQUIRED.contains(&entry),
                "{entry} is not required but is checked for"
            );
        }
        assert!(
            !REQUIRED.contains(&"docker-compose.yml"),
            "the compose file moved under deploy/; requiring the old root path strands it"
        );
        assert!(!REQUIRED.contains(&"docs"));
        assert!(
            !REQUIRED.contains(&"desktop"),
            "the app is not a deployment"
        );
    }

    /// One array constant from `scripts/verify-deployment-install.ts`, as the quoted strings in it.
    ///
    /// A substring parse on purpose, not a parser: the script writes its two lists as plain quoted
    /// arrays precisely so this stays a find-the-bracket-and-take-the-quotes operation. The
    /// format is fixed by this test existing, so a comment added inside one of those arrays breaks
    /// the parse loudly rather than silently shifting entries, and the fix is moving the comment
    /// out, which is the right size of fix.
    fn script_array(script: &str, name: &str) -> Vec<String> {
        let marker = format!("const {name}");
        let at = script
            .find(&marker)
            .unwrap_or_else(|| panic!("the script declares no {name}"));
        let rest = &script[at + marker.len()..];
        let open = rest
            .find('[')
            .unwrap_or_else(|| panic!("{name} is not an array"));
        let close = rest
            .find(']')
            .unwrap_or_else(|| panic!("{name} is not closed"));
        // Split on the quote character: spans at even indices sit outside quotes, the ones this
        // takes sit inside them.
        rest[open + 1..close]
            .split('"')
            .skip(1)
            .step_by(2)
            .map(str::to_string)
            .collect()
    }

    /// The deployment-install check copies exactly what a deployment carries, or refuses.
    ///
    /// `scripts/verify-deployment-install.ts` rebuilds a deployment root in a temporary directory
    /// and runs `bun install` in it, which is the only check that exercises what a fresh install
    /// does. But it can only check what it copies, and the copy list has to exist in two places on
    /// purpose: here, where `fetch` filters the tarball, and there, where the temporary root is
    /// built. A list edited in one place and not the other turns the check into a quiet pass over
    /// the wrong tree, so this reads the script and refuses the difference.
    #[test]
    fn the_deployment_install_check_copies_exactly_what_a_deployment_carries() {
        let script = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../scripts/verify-deployment-install.ts"),
        )
        .expect("verify-deployment-install.ts is not where this test expects it");

        let dirs = script_array(&script, "DEPLOYMENT_DIRS");
        let files = script_array(&script, "DEPLOYMENT_FILES");

        assert_eq!(
            dirs.iter().map(String::as_str).collect::<Vec<_>>(),
            REQUIRED.to_vec(),
            "the script's DEPLOYMENT_DIRS has drifted from REQUIRED"
        );
        assert_eq!(
            files.iter().map(String::as_str).collect::<Vec<_>>(),
            ALSO_COPIED.to_vec(),
            "the script's DEPLOYMENT_FILES has drifted from ALSO_COPIED"
        );
    }

    #[test]
    fn the_release_token_only_travels_to_this_repositorys_urls() {
        let ours = images_url("v0.1.0");
        assert_eq!(
            releases_token_for(&ours, Some("ghp_test")).as_deref(),
            Some("ghp_test"),
            "a private repository's own assets carry the credential"
        );
        for foreign in [
            "https://github.com/oven-sh/bun/releases/download/bun-v1/bun.zip",
            "https://github.com/docker/compose/releases/download/v2/compose",
            "https://example.com/nareinnprs-create/ORBO",
            "https://github.com.attacker.example/nareinnprs-create/ORBO",
        ] {
            assert_eq!(
                releases_token_for(foreign, Some("ghp_test")),
                None,
                "{foreign} must never receive the release credential"
            );
        }
    }

    #[test]
    fn an_absent_or_blank_release_token_is_the_same_as_none() {
        let ours = tarball_url("v0.1.0");
        assert_eq!(releases_token_for(&ours, None), None);
        assert_eq!(releases_token_for(&ours, Some("")), None);
        assert_eq!(releases_token_for(&ours, Some("   ")), None);
    }
}
