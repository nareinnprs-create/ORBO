//! Local installation checkpoints. These contain no credentials and never grant runtime ownership.
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{deployment, engine::Address, harness::HarnessChoice, problem::Problem, stack};

pub const REQUIRED: &str = "Finish installing ORBO's local software before signing in or starting. Return to Install and try again.";
pub const FILE: &str = ".orbo-prepared.json";
const DEPENDENCIES: &str = ".orbo-dependencies.json";
const LAUNCH: &str = ".orbo-launched.json";
const PACKAGES: [&str; 4] = ["", "server", "app", "worker"];
/// How long verification waits before reading the tree a second time. The first read is the one
/// that races whatever is still touching a directory Bun has just finished writing; a second read
/// a moment later is the cheapest way to tell that apart from a tree that is really incomplete.
const VERIFY_PAUSE: Duration = Duration::from_secs(1);

#[derive(Serialize, Deserialize)]
struct Dependencies {
    fingerprint: String,
    bun: PathBuf,
    package_files: Vec<PathBuf>,
}

#[derive(Serialize, Deserialize)]
struct Prepared {
    fingerprint: String,
    harness: Option<HarnessChoice>,
    images: Vec<String>,
    /// Which `.orbo-deployment` stamp this fingerprint was taken over.
    ///
    /// Written from v0.1.7 on; records written before the field existed deserialize as `None`,
    /// and the install-fingerprint heal below refuses them rather than guessing at their age.
    #[serde(default)]
    deployment: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Launch {
    pub harness: Option<HarnessChoice>,
}

#[derive(Serialize, Deserialize)]
struct Launched {
    preparation: String,
    launch: Launch,
}

fn prepared_digest(root: &Path) -> Option<String> {
    std::fs::read(root.join(FILE))
        .ok()
        .map(|bytes| format!("{:x}", Sha256::digest(bytes)))
}

pub fn record_launch(root: &Path, harness: Option<&HarnessChoice>) -> Result<(), Problem> {
    let preparation = prepared_digest(root)
        .ok_or_else(|| required("The completed installation record is unavailable."))?;
    write_record(
        root,
        LAUNCH,
        &Launched {
            preparation,
            launch: Launch {
                harness: harness.cloned(),
            },
        },
    )
}

/// Passive resume intent. Runtime and credential validity are checked by the normal Start path.
pub fn launch(root: &Path) -> Option<Launch> {
    let record: Launched = serde_json::from_slice(&std::fs::read(root.join(LAUNCH)).ok()?).ok()?;
    (prepared_digest(root).as_deref() == Some(&record.preparation)).then_some(record.launch)
}

/// Completed installation is independent of sign-in and runtime state. This passive checkpoint
/// only selects the recovery screen; Start still verifies the assets and selected engine.
pub fn installation(root: &Path) -> Option<Launch> {
    let record: Prepared = serde_json::from_slice(&std::fs::read(root.join(FILE)).ok()?).ok()?;
    Some(Launch {
        harness: record.harness,
    })
}

pub fn save_selected_root(config: &Path, root: &Path) -> Result<(), Problem> {
    let root = std::fs::canonicalize(root).map_err(|e| {
        Problem::with(
            "ORBO could not remember this installation for next time.",
            e.to_string(),
        )
    })?;
    std::fs::create_dir_all(config).map_err(|e| {
        Problem::with(
            "ORBO could not remember this installation for next time.",
            e.to_string(),
        )
    })?;
    write_record(config, "last-launched-root.json", &root)
}

pub fn selected_root(config: &Path) -> Option<PathBuf> {
    let root: PathBuf =
        serde_json::from_slice(&std::fs::read(config.join("last-launched-root.json")).ok()?)
            .ok()?;
    root.is_absolute().then_some(root)
}

pub fn required(detail: impl Into<String>) -> Problem {
    Problem::with(REQUIRED, detail)
}

fn hash_files(root: &Path, files: impl IntoIterator<Item = PathBuf>) -> Result<String, Problem> {
    hash_files_with(root, files, |_, bytes| bytes.to_vec())
}

/// `content` decides which bytes of each file actually reach the digest, so a record can cover
/// a file's raw bytes or only the part of it that the record's purpose cares about.
fn hash_files_with(
    root: &Path,
    files: impl IntoIterator<Item = PathBuf>,
    content: impl Fn(&Path, &[u8]) -> Vec<u8>,
) -> Result<String, Problem> {
    let mut hash = Sha256::new();
    hash.update(b"orbo-preparation-v1\0");
    hash.update(
        std::fs::canonicalize(root)
            .map_err(|e| required(e.to_string()))?
            .to_string_lossy()
            .as_bytes(),
    );
    for file in files {
        hash.update(file.to_string_lossy().as_bytes());
        let bytes = std::fs::read(root.join(&file))
            .map_err(|e| required(format!("{}: {e}", file.display())))?;
        let bytes = content(&file, &bytes);
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    Ok(format!("{:x}", hash.finalize()))
}

/// What `bun install` actually consumes: the lockfile in full, and from each package.json only
/// the keys an install reads. Hashing the whole file used to mean that a git pull which merely
/// bumped the release version invalidated a perfectly good dependency tree, forcing a reinstall
/// that re-records an install nothing about it had changed.
fn dependency_fingerprint(root: &Path) -> Result<String, Problem> {
    hash_files_with(
        root,
        std::iter::once(PathBuf::from("bun.lock"))
            .chain(PACKAGES.map(|path| Path::new(path).join("package.json"))),
        |file, bytes| match file.file_name().and_then(|name| name.to_str()) {
            Some("package.json") => install_view(bytes),
            _ => bytes.to_vec(),
        },
    )
}

/// The install-relevant view of one package.json, serialized stably: only the keys that can
/// change what an install produces are kept, and absent keys are simply left out. A manifest
/// that does not parse falls back to its raw bytes, so a corrupt file is never treated as
/// matching what was recorded.
fn install_view(bytes: &[u8]) -> Vec<u8> {
    const KEYS: [&str; 10] = [
        "name",
        "packageManager",
        "workspaces",
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
        "overrides",
        "resolutions",
        "patchedDependencies",
    ];
    let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return bytes.to_vec();
    };
    let Some(object) = manifest.as_object() else {
        return bytes.to_vec();
    };
    let view = KEYS
        .iter()
        .filter_map(|key| object.get(*key).map(|value| (*key, value)))
        .collect::<BTreeMap<_, _>>();
    serde_json::to_vec(&view).unwrap_or_else(|_| bytes.to_vec())
}

fn fingerprint(root: &Path) -> Result<String, Problem> {
    hash_files(
        root,
        [
            PathBuf::from(".orbo-deployment"),
            PathBuf::from("container-images.json"),
            PathBuf::from("deploy/compose/docker-compose.yml"),
            PathBuf::from(DEPENDENCIES),
        ],
    )
}

fn write_record(root: &Path, name: &str, value: &impl Serialize) -> Result<(), Problem> {
    let target = root.join(name);
    let temporary = root.join(format!("{name}.tmp"));
    let bytes = serde_json::to_vec(value).map_err(|e| required(e.to_string()))?;
    std::fs::write(&temporary, bytes).map_err(|e| required(e.to_string()))?;
    // Windows rename does not replace an existing file. A missing checkpoint is safe on interruption.
    match std::fs::remove_file(&target) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(required(e.to_string())),
    }
    std::fs::rename(temporary, target).map_err(|e| required(e.to_string()))
}

