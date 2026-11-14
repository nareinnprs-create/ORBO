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

// The operator map: seven keys move this install off a public github.com (see
// docs/planning/40-owner-roadmap.md, wave 2). Six are read here and in `install.rs` /
// `deployment_release.rs`; the seventh, ORBO_NPM_REGISTRY (the bun install registry for an
// offline mirror), is owned elsewhere — stack.rs reads it and documents it.
// Read at fetch time with std::env::var;
// every value is trimmed and an empty value counts as unset.
// - ORBO_RELEASES_API_URL
//   default https://api.github.com/repos/nareinnprs-create/ORBO/releases/latest
// - ORBO_RELEASES_TARBALL_TEMPLATE
//   default https://codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/{version}
// - ORBO_RELEASES_ASSETS_TEMPLATE
//   default https://github.com/nareinnprs-create/ORBO/releases/download/{version}/{asset}
// - ORBO_RELEASES_TOKEN
//   default unset: the published release is public, so nothing is authenticated
// - ORBO_ENGINE_MIRROR
//   default unset: the engine installers (install.rs) come from github.com
// - ORBO_IMAGE_PREFIX
//   default unset: images are pulled from ghcr.io/nareinnprs-create/orbo as released
// - ORBO_NPM_REGISTRY
//   related but owned elsewhere: stack.rs reads it (bun install registry); see that file
// A value that cannot be used (no scheme, no {version} placeholder) refuses with an error
// naming the key, so a mistyped override fails loudly while it is being set up rather than
// quietly downloading from the wrong place.

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
pub fn tarball_url(version: &str) -> Result<String, String> {
    tarball_url_with(
        version,
        env_override("ORBO_RELEASES_TARBALL_TEMPLATE").as_deref(),
    )
}

/// [`tarball_url`] with the operator override (`ORBO_RELEASES_TARBALL_TEMPLATE`) passed in, so the
/// template substitution is testable without touching the process environment.
fn tarball_url_with(version: &str, template: Option<&str>) -> Result<String, String> {
    match template {
        None => Ok(format!(
            "https://codeload.github.com/nareinnprs-create/ORBO/tar.gz/refs/tags/{version}"
        )),
        Some(template) => {
            let tag = url_encode(version);
            render_endpoint(
                "ORBO_RELEASES_TARBALL_TEMPLATE",
                template,
                &[("{version}", &tag)],
            )
        }
    }
}

/// Where the release publishes its image manifest.
pub fn images_url(version: &str) -> Result<String, String> {
    images_url_with(
        version,
        IMAGES,
        env_override("ORBO_RELEASES_ASSETS_TEMPLATE").as_deref(),
    )
}

/// [`images_url`] with the operator override (`ORBO_RELEASES_ASSETS_TEMPLATE`) passed in.
fn images_url_with(version: &str, asset: &str, template: Option<&str>) -> Result<String, String> {
    match template {
        None => Ok(format!(
            "https://github.com/nareinnprs-create/ORBO/releases/download/{version}/{asset}"
        )),
        Some(template) => {
            let tag = url_encode(version);
            let asset = url_encode(asset);
            render_endpoint(
                "ORBO_RELEASES_ASSETS_TEMPLATE",
                template,
                &[("{version}", &tag), ("{asset}", &asset)],
            )
        }
    }
}