pub fn invalidate(root: &Path) -> Result<(), Problem> {
    match std::fs::remove_file(root.join(FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(required(e.to_string())),
    }
}

/// Record resolved package manifests, not just the existence of a partial node_modules directory.
fn package_files(root: &Path) -> Result<Vec<PathBuf>, Problem> {
    let mut files = BTreeSet::new();
    for package in PACKAGES {
        let directory = root.join(package);
        let manifest: serde_json::Value = serde_json::from_slice(
            &std::fs::read(directory.join("package.json")).map_err(|e| required(e.to_string()))?,
        )
        .map_err(|e| required(e.to_string()))?;
        for group in ["dependencies", "devDependencies"] {
            for name in manifest
                .get(group)
                .and_then(serde_json::Value::as_object)
                .into_iter()
                .flat_map(|entries| entries.keys())
            {
                let relative = Path::new("node_modules").join(name).join("package.json");
                let mut candidates = vec![directory.join(&relative)];
                let fallback = root.join(&relative);
                // For the root package both are the same path — `join("")` only adds a trailing
                // separator, and path equality compares components.
                if fallback != candidates[0] {
                    candidates.push(fallback);
                }
                let file = candidates
                    .iter()
                    .find(|path| path.is_file())
                    .ok_or_else(|| {
                        let checked = candidates
                            .iter()
                            .map(|path| match path.metadata() {
                                Ok(_) => format!("{}: exists but is not a file", path.display()),
                                Err(error) => format!("{}: {error}", path.display()),
                            })
                            .collect::<Vec<_>>()
                            .join("; ");
                        required(format!(
                            "The installed package {name} is missing from {package}. Checked \
                             {checked}."
                        ))
                    })?;
                files.insert(std::fs::canonicalize(file).map_err(|e| required(e.to_string()))?);
            }
        }
    }
    Ok(files.into_iter().collect())
}

pub fn record_dependencies(root: &Path, bun: &Path) -> Result<(), Problem> {
    let record = Dependencies {
        fingerprint: dependency_fingerprint(root)?,
        bun: bun.to_path_buf(),
        package_files: package_files(root)?,
    };
    write_record(root, DEPENDENCIES, &record)
}

pub fn install_dependencies_if_needed(
    root: &Path,
    acquire_runtime: impl FnOnce() -> Result<PathBuf, Problem>,
) -> Result<PathBuf, Problem> {
    if let Ok(bun) = dependencies_ready(root) {
        return Ok(bun);
    }
    let bun = acquire_runtime()?;
    stack::install_dependencies(root, &bun)?;
    verify_dependencies(root, &bun)?;
    Ok(bun)
}

/// Record the installed packages, with the two things that turn a false miss into a success.
///
/// The failure this exists for reported its very first check as missing against packages that
/// were on disk the whole time, seconds after Bun finished reconciling a stale tree — the window
/// where Bun, the indexer, and the file system are all still touching what was just written. So
/// verification reads a second time after a pause before believing a miss, and when the tree
/// itself never arrived it lets Bun install once more instead of reporting a package as missing
/// that a second install would place. Only a third miss, after both, is reported — with every
/// path that was checked and what reading it actually said.
fn verify_dependencies(root: &Path, bun: &Path) -> Result<(), Problem> {
    if record_dependencies(root, bun).is_ok() {
        return Ok(());
    }
    std::thread::sleep(VERIFY_PAUSE);
    if record_dependencies(root, bun).is_ok() {
        return Ok(());
    }
    let repair = stack::install_dependencies(root, bun);
    let outcome = record_dependencies(root, bun);
    match (repair, outcome) {
        (Err(repair), Err(mut problem)) => {
            let detail = problem.detail.unwrap_or_default();
            problem.detail = Some(format!("{detail}\nA second install also failed: {repair}"));
            Err(problem)
        }
        (_, outcome) => outcome,
    }
}

fn read_dependencies(root: &Path) -> Result<Dependencies, Problem> {
    let bytes = std::fs::read(root.join(DEPENDENCIES)).map_err(|e| required(e.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|e| required(e.to_string()))
}

pub fn dependencies_ready(root: &Path) -> Result<PathBuf, Problem> {
    let record = read_dependencies(root)?;
    if record.fingerprint != dependency_fingerprint(root)?
        || record.package_files.iter().any(|file| !file.is_file())
    {
        return Err(required(
            "The installed dependencies are incomplete or the lockfile changed.",
        ));
    }
    // This executes only the installed runtime's version probe; it cannot install packages.
    crate::install::verify_bun(&record.bun)
        .map_err(|problem| required(problem.detail.unwrap_or(problem.said)))?;
    Ok(record.bun)
}

/// The recorded dependency fingerprint goes stale the moment a git pull changes the lockfile or
/// an install-relevant manifest key, while the installed tree itself is untouched: every
/// recorded package file is still a file and the recorded Bun is still on disk. Bouncing to the
/// Install screen to run the same frozen install that could have run here would acquire
/// nothing — Bun only re-verifies the tree against the new lockfile and the record is
/// refreshed — so when a stale fingerprint is the only problem, the repair runs silently and
/// the start continues. A missing recorded Bun, a missing recorded package file, or an
/// unreadable record are absences this path cannot conjure: those return the original problem,
/// and the Install screen's repair remains the answer.
fn dependencies_ready_or_repair(root: &Path) -> Result<PathBuf, Problem> {
    let problem = match dependencies_ready(root) {
        Ok(bun) => return Ok(bun),
        Err(problem) => problem,
    };
    let Ok(saved) = read_dependencies(root) else {
        return Err(problem);
    };
    if saved.fingerprint == dependency_fingerprint(root)?
        || saved.package_files.iter().any(|file| !file.is_file())
        || !saved.bun.is_file()
    {
        return Err(problem);
    }
    // Read before the repair runs: rewriting the dependencies file without rewriting the
    // prepared record that covers its bytes is the one way this repair could trade a stale
    // fingerprint for "The deployment folder or Bot selection changed after installation."
    let Some(prepared) = std::fs::read(root.join(FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Prepared>(&bytes).ok())
    else {
        return Err(problem);
    };
    if stack::install_dependencies(root, &saved.bun).is_err() {
        return Err(problem);
    }
    record_dependencies(root, &saved.bun)?;
    record(root, prepared.harness.as_ref(), prepared.images.clone())?;
    dependencies_ready(root)
}

pub fn image_present(address: &Address, image: &str) -> Result<bool, Problem> {
    address
        .command()
        .args(["image", "inspect", image])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .map_err(|e| required(format!("Could not check an installed image: {e}")))
}

pub fn require_images(address: &Address, images: &[String]) -> Result<(), Problem> {
    for image in images {
        if image_present(address, image)? {
            continue;
        }
        /*
         * An image the engine no longer has is a re-download before it is a failure.
         *
         * The engine can lose an image out from under a finished installation: a prune, a
         * reinstalled engine with a fresh empty store. The references recorded at install are
         * the exact digest-pinned ones, so downloading the same bytes again is the honest repair
         * and Install would only run this same pull. `pull_image` is the acquire path the
         * Install screen itself uses — the same missing-only policy, the same capability
         * probing — so a repaired start cannot turn into an acquisition the Install flow
         * would refuse.
         */
        match crate::pull_metrics::pull_image(address, image, |_| {}, |_| {}) {
            Ok(()) if image_present(address, image)? => continue,
            Ok(()) => {
                return Err(required(format!(
                    "The selected container engine does not have {image}. ORBO needs the \
                     container images it was installed with, so it tried to download {image} \
                     again, and the engine has still not placed it. Return to Install and try \
                     again."
                )))
            }
            Err(pull_problem) => {
                let engine_said = pull_problem
                    .detail
                    .unwrap_or_else(|| pull_problem.said.clone());
                return Err(required(format!(
                    "The selected container engine does not have {image}. ORBO needs the \
                     container images it was installed with, so it tried to download {image} \
                     again, and the engine refused. {engine_said}"
                )));
            }
        }
    }
    Ok(())
}

/// Written only after dependencies and every image have finished successfully.
pub fn record(
    root: &Path,
    harness: Option<&HarnessChoice>,
    images: Vec<String>,
) -> Result<(), Problem> {
    let deployment = deployment::installed(root).map(|installed| installed.version);
    write_record(
        root,
        FILE,
        &Prepared {
            fingerprint: fingerprint(root)?,
            harness: harness.cloned(),
            images,
            deployment,
        },
    )
}

pub fn complete(
    root: &Path,
    harness: Option<&HarnessChoice>,
    images: Vec<String>,
    address: &Address,
) -> Result<(), Problem> {
    complete_with(root, harness, images, |images| {
        require_images(address, images)
    })
}

fn complete_with(
    root: &Path,
    harness: Option<&HarnessChoice>,
    images: Vec<String>,
    verify: impl FnOnce(&[String]) -> Result<(), Problem>,
) -> Result<(), Problem> {
    dependencies_ready(root)?;
    verify(&images)?;
    record(root, harness, images)
}

/// `selection=None` is the auth check, which has no authority to change the Bot selection.
pub fn require(
    root: &Path,
    selection: Option<&Option<HarnessChoice>>,
    address: &Address,
) -> Result<PathBuf, Problem> {
    require_with(root, selection, |images| require_images(address, images))
}

fn require_with(
    root: &Path,
    selection: Option<&Option<HarnessChoice>>,
    verify: impl FnOnce(&[String]) -> Result<(), Problem>,
) -> Result<PathBuf, Problem> {
    let saved: Prepared = serde_json::from_slice(
        &std::fs::read(root.join(FILE)).map_err(|e| required(e.to_string()))?,
    )
    .map_err(|e| required(e.to_string()))?;
    /*
     * DECISION RULES FOR THE INSTALL-FINGERPRINT HEAL, written down so the next reader can audit
     * them against the code. The install fingerprint covers four files in full: the
     * `.orbo-deployment` stamp, `container-images.json`, `deploy/compose/docker-compose.yml`,
     * and `.orbo-dependencies.json`. Drift is repaired in place here only when EVERY one of
     * these holds:
     *
     *   1. The Bot selection is unchanged. Selection check below runs first and refuses
     *      regardless of anything else; a heal must never follow a selection change.
     *   2. The record notes which stamp version it was installed over (`record` has written
     *      that from this version on). A record that predates the field cannot prove where its
     *      fingerprint came from, so it is never healed.
     *   3. The stamp on disk now names a DIFFERENT version than the record notes. The stamp is
     *      written by exactly one thing — `deployment::fetch`, which rewrites the stamp, the
     *      image manifest and the Compose file together as one download — so a version change
     *      is the one drift shape a fetch produces and a hand edit does not imply.
     *   4. `stack::deployment_problem(root)` is None: the re-fetched layout is complete for the
     *      version on disk.
     *
     * Then the record is rewritten over what is on disk (this is `dependencies_ready_or_repair`'s
     * spirit: the repair records what is already there, it acquires nothing) and Start continues
     * with the images the record already names.
     *
     * EVERYTHING else keeps today's refusal with today's message:
     *   - a fingerprinted file changed while the stamp version stayed the same (Compose or the
     *     manifest edited by hand, or a dependency record rewritten outside a fetch);
     *   - the stamp unreadable or absent, because that tree is not a fetch's output;
     *   - a legacy record with no stamp version noted;
     *   - a changed selection, always.
     */
    if selection.is_some_and(|selection| selection != &saved.harness) {
        return Err(required(
            "The deployment folder or Bot selection changed after installation.",
        ));
    }
    if saved.fingerprint != fingerprint(root)? {
        let refetched = saved.deployment.as_ref().is_some_and(|installed_with| {
            deployment::installed(root).is_some_and(|stamp| &stamp.version != installed_with)
        }) && stack::deployment_problem(root).is_none();
        if !refetched {
            return Err(required(
                "The deployment folder or Bot selection changed after installation.",
            ));
        }
        record(root, saved.harness.as_ref(), saved.images.clone())?;
    }
    if let Some(problem) = stack::deployment_problem(root) {
        return Err(required(problem));
    }
    let bun = dependencies_ready_or_repair(root)?;
    verify(&saved.images)?;
    Ok(bun)
}

/// Public Compose overrides suffice to identify and download software before authentication.
pub fn image_settings(
    root: &Path,
    picked: Option<&crate::env::PickedHarness>,
) -> Result<stack::Secrets, Problem> {
    let mut settings: stack::Secrets = deployment::image_variables(root)?.into_iter().collect();
    settings.insert("IMAGE_PULL_POLICY".into(), "missing".into());
    // The deployment's Compose file requires these two before it will render, and they are minted
    // into the deployment's `.env` only when configuration completes — after this check. Values
    // here exist so Compose can interpolate the file and name its images; they are written
    // nowhere, and the real ones are minted later.
    for key in ["ORBO_COMPUTER_TOKEN", "SUPERVISOR_TOKEN"] {
        settings
            .entry(key.into())
            .or_insert_with(|| format!("orbo-image-check-{:016x}", rand::random::<u64>()));
    }
    if let Some(crate::env::PickedHarness::Installed { image, port, .. }) = picked {
        settings.insert("PICKED_HARNESS_IMAGE".into(), image.clone());
        settings.insert("PICKED_HARNESS_PORT".into(), port.to_string());
    }
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        bun: PathBuf,
    }

    /// Bun exits non-zero without completing the tree: a failed install, reported as one.
    const INSTALL_EXITS_INCOMPLETE: &str = r#"
use std::io::Write;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        let version = std::env::current_exe().unwrap().parent().unwrap().join("runtime-version");
        println!("{}", std::fs::read_to_string(version).unwrap_or_else(|_| "1.3.14".into()));
        return;
    }
    assert_eq!(args, ["install", "--frozen-lockfile", "--ignore-scripts"]);
    let previous = std::fs::read_to_string("installs").unwrap_or_default();
    writeln!(std::fs::OpenOptions::new().create(true).append(true).open("installs").unwrap(), "install").unwrap();
    std::fs::create_dir_all("node_modules/synthetic-package").unwrap();
    if previous.is_empty() { std::process::exit(71); }
    std::fs::write("node_modules/synthetic-package/package.json", "{}").unwrap();
}
"#;

    /// The shape verification retries exist for: Bun exits successfully, but the package is not
    /// readable until the next run — a tree that verification must repair, not report.
    const CLEAN_EXIT_PACKAGE_ARRIVES_LATER: &str = r#"
use std::io::Write;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        let version = std::env::current_exe().unwrap().parent().unwrap().join("runtime-version");
        println!("{}", std::fs::read_to_string(version).unwrap_or_else(|_| "1.3.14".into()));
        return;
    }
    assert_eq!(args, ["install", "--frozen-lockfile", "--ignore-scripts"]);
    let previous = std::fs::read_to_string("installs").unwrap_or_default();
    writeln!(std::fs::OpenOptions::new().create(true).append(true).open("installs").unwrap(), "install").unwrap();
    std::fs::create_dir_all("node_modules/synthetic-package").unwrap();
    if previous.is_empty() { return; }
    std::fs::write("node_modules/synthetic-package/package.json", "{}").unwrap();
}
"#;

    /// Bun exits successfully every time and never places the package at all.
    const CLEAN_EXIT_PACKAGE_NEVER_ARRIVES: &str = r#"
use std::io::Write;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        let version = std::env::current_exe().unwrap().parent().unwrap().join("runtime-version");
        println!("{}", std::fs::read_to_string(version).unwrap_or_else(|_| "1.3.14".into()));
        return;
    }
    assert_eq!(args, ["install", "--frozen-lockfile", "--ignore-scripts"]);
    writeln!(std::fs::OpenOptions::new().create(true).append(true).open("installs").unwrap(), "install").unwrap();
    std::fs::create_dir_all("node_modules/synthetic-package").unwrap();
}
"#;

    /// Bun exits successfully every time and places the package: the tree a stale-fingerprint
    /// repair re-verifies without acquiring anything.
    const INSTALL_SUCCEEDS: &str = r#"
use std::io::Write;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--version"] {
        let version = std::env::current_exe().unwrap().parent().unwrap().join("runtime-version");
        println!("{}", std::fs::read_to_string(version).unwrap_or_else(|_| "1.3.14".into()));
        return;
    }
    assert_eq!(args, ["install", "--frozen-lockfile", "--ignore-scripts"]);
    writeln!(std::fs::OpenOptions::new().create(true).append(true).open("installs").unwrap(), "install").unwrap();
    std::fs::create_dir_all("node_modules/synthetic-package").unwrap();
    std::fs::write("node_modules/synthetic-package/package.json", "{}").unwrap();
}
"#;

    impl Fixture {
        fn new() -> Self {
            Self::with_runtime(INSTALL_EXITS_INCOMPLETE)
        }

        fn with_runtime(script: &str) -> Self {
            let root = crate::test_support::temp_root("preparation");
            for package in PACKAGES {
                std::fs::create_dir_all(root.join(package)).unwrap();
                std::fs::write(
                    root.join(package).join("package.json"),
                    r#"{"scripts":{"serve":"bun serve.ts"}}"#,
                )
                .unwrap();
            }
            let root = std::fs::canonicalize(root).unwrap();
            std::fs::write(
                root.join("package.json"),
                r#"{"dependencies":{"synthetic-package":"1"}}"#,
            )
            .unwrap();
            std::fs::write(root.join("bun.lock"), "synthetic-lock").unwrap();
            std::fs::create_dir_all(root.join("deploy/compose")).unwrap();
            std::fs::write(
                root.join("deploy/compose/docker-compose.yml"),
                "services: {}\n",
            )
            .unwrap();
            std::fs::write(root.join("container-images.json"), "{}").unwrap();
            deployment::record(&root, "v-test").unwrap();
            let source = root.join("runtime.rs");
            std::fs::write(&source, script).unwrap();
            let bun = root.join(format!("runtime{}", std::env::consts::EXE_SUFFIX));
            crate::test_support::compile_fixture(&source, &bun);
            Self { root, bun }
        }

        fn dependencies(&self) {
            std::fs::create_dir_all(self.root.join("node_modules/synthetic-package")).unwrap();
            std::fs::write(
                self.root
                    .join("node_modules/synthetic-package/package.json"),
                "{}",
            )
            .unwrap();
            record_dependencies(&self.root, &self.bun).unwrap();
        }

        fn prepared(&self, harness: Option<&HarnessChoice>) {
            self.dependencies();
            complete_with(&self.root, harness, vec!["synthetic-image".into()], |_| {
                Ok(())
            })
            .unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.root).unwrap();
        }
    }

    #[test]
    fn failed_dependencies_retry_then_auth_reuses_success_without_installing() {
        let f = Fixture::new();
        std::fs::write(f.root.join(".env"), "KEEP_THIS_PUBLIC_SETTING=yes\n").unwrap();
        let install = || install_dependencies_if_needed(&f.root, || Ok(f.bun.clone()));
        assert!(install().is_err());
        assert!(!f.root.join(DEPENDENCIES).exists());
        assert!(f.root.join("node_modules").is_dir());
        install().unwrap();
        install_dependencies_if_needed(&f.root, || panic!("cached runtime must be reused"))
            .unwrap();
        f.prepared(None);
        for _ in 0..2 {
            require_with(&f.root, None, |images| {
                assert_eq!(images, ["synthetic-image"]);
                Ok(())
            })
            .unwrap();
        }
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap(),
            "install\ninstall\n"
        );
        assert_eq!(
            std::fs::read_to_string(f.root.join(".env")).unwrap(),
            "KEEP_THIS_PUBLIC_SETTING=yes\n"
        );
    }

    /// The regression the pause and repair exist for: Bun exits successfully without placing the
    /// package, and the record is completed by the repair instead of reported as missing.
    #[test]
    fn a_clean_exit_missing_its_package_is_repaired_instead_of_reported() {
        let f = Fixture::with_runtime(CLEAN_EXIT_PACKAGE_ARRIVES_LATER);
        install_dependencies_if_needed(&f.root, || Ok(f.bun.clone())).unwrap();
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap(),
            "install\ninstall\n"
        );
        assert!(f.root.join(DEPENDENCIES).is_file());
    }

    /// Three misses — after the pause and after one repair — are a real failure, and the message
    /// says which paths were read and what reading them said.
    #[test]
    fn a_package_that_never_arrives_reports_every_path_that_was_checked() {
        let f = Fixture::with_runtime(CLEAN_EXIT_PACKAGE_NEVER_ARRIVES);
        let problem = install_dependencies_if_needed(&f.root, || Ok(f.bun.clone()))
            .expect_err("a tree Bun never completes cannot pass verification");
        let detail = problem.detail.unwrap_or_default();
        assert!(
            detail.contains("The installed package synthetic-package is missing"),
            "{detail}"
        );
        assert!(detail.contains("node_modules"), "{detail}");
        assert!(detail.contains("package.json"), "{detail}");
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap(),
            "install\ninstall\n",
            "one repair, not an endless loop of installs"
        );
        assert!(!f.root.join(DEPENDENCIES).exists());
    }

    #[test]
    fn cached_dependencies_with_unsupported_runtime_require_installation_before_start() {
        let f = Fixture::new();
        f.dependencies();
        std::fs::write(f.root.join("runtime-version"), "1.2.15").unwrap();
        let problem = dependencies_ready(&f.root).expect_err("a cached older runtime is not ready");
        assert!(problem.said.contains("Finish installing"));
        assert!(problem
            .detail
            .unwrap_or_default()
            .contains(crate::install::BUN));
    }

    #[test]
    fn failed_image_preparation_cannot_publish_completion() {
        let f = Fixture::new();
        f.dependencies();
        let result = complete_with(&f.root, None, vec!["missing-image".into()], |_| {
            Err(required("missing image"))
        });
        assert!(result.is_err());
        assert!(!f.root.join(FILE).exists());
        assert!(installation(&f.root).is_none());
        complete_with(&f.root, None, vec!["now-present".into()], |_| Ok(())).unwrap();
        assert!(f.root.join(FILE).is_file());
        assert!(installation(&f.root).is_some());
        assert!(
            launch(&f.root).is_none(),
            "installation does not authorize automatic Start"
        );
    }

    #[test]
    fn changed_bot_lockfile_or_deleted_package_requires_installation() {
        let f = Fixture::new();
        let chosen = Some(HarnessChoice {
            id: "langgraph".into(),
            agent_url: None,
        });
        f.prepared(chosen.as_ref());
        require_with(&f.root, Some(&chosen), |_| Ok(())).unwrap();
        assert!(require_with(&f.root, Some(&None), |_| panic!(
            "wrong selection must stop first"
        ))
        .is_err());
        std::fs::remove_file(f.root.join("node_modules/synthetic-package/package.json")).unwrap();
        assert!(require_with(&f.root, Some(&chosen), |_| Ok(())).is_err());
        f.dependencies();
        f.prepared(chosen.as_ref());
        std::fs::write(f.root.join("bun.lock"), "changed-lock").unwrap();
        assert!(require_with(&f.root, Some(&chosen), |_| Ok(())).is_err());
    }

    /// The stale-fingerprint start: the tree and the recorded Bun are intact, so the start
    /// repairs the record with the same frozen install instead of bouncing to Install, and the
    /// prepared record's fingerprint follows the dependencies file it covers.
    #[test]
    fn a_stale_fingerprint_with_an_intact_tree_repairs_in_place_and_the_start_continues() {
        let f = Fixture::with_runtime(INSTALL_SUCCEEDS);
        f.prepared(None);
        std::fs::write(f.root.join("bun.lock"), "changed-lock").unwrap();
        require_with(&f.root, None, |images| {
            assert_eq!(images, ["synthetic-image"]);
            Ok(())
        })
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap(),
            "install\n",
            "the repair ran the frozen install exactly once"
        );
        require_with(&f.root, None, |_| Ok(())).unwrap();
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap(),
            "install\n",
            "the re-recorded fingerprint holds; the next start repairs nothing"
        );
    }

    /// A missing recorded package file is a real absence, not a stale fingerprint: the bounce to
    /// Install keeps its exact message and no install is ever attempted.
    #[test]
    fn a_missing_package_file_keeps_the_install_screen_and_installs_nothing() {
        let f = Fixture::with_runtime(INSTALL_SUCCEEDS);
        f.prepared(None);
        std::fs::write(f.root.join("bun.lock"), "changed-lock").unwrap();
        std::fs::remove_file(f.root.join("node_modules/synthetic-package/package.json")).unwrap();
        let problem = require_with(&f.root, None, |_| {
            panic!("the dependency problem stops first")
        })
        .expect_err("a missing package must not start");
        assert_eq!(
            problem.detail.as_deref(),
            Some("The installed dependencies are incomplete or the lockfile changed.")
        );
        assert!(
            !f.root.join("installs").exists(),
            "the repair must not attempt an install without the whole tree on disk"
        );
    }

    /// The install-fingerprint heal: a fetch re-recorded the deployment (the stamp moved, and
    /// only a fetch writes it), so the start re-records the installation over the re-fetched
    /// tree instead of bouncing to Install, and the start continues with what it already has.
    #[test]
    fn a_refetched_deployment_repairs_the_install_record_and_the_start_continues() {
        let f = Fixture::with_runtime(INSTALL_SUCCEEDS);
        f.prepared(None);
        deployment::record(&f.root, "v-other").unwrap();
        require_with(&f.root, None, |images| {
            assert_eq!(images, ["synthetic-image"]);
            Ok(())
        })
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap_or_default(),
            "",
            "the heal records what is on disk; it acquires nothing"
        );
        // The re-record followed the re-fetched tree, so the start after it repairs nothing.
        require_with(&f.root, None, |_| Ok(())).unwrap();
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap_or_default(),
            ""
        );
    }

    /// A fingerprinted file changed while the stamp holds the version the record was installed
    /// over: a hand edit or an outside rewrite, never a fetch, so the refusal keeps its exact
    /// message and nothing is re-recorded.
    #[test]
    fn a_fingerprinted_edit_without_a_fetch_keeps_the_install_screen() {
        let f = Fixture::with_runtime(INSTALL_SUCCEEDS);
        f.prepared(None);
        std::fs::write(
            f.root.join("deploy/compose/docker-compose.yml"),
            "services: {}\n# edited by hand, with no fetch in sight\n",
        )
        .unwrap();
        let problem = require_with(&f.root, None, |_| {
            panic!("a hand edit must not start, and must not be re-recorded")
        })
        .expect_err("an edited fingerprint is not a fetch");
        assert_eq!(
            problem.detail.as_deref(),
            Some("The deployment folder or Bot selection changed after installation.")
        );
        // The refusal is stable: healing it twice would dismiss the edit once and for all.
        assert!(require_with(&f.root, None, |_| panic!("still refused")).is_err());
        assert_eq!(
            std::fs::read_to_string(f.root.join("installs")).unwrap_or_default(),
            ""
        );
    }

    /// A record written before it noted its stamp proves nothing about where its fingerprint
    /// came from, so the heal never touches it: Install remains the answer.
    #[test]
    fn a_legacy_install_record_without_a_stamp_is_never_healed() {
        let f = Fixture::with_runtime(INSTALL_SUCCEEDS);
        f.dependencies();
        deployment::record(&f.root, "v-later").unwrap();
        std::fs::write(
            f.root.join(FILE),
            serde_json::to_vec(&serde_json::json!({
                "fingerprint": "a fingerprint this tree cannot reproduce",
                "harness": serde_json::Value::Null,
                "images": ["synthetic-image"],
            }))
            .unwrap(),
        )
        .unwrap();
        let problem = require_with(&f.root, None, |_| panic!("a legacy record never heals"))
            .expect_err("a record with no noted stamp cannot be healed");
        assert_eq!(
            problem.detail.as_deref(),
            Some("The deployment folder or Bot selection changed after installation.")
        );
    }

    /// A stand-in engine for the Start-time re-download: an image exists only while the fixture
    /// has written its marker file, a pull places one unless its name declines to.
    const PULLING_ENGINE: &str = r#"
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let home = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let marker = |image: &str| home.join(image.replace(['/', ':'], "-"));
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["image", "inspect", image] => std::process::exit(if marker(image).is_file() { 0 } else { 1 }),
        ["compose", "pull", "--help"] => std::process::exit(1),
        ["pull", image] => {
            if image.contains("broken") {
                eprintln!("synthetic engine refusal");
                std::process::exit(71);
            }
            if image.contains("stuck") { return; }
            std::fs::write(marker(image), "pulled").unwrap();
        }
        _ => panic!("unreachable engine call: {args:?}"),
    }
}
"#;

    /// An image the engine lost is downloaded again at Start with the same acquire path the
    /// Install screen uses; a pull that fails, or that places nothing, keeps the Install bounce.
    #[test]
    fn a_missing_image_at_start_is_downloaded_again_and_only_a_failed_pull_bounces() {
        if crate::test_support::isolated_process(
            "preparation::tests::a_missing_image_at_start_is_downloaded_again_and_only_a_failed_pull_bounces",
        ) {
            return;
        }
        let root = crate::test_support::temp_root("preparation-image-refetch");
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("docker.rs");
        std::fs::write(&source, PULLING_ENGINE).unwrap();
        crate::test_support::compile_fixture(
            &source,
            &root.join(format!("docker{}", std::env::consts::EXE_SUFFIX)),
        );
        std::env::set_var("PATH", &root);
        let address = crate::engine::Address::new(crate::engine::Engine::Docker, None);
        let images = |name: &str| vec![name.to_string()];

        let refusal = require_images(&address, &images("example/broken@sha256:0000"))
            .expect_err("a pull the engine refuses keeps the Install bounce");
        assert_eq!(refusal.said, REQUIRED);
        let detail = refusal.detail.unwrap_or_default();
        assert!(
            detail.contains("does not have example/broken@sha256:0000"),
            "{detail}"
        );
        assert!(
            detail.contains("container images it was installed with"),
            "{detail}"
        );
        assert!(detail.contains("synthetic engine refusal"), "{detail}");

        // A pull the engine carries out places the digest-pinned reference exactly as recorded,
        // and the start then continues instead of bouncing.
        require_images(&address, &images("example/pullable@sha256:0000")).unwrap();

        // An engine that reports success without placing anything still keeps Install involved.
        let phantom = require_images(&address, &images("example/stuck@sha256:0000"))
            .expect_err("a pull that places nothing is a failure");
        assert_eq!(phantom.said, REQUIRED);
        let detail = phantom.detail.unwrap_or_default();
        assert!(detail.contains("still not placed"), "{detail}");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn successful_launch_remembers_exact_root_and_bot_without_credentials() {
        let f = Fixture::new();
        let chosen = HarnessChoice {
            id: "byo-url".into(),
            agent_url: Some("https://agent.example/ag-ui".into()),
        };
        f.prepared(Some(&chosen));
        let config = f.root.join("app-config");
        assert!(launch(&f.root).is_none());
        record_launch(&f.root, Some(&chosen)).unwrap();
        save_selected_root(&config, &f.root).unwrap();
        assert_eq!(selected_root(&config), Some(f.root.clone()));
        assert_eq!(launch(&f.root).unwrap().harness, Some(chosen));
        std::fs::remove_file(f.root.join("node_modules/synthetic-package/package.json")).unwrap();
        assert!(
            launch(&f.root).is_some(),
            "resume intent survives missing assets for explicit install recovery"
        );
        invalidate(&f.root).unwrap();
        assert!(launch(&f.root).is_none());
        assert_eq!(
            selected_root(&config),
            Some(f.root.clone()),
            "repair must not forget the last successful folder"
        );
    }

    #[test]
    fn image_settings_carries_the_tokens_compose_requires_before_they_are_minted() {
        let root = crate::test_support::temp_root("image-settings-tokens");
        std::fs::create_dir_all(&root).unwrap();
        let digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
        std::fs::write(
            root.join("container-images.json"),
            format!(
                r#"{{
                    "version": "v-test",
                    "images": {{
                        "server": {{"reference": "example/server@{digest}"}},
                        "supervisor": {{"reference": "example/supervisor@{digest}"}},
                        "orbo-computer": {{"reference": "example/computer@{digest}"}},
                        "orbo-bot": {{"reference": "example/bot@{digest}"}},
                        "orbo-langgraph": {{"reference": "example/langgraph@{digest}"}}
                    }}
                }}"#
            ),
        )
        .unwrap();
        let first = image_settings(&root, None).unwrap();
        for key in ["ORBO_COMPUTER_TOKEN", "SUPERVISOR_TOKEN"] {
            let value = first
                .get(key)
                .unwrap_or_else(|| panic!("{key} must be set for Compose to render the file"));
            assert!(!value.is_empty(), "{key} must be a value, not blank");
        }
        assert_ne!(
            first["ORBO_COMPUTER_TOKEN"], first["SUPERVISOR_TOKEN"],
            "each requirement gets its own value"
        );
        let second = image_settings(&root, None).unwrap();
        assert_ne!(
            first["ORBO_COMPUTER_TOKEN"], second["ORBO_COMPUTER_TOKEN"],
            "the values are throwaways, not something minted once here"
        );
        assert_eq!(
            first.get("IMAGE_PULL_POLICY").map(String::as_str),
            Some("missing")
        );
        assert_eq!(first["SERVER_IMAGE"], format!("example/server@{digest}"));
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A minimal installation root for fingerprint-only tests: the same package layout the
    /// Fixture builds, without compiling a stand-in runtime.
    fn fingerprint_root(label: &str) -> PathBuf {
        let root = crate::test_support::temp_root(label);
        for package in PACKAGES {
            std::fs::create_dir_all(root.join(package)).unwrap();
            std::fs::write(
                root.join(package).join("package.json"),
                r#"{"scripts":{"serve":"bun serve.ts"}}"#,
            )
            .unwrap();
        }
        let root = std::fs::canonicalize(root).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.1.0","dependencies":{"synthetic-package":"1"}}"#,
        )
        .unwrap();
        std::fs::write(root.join("bun.lock"), "synthetic-lock").unwrap();
        root
    }

    /// The regression this fingerprint exists for: a git pull that bumps the release version
    /// must not invalidate a perfectly good dependency install.
    #[test]
    fn a_version_bump_alone_does_not_change_the_dependency_fingerprint() {
        let root = fingerprint_root("fingerprint-version");
        let before = dependency_fingerprint(&root).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.2.0","dependencies":{"synthetic-package":"1"}}"#,
        )
        .unwrap();
        assert_eq!(dependency_fingerprint(&root).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_changed_description_alone_does_not_change_the_dependency_fingerprint() {
        let root = fingerprint_root("fingerprint-description");
        let before = dependency_fingerprint(&root).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.1.0","description":"ORBO desktop","dependencies":{"synthetic-package":"1"}}"#,
        )
        .unwrap();
        assert_eq!(dependency_fingerprint(&root).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_changed_workspace_list_changes_the_dependency_fingerprint() {
        let root = fingerprint_root("fingerprint-workspaces");
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.1.0","workspaces":["server","app"],"dependencies":{"synthetic-package":"1"}}"#,
        )
        .unwrap();
        let before = dependency_fingerprint(&root).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.1.0","workspaces":["server","app","worker"],"dependencies":{"synthetic-package":"1"}}"#,
        )
        .unwrap();
        assert_ne!(dependency_fingerprint(&root).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_changed_dependency_version_changes_the_dependency_fingerprint() {
        let root = fingerprint_root("fingerprint-dependency");
        let before = dependency_fingerprint(&root).unwrap();
        std::fs::write(
            root.join("package.json"),
            r#"{"name":"orbo","version":"0.1.0","dependencies":{"synthetic-package":"2"}}"#,
        )
        .unwrap();
        assert_ne!(dependency_fingerprint(&root).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Garbage must never be treated as matching a recorded install: an unparseable
    /// package.json falls back to its raw bytes, and that fallback is at least deterministic.
    #[test]
    fn an_unparseable_package_json_falls_back_to_deterministic_raw_bytes() {
        let root = fingerprint_root("fingerprint-corrupt");
        let parsed = dependency_fingerprint(&root).unwrap();
        std::fs::write(root.join("package.json"), "not json {").unwrap();
        let first = dependency_fingerprint(&root).unwrap();
        let second = dependency_fingerprint(&root).unwrap();
        assert_eq!(first, second);
        assert_ne!(first, parsed);
        std::fs::remove_dir_all(root).unwrap();
    }
}