/// One release endpoint URL from an operator template: every placeholder replaced, and the
/// result checked to be a URL the fetcher can actually reach.
///
/// A template missing a placeholder cannot name this release's URL, and a template that does
/// not render into an absolute URL cannot be fetched; both refuse naming the key rather than
/// falling back to the public endpoint, which an internal mirror would not have.
/// Shared with `deployment_release.rs`, which resolves the "releases/latest" endpoint the
/// same way.
pub(crate) fn render_endpoint(
    key: &str,
    template: &str,
    substitutions: &[(&str, &str)],
) -> Result<String, String> {
    for (placeholder, _) in substitutions {
        if !template.contains(placeholder) {
            return Err(format!(
                "{key} is set, but it has no {placeholder} placeholder, so this release URL \
                 cannot be rendered"
            ));
        }
    }
    let mut rendered = template.to_string();
    for (placeholder, value) in substitutions {
        rendered = rendered.replace(placeholder, value);
    }
    let parsed = reqwest::Url::parse(&rendered)
        .map_err(|error| format!("{key} is set, but {rendered} is not a usable URL: {error}"))?;
    match parsed.host_str() {
        Some(_host) if !_host.is_empty() => Ok(rendered),
        _ => Err(format!(
            "{key} is set, but {rendered} has no host to fetch it from"
        )),
    }
}

/// Percent-encode outside the unreserved set.
///
/// What is substituted is a release tag (`vX.Y.Z`) and an asset name, neither of which
/// carries a character the set misses, but encoding is harmless there and keeps a path
/// segment a path segment if a tag ever does carry one.
fn url_encode(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            _ => {
                encoded.push('%');
                encoded.push(HEX[(byte >> 4) as usize] as char);
                encoded.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }
    encoded
}

/// An operator-set value: trimmed, with an empty value counted as unset.
pub(crate) fn env_override(name: &str) -> Option<String> {
    override_value(std::env::var(name).ok())
}

/// [`env_override`] with the raw value passed in, so the trim is testable without touching
/// the process environment.
fn override_value(raw: Option<String>) -> Option<String> {
    raw.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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
    reference_with(
        root,
        published,
        env_override("ORBO_IMAGE_PREFIX").as_deref(),
    )
}

/// [`reference`] with the operator's `ORBO_IMAGE_PREFIX` passed in, so the rewrite is testable
/// without touching the process environment.
fn reference_with(
    root: &Path,
    published: &str,
    image_prefix: Option<&str>,
) -> Result<String, String> {
    let text = std::fs::read_to_string(images_path(root))
        .map_err(|error| format!("could not read {}: {error}", images_path(root).display()))?;
    let manifest: Images = serde_json::from_str(&text)
        .map_err(|error| format!("{IMAGES} is not readable: {error}"))?;
    manifest
        .images
        .get(published)
        .map(|image| image_reference(&image.reference, image_prefix))
        .ok_or_else(|| format!("ORBO {} does not include {published}.", manifest.version))
}

/// Every image the stack runs, or a failure that names the one that is missing.
///
/// Refusing a partial manifest rather than filling the gaps from Compose's defaults: a stack that
/// runs four published images and one local build is neither the released version nor a build, and
/// the difference would only show up as behaviour nobody can reproduce.
pub fn pin(manifest: &Images) -> Result<Vec<(String, String)>, String> {
    pin_with(manifest, env_override("ORBO_IMAGE_PREFIX").as_deref())
}

/// [`pin`] with the operator's `ORBO_IMAGE_PREFIX` passed in, so the rewrite is testable
/// without touching the process environment.
pub(crate) fn pin_with(
    manifest: &Images,
    image_prefix: Option<&str>,
) -> Result<Vec<(String, String)>, String> {
    let mut pinned = Vec::new();
    for (published, variable) in IMAGE_VARIABLES {
        let image = manifest.images.get(published).ok_or_else(|| {
            format!(
                "{IMAGES} for {} names no {published} image.",
                manifest.version
            )
        })?;
        pinned.push((
            variable.to_string(),
            image_reference(&image.reference, image_prefix),
        ));
    }
    Ok(pinned)
}

/// The reference prefix this release's images are published under, before any override.
const IMAGE_REFERENCE_PREFIX: &str = "ghcr.io/nareinnprs-create/orbo";

/// One image reference as the stack should pull it.
///
/// An `ORBO_IMAGE_PREFIX` that is set replaces the published `ghcr.io/nareinnprs-create/orbo`
/// prefix — the host and repository prefix this release's images are published under — with
/// the operator's value, keeping the rest, so the `-published` suffix and the `@sha256:`
/// digest survive unchanged: the digest is still the image that was tested, behind whatever
/// mirror now serves it. A reference that does not carry that prefix is not one of this
/// release's published images and is left alone. Compose's `${X_IMAGE:-...}` defaults remain
/// the way to override a single image outright; this rewrite is for the manifest-pinned path.
fn image_reference(reference: &str, image_prefix: Option<&str>) -> String {
    match image_prefix.map(|prefix| prefix.trim_end_matches('/')) {
        Some(prefix) if !prefix.is_empty() && reference.starts_with(IMAGE_REFERENCE_PREFIX) => {
            format!("{prefix}{}", &reference[IMAGE_REFERENCE_PREFIX.len()..])
        }
        _ => reference.to_string(),
    }
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
///
/// `agent-orbo-computer` rides along for one import: `server/src/computer/policy-network.ts` reads
/// the egress rules from it rather than from a copy of them, so a deployment without the directory
/// has a server that cannot boot.
pub const REQUIRED: [&str; 5] = ["deploy", "server", "app", "worker", "agent-orbo-computer"];

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
    let url =
        tarball_url(version).map_err(|error| format!("could not fetch {version}: {error}"))?;
    let body = get(&url).map_err(|error| {
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
    // An operator-configured asset endpoint (`ORBO_RELEASES_ASSETS_TEMPLATE`) is release
    // furniture by construction: fetch it directly, with the release credential attached if
    // its host is part of the configuration, rather than through GitHub's by-id lookup — a
    // mirror need not implement that API.
    let assets_override = env_override("ORBO_RELEASES_ASSETS_TEMPLATE");
    let direct = images_url(version)
        .map_err(|error| format!("could not fetch the image list for {version}: {error}"))?;
    let body = if assets_override.is_some() || releases_token(&direct).is_none() {
        get(&direct)
    } else {
        release_asset(version, IMAGES)
    }
    .map_err(|error| format!("could not fetch the image list for {version}: {error}"))?;
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
    let base = release_asset_base_with(env_override("ORBO_RELEASES_API_URL").as_deref());
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

/// The releases API the by-id asset lookup talks to.
///
/// `ORBO_RELEASES_API_URL` names the "releases/latest" endpoint; the tag and asset endpoints
/// this lookup needs sit one path step below it on the same server, so the base they share is
/// that common prefix. The same credential applies to both because they are endpoints this
/// code constructed from the operator's own value. With no override this stays the public
/// repository's API, exactly as before.
fn release_asset_base_with(api: Option<&str>) -> String {
    match api {
        None => "https://api.github.com/repos/nareinnprs-create/ORBO/releases".into(),
        Some(api) => {
            let api = api.trim_end_matches('/');
            if let Some(at) = api.find("/releases/latest") {
                api[..at + "/releases".len()].to_string()
            } else if api.ends_with("/releases") {
                api.to_string()
            } else {
                format!("{api}/releases")
            }
        }
    }
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
/// Without any release-endpoint override this stays scoped to URLs under
/// `nareinnprs-create/ORBO` on GitHub's hosts, exactly as before, so the credential never
/// reaches third-party hosts (the engine installers in `install.rs`).
///
/// When any of the three release-endpoint overrides (`ORBO_RELEASES_API_URL`,
/// `ORBO_RELEASES_TARBALL_TEMPLATE`, `ORBO_RELEASES_ASSETS_TEMPLATE`) is set, the credential
/// also travels to the host of every configured endpoint, whichever endpoint it was. That is
/// safe because those are release endpoints this code constructed from the value the
/// operator set — there is no third party in the set — and attaching is what configuring
/// them means. The GitHub scoping above is kept alongside it, so a partially overridden
/// install still authenticates the endpoints that remain on github.com.
fn releases_token(url: &str) -> Option<String> {
    releases_token_for(
        url,
        env_override("ORBO_RELEASES_TOKEN").as_deref(),
        env_override("ORBO_RELEASES_API_URL").as_deref(),
        env_override("ORBO_RELEASES_TARBALL_TEMPLATE").as_deref(),
        env_override("ORBO_RELEASES_ASSETS_TEMPLATE").as_deref(),
    )
}

/// [`releases_token`] with the credential and the operator's endpoint overrides passed in, so
/// the host filter is testable without touching the process environment.
fn releases_token_for(
    url: &str,
    token: Option<&str>,
    api_url: Option<&str>,
    tarball_template: Option<&str>,
    assets_template: Option<&str>,
) -> Option<String> {
    let token = token.map(str::trim).filter(|token| !token.is_empty())?;
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return None;
    };
    let host = parsed.host_str().unwrap_or_default();
    let on_github = matches!(
        host,
        "github.com" | "api.github.com" | "codeload.github.com"
    );
    let on_ours = on_github && parsed.path().contains("nareinnprs-create/ORBO");
    let on_configured = [api_url, tarball_template, assets_template]
        .iter()
        .filter_map(|endpoint| *endpoint)
        .any(|endpoint| {
            reqwest::Url::parse(endpoint)
                .ok()
                .and_then(|configured| {
                    configured
                        .host_str()
                        .map(|configured_host| configured_host.eq_ignore_ascii_case(host))
                })
                .unwrap_or(false)
        });
    if !on_ours && !on_configured {
        return None;
    }
    Some(token.to_owned())
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

    /// The rewrite trades the published host and repository prefix for the operator's, and
    /// keeps everything after it — the `-published` suffix and, pinned, the digest.
    #[test]
    fn the_image_prefix_rewrite_succeeds_the_ghcr_prefix_and_keeps_the_digest() {
        assert_eq!(
            image_reference(
                "ghcr.io/nareinnprs-create/orbo-langgraph@sha256:abc",
                Some("registry.internal:5000/orbo")
            ),
            "registry.internal:5000/orbo-langgraph@sha256:abc"
        );
        assert_eq!(
            image_reference(
                "ghcr.io/nareinnprs-create/orbo-bot@sha256:0123456789abcdef",
                Some("mirror.example.com/orbo/")
            ),
            "mirror.example.com/orbo-bot@sha256:0123456789abcdef"
        );
    }

    /// Without the override the manifest's references land exactly as the release published
    /// them, digest included.
    #[test]
    fn without_an_image_prefix_the_references_are_pulled_as_released() {
        let published = "ghcr.io/nareinnprs-create/orbo-server@sha256:abc";
        assert_eq!(image_reference(published, None), published);
        assert_eq!(image_reference(published, Some("")), published.to_string());
    }

    /// A reference not under the published prefix is not one of this release's images, and a
    /// blank prefix is no prefix at all.
    #[test]
    fn a_reference_without_the_published_ghcr_prefix_is_left_alone() {
        for reference in [
            "docker.io/library/orbo-server@sha256:abc",
            "ghcr.io/other-owner/orbo-server@sha256:abc",
            "ghcr.io/nareinnprs-create/server@sha256:abc",
        ] {
            assert_eq!(
                image_reference(reference, Some("mirror.example.com/orbo")),
                reference,
                "{reference} is not a published ORBO image"
            );
        }
    }

    #[test]
    fn the_manifest_is_pinned_behind_the_operator_prefix_digest_intact() {
        let pinned = pin_with(
            &manifest(
                &IMAGE_VARIABLES
                    .iter()
                    .map(|(name, _)| *name)
                    .collect::<Vec<_>>(),
            ),
            Some("registry.internal:5000/orbo"),
        )
        .expect("a complete manifest pins");
        assert_eq!(pinned.len(), IMAGE_VARIABLES.len());
        for (variable, reference) in &pinned {
            assert!(
                reference.starts_with("registry.internal:5000/orbo"),
                "{variable} did not follow the prefix: {reference}"
            );
            assert!(
                reference.contains("@sha256:"),
                "the digest is kept: {reference}"
            );
        }
        assert_eq!(pinned[0].1, "registry.internal:5000/orbo-server@sha256:abc");
    }

    /// Every read of the manifest goes through the same rewrite, whether Compose reads the
    /// reference (via `image_variables`) or the shell runs it directly (via `reference`).
    #[test]
    fn a_single_image_reference_is_rewritten_the_same_way_the_manifest_is() {
        let dir = scratch("image-prefix");
        std::fs::write(
            images_path(&dir),
            serde_json::to_string(&manifest(&["server"])).unwrap(),
        )
        .unwrap();
        assert_eq!(
            reference_with(&dir, "server", Some("mirror.example.com/orbo")).unwrap(),
            "mirror.example.com/orbo-server@sha256:abc"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_image_manifest_is_fetched_from_the_same_version_as_the_tree() {
        let url = images_url("v0.0.7").expect("the default asset endpoint renders");
        assert!(url.contains("/download/v0.0.7/"), "{url}");
        assert!(url.ends_with("container-images.json"), "{url}");
    }

    #[test]
    fn the_tarball_is_a_tag_rather_than_a_branch() {
        let url = tarball_url("v0.0.7").expect("the default tarball endpoint renders");
        assert!(url.contains("/refs/tags/v0.0.7"), "{url}");
        assert!(!url.contains("/heads/"), "a branch is not a version: {url}");
        assert!(
            url.starts_with("https://"),
            "must not need a git client: {url}"
        );
    }

    #[test]
    fn the_release_templates_follow_the_operator_overrides() {
        let tarball = tarball_url_with(
            "v0.1.0",
            Some("https://mirror.example.org/orbo/tar.gz/{version}"),
        )
        .expect("a tarball template with {version} renders");
        assert_eq!(tarball, "https://mirror.example.org/orbo/tar.gz/v0.1.0");
        let assets = images_url_with(
            "v0.1.0",
            IMAGES,
            Some("https://mirror.example.org/assets/{version}/{asset}"),
        )
        .expect("an asset template with both placeholders renders");
        assert_eq!(
            assets,
            "https://mirror.example.org/assets/v0.1.0/container-images.json"
        );
    }

    /// Tags are `vX.Y.Z`, so the encoding changes nothing there; it is still what keeps a
    /// template's path a path if a tag ever carries a character that does not belong in one.
    #[test]
    fn the_tag_is_url_encoded_before_it_names_the_template() {
        assert_eq!(url_encode("v0.1.6"), "v0.1.6");
        assert_eq!(url_encode("v1.0.0+bare"), "v1.0.0%2Bbare");
        assert_eq!(
            tarball_url_with("v1.0.0+bare", Some("https://mirror.example.org/{version}"))
                .expect("the encoded tag renders"),
            "https://mirror.example.org/v1.0.0%2Bbare"
        );
    }

    #[test]
    fn a_template_missing_a_placeholder_is_refused_naming_the_key() {
        let refused = tarball_url_with("v0.1.0", Some("https://mirror.example.org/orbo/tar.gz"))
            .expect_err("a tarball template without {version} cannot name the release");
        assert!(
            refused.contains("ORBO_RELEASES_TARBALL_TEMPLATE"),
            "{refused}"
        );
        assert!(refused.contains("{version}"), "{refused}");
        for template in [
            "https://mirror.example.org/{version}",
            "https://mirror.example.org/{asset}",
        ] {
            let refused = images_url_with("v0.1.0", IMAGES, Some(template))
                .expect_err("an asset template missing a placeholder is refused");
            assert!(
                refused.contains("ORBO_RELEASES_ASSETS_TEMPLATE"),
                "{refused}"
            );
        }
    }

    #[test]
    fn a_template_that_is_not_a_usable_url_is_refused_naming_the_key() {
        for template in ["not a url", "{version}", "http://"] {
            let refused = tarball_url_with("v0.1.0", Some(template))
                .expect_err("a template that is not an absolute URL is refused");
            assert!(
                refused.contains("ORBO_RELEASES_TARBALL_TEMPLATE"),
                "{refused}"
            );
        }
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
        let ours = images_url("v0.1.0").expect("the default asset endpoint renders");
        assert_eq!(
            releases_token_for(&ours, Some("ghp_test"), None, None, None).as_deref(),
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
                releases_token_for(foreign, Some("ghp_test"), None, None, None),
                None,
                "{foreign} must never receive the release credential"
            );
        }
    }

    /// Every endpoint the operator configures is a release endpoint this code constructed,
    /// so its host is safe to attach the credential to — without any configuration the
    /// filter above still refuses everything else.
    #[test]
    fn a_release_token_also_travels_to_the_hosts_of_the_configured_endpoints() {
        let api = "https://ghe.example.com/api/v3/repos/acme/ORBO/releases/latest";
        for (url, api_url, tarball, assets) in [
            (api, Some(api), None, None),
            (
                "https://mirror.example.org/orbo/tar.gz/v0.1.0",
                None,
                Some("https://mirror.example.org/orbo/tar.gz/{version}"),
                None,
            ),
            (
                "https://mirror.example.org/assets/v0.1.0/container-images.json",
                None,
                None,
                Some("https://mirror.example.org/assets/{version}/{asset}"),
            ),
        ] {
            assert_eq!(
                releases_token_for(url, Some("ghp_test"), api_url, tarball, assets).as_deref(),
                Some("ghp_test"),
                "{url} sits on a configured release host"
            );
        }
    }

    /// A configured host does not widen the filter to other repositories on GitHub: the
    /// engine installers ride on github.com too, and never see the credential.
    #[test]
    fn a_configured_endpoint_host_covers_the_mirror_not_a_strangers_github_urls() {
        let api = "https://ghe.example.com/api/v3/repos/acme/ORBO/releases/latest";
        for foreign in [
            "https://github.com/oven-sh/bun/releases/download/bun-v1/bun.zip",
            "https://example.com/whatever",
        ] {
            assert_eq!(
                releases_token_for(foreign, Some("ghp_test"), Some(api), None, None),
                None,
                "{foreign} must never receive the release credential"
            );
        }
    }

    #[test]
    fn an_absent_or_blank_release_token_is_the_same_as_none() {
        let ours = tarball_url("v0.1.0").expect("the default tarball endpoint renders");
        assert_eq!(releases_token_for(&ours, None, None, None, None), None);
        assert_eq!(releases_token_for(&ours, Some(""), None, None, None), None);
        assert_eq!(
            releases_token_for(&ours, Some("   "), None, None, None),
            None
        );
    }

    #[test]
    fn an_override_value_is_trimmed_and_blank_counts_as_unset() {
        assert_eq!(
            override_value(Some(" https://mirror.example.org ".into())),
            Some("https://mirror.example.org".into())
        );
        assert_eq!(override_value(Some("   ".into())), None);
        assert_eq!(override_value(None), None);
    }

    #[test]
    fn the_asset_by_id_lookup_follows_the_api_override() {
        assert_eq!(
            release_asset_base_with(None),
            "https://api.github.com/repos/nareinnprs-create/ORBO/releases"
        );
        assert_eq!(
            release_asset_base_with(Some(
                "https://ghe.example.com/api/v3/repos/acme/ORBO/releases/latest"
            )),
            "https://ghe.example.com/api/v3/repos/acme/ORBO/releases"
        );
        assert_eq!(
            release_asset_base_with(Some(
                "https://ghe.example.com/api/v3/repos/acme/ORBO/releases/"
            )),
            "https://ghe.example.com/api/v3/repos/acme/ORBO/releases"
        );
        assert_eq!(
            release_asset_base_with(Some("https://ghe.example.com/acme/ORBO")),
            "https://ghe.example.com/acme/ORBO/releases"
        );
    }
}
