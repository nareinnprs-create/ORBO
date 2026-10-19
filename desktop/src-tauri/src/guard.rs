//! Starting the app the way the installer offers to start it, without the file guard the
//! installer hands over with it.
//!
//! The installer's finish dialog launches ORBO from the elevated installer chain, and Windows 11
//! passes that chain's redirection guard down with it. The guarded copy refuses to traverse the
//! package links `bun` plants in `node_modules` - every link is stamped untrusted because a
//! non-elevated creator made it - so the Install step reports a package missing with
//! "The path cannot be traversed because it contains an untrusted mount point" (os error 448),
//! and `bun` itself quietly resolves those packages somewhere else entirely. The guard cannot be
//! switched off once a process has it, and everything this process starts inherits it, so the
//! only honest fix is to not be that process.
//!
//! On startup the app checks the guard, and if it is on, hands itself to the running desktop
//! shell through a shortcut: the shell starts the new copy without the guard, the new copy
//! signals that it is alive and waits out this one, and this one exits before any window exists.
//! A marker argument keeps the new copy from ever relaunching itself, so a machine where the
//! shell route fails degrades to one guarded copy running, not a loop.

use std::path::PathBuf;

#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::time::{Duration, Instant};

/// Where `GetProcessMitigationPolicy` keeps this policy. It is `ProcessRedirectionTrustPolicy`
/// in the SDK's `PROCESS_MITIGATION_POLICY` enumeration (winnt.h), not a number to guess at.
#[cfg(windows)]
const REDIRECTION_TRUST_POLICY: i32 = 16;

/// The guard is already part of this process; the arguments say which copy relaunched us.
const RELAUNCH_OF: &str = "--orbo-relaunch-of=";
const RELAUNCH_LNK: &str = "--orbo-relaunch-lnk=";

#[cfg(windows)]
const RELAUNCH_DEADLINE: Duration = Duration::from_secs(10);

#[cfg(windows)]
const SYNCHRONIZE: u32 = 0x0010_0000;
#[cfg(windows)]
const WAIT_OBJECT_0: u32 = 0;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentProcess() -> *mut core::ffi::c_void;
    fn GetProcessMitigationPolicy(
        process: *mut core::ffi::c_void,
        policy: i32,
        buffer: *mut u32,
        length: usize,
    ) -> i32;
    fn OpenProcess(access: u32, inherit_handle: i32, pid: u32) -> *mut core::ffi::c_void;
    fn WaitForSingleObject(handle: *mut core::ffi::c_void, millis: u32) -> u32;
    fn CloseHandle(object: *mut core::ffi::c_void) -> i32;
}

/// What a relaunch handed the new copy: the process to wait out, and this copy's shortcut.
#[derive(Debug, PartialEq, Eq)]
pub struct Relaunch {
    pub parent: u32,
    pub lnk: PathBuf,
}

/// Reads the two arguments a relaunched copy carries, or `None` for a plain launch.
pub fn relaunch_from_args<I, S>(args: I) -> Option<Relaunch>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut parent = None;
    let mut lnk = None;
    for arg in args {
        let arg = arg.as_ref();
        if let Some(value) = arg.strip_prefix(RELAUNCH_OF) {
            parent = value.parse().ok();
        } else if let Some(value) = arg.strip_prefix(RELAUNCH_LNK) {
            lnk = Some(PathBuf::from(value));
        }
    }
    match (parent, lnk) {
        (Some(parent), Some(lnk)) => Some(Relaunch { parent, lnk }),
        _ => None,
    }
}

/// Joins arguments into the one string a shortcut stores, quoting what the shell would split.
pub fn shortcut_arguments<I, S>(args: I) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .map(|arg| {
            let arg = arg.as_ref();
            if arg.is_empty() {
                return String::from("\"\"");
            }
            if arg.chars().any(|c| matches!(c, ' ' | '\t' | '"')) {
                format!("\"{}\"", arg.replace('"', "\\\""))
            } else {
                arg.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The first thing `main` does, on every platform and every launch.
pub fn settle_before_launch() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(relaunch) = relaunch_from_args(&args) {
        finish_relaunch(&relaunch);
        return;
    }
    start_if_guarded(&args);
}

#[cfg(windows)]
fn start_if_guarded(args: &[String]) {
    if redirection_enforced() {
        start_relaunch(args);
    }
}

#[cfg(not(windows))]
fn start_if_guarded(_args: &[String]) {}

#[cfg(windows)]
fn finish_relaunch(relaunch: &Relaunch) {
    let ok = ok_file(relaunch.parent);
    // Prove this copy is alive before the original gives up its window-less wait for us.
    let _ = std::fs::write(&ok, b"ready");
    if !wait_until_gone(relaunch.parent, RELAUNCH_DEADLINE) {
        eprintln!(
            "[guard] relaunched while the original copy still runs; the shell will resolve it"
        );
    }
    let _ = std::fs::remove_file(&relaunch.lnk);
    let _ = std::fs::remove_file(&ok);
}

#[cfg(not(windows))]
fn finish_relaunch(_relaunch: &Relaunch) {}

#[cfg(windows)]
fn start_relaunch(args: &[String]) {
    let parent = std::process::id();
    let lnk = std::env::temp_dir().join(format!("orbo-relaunch-{parent}.lnk"));
    let ok = ok_file(parent);
    let _ = std::fs::remove_file(&lnk);
    let _ = std::fs::remove_file(&ok);

    let mut child_args: Vec<String> = args.iter().skip(1).cloned().collect();
    child_args.push(format!("{RELAUNCH_OF}{parent}"));
    child_args.push(format!("{}{}", RELAUNCH_LNK, lnk.display()));

    if let Err(error) = write_shortcut(&lnk, &shortcut_arguments(&child_args)) {
        eprintln!("[guard] shortcut failed ({error}); starting with the guard in place");
        return;
    }
    // The running desktop shell is not guarded, so the copy it starts from the shortcut is not
    // either. Its own explorer would inherit the guard from us, which is why the shell must
    // already exist; without one, the timeout below leaves a guarded copy rather than none.
    if let Err(error) = crate::quiet::command("explorer.exe").arg(&lnk).spawn() {
        eprintln!("[guard] shell launch failed ({error}); starting with the guard in place");
        return;
    }
    if wait_for_file(&ok, RELAUNCH_DEADLINE) {
        std::process::exit(0);
    }
    eprintln!("[guard] no relaunched copy appeared in time; starting with the guard in place");
}

#[cfg(windows)]
fn redirection_enforced() -> bool {
    let mut flags: u32 = 0;
    let set = unsafe {
        GetProcessMitigationPolicy(
            GetCurrentProcess(),
            REDIRECTION_TRUST_POLICY,
            &mut flags,
            size_of::<u32>(),
        )
    };
    set != 0 && flags & 1 != 0
}

#[cfg(windows)]
fn ok_file(parent: u32) -> PathBuf {
    std::env::temp_dir().join(format!("orbo-relaunch-{parent}.ok"))
}

#[cfg(windows)]
fn write_shortcut(lnk: &Path, arguments: &str) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    let cwd = std::env::current_dir().unwrap_or_else(|_| {
        exe.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    });
    let script = format!(
        "$s = New-Object -ComObject WScript.Shell; \
         $l = $s.CreateShortcut('{lnk}'); \
         $l.TargetPath = '{exe}'; \
         $l.Arguments = '{arguments}'; \
         $l.WorkingDirectory = '{cwd}'; \
         $l.Save()",
        lnk = single_quote(&lnk.display().to_string()),
        exe = single_quote(&exe.display().to_string()),
        arguments = single_quote(arguments),
        cwd = single_quote(&cwd.display().to_string()),
    );
    let output = crate::quiet::command("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output()?;
    if output.status.success() && lnk.exists() {
        return Ok(());
    }
    Err(std::io::Error::other(
        crate::quiet::said(&output.stderr).trim().to_string(),
    ))
}

#[cfg(windows)]
fn single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(windows)]
fn wait_until_gone(pid: u32, deadline: Duration) -> bool {
    let started = Instant::now();
    loop {
        unsafe {
            let handle = OpenProcess(SYNCHRONIZE, 0, pid);
            if handle.is_null() {
                return true;
            }
            let outcome = WaitForSingleObject(handle, 250);
            CloseHandle(handle);
            if outcome == WAIT_OBJECT_0 {
                return true;
            }
        }
        if started.elapsed() >= deadline {
            return false;
        }
    }
}

#[cfg(windows)]
fn wait_for_file(path: &Path, deadline: Duration) -> bool {
    let started = Instant::now();
    while !path.exists() {
        if started.elapsed() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaunch_arguments_are_recognised() {
        let relaunch = relaunch_from_args([
            "orbo-desktop.exe",
            "--orbo-relaunch-of=4321",
            "--orbo-relaunch-lnk=C:\\Temp\\orbo-relaunch-4321.lnk",
        ])
        .expect("both arguments together are a relaunch");
        assert_eq!(relaunch.parent, 4321);
        assert_eq!(
            relaunch.lnk,
            PathBuf::from("C:\\Temp\\orbo-relaunch-4321.lnk")
        );
    }

    #[test]
    fn either_argument_alone_is_not_a_relaunch() {
        assert!(relaunch_from_args(["--orbo-relaunch-of=4321"]).is_none());
        assert!(relaunch_from_args(["--orbo-relaunch-lnk=x.lnk"]).is_none());
        assert!(relaunch_from_args(["plain", "launch"]).is_none());
    }

    #[test]
    fn a_malformed_parent_is_not_a_relaunch() {
        assert!(
            relaunch_from_args(["--orbo-relaunch-of=not-a-pid", "--orbo-relaunch-lnk=x.lnk"])
                .is_none()
        );
    }

    #[test]
    fn shortcut_arguments_quote_what_the_shell_would_split() {
        assert_eq!(
            shortcut_arguments(["plain", "two words", "say \"hi\""]),
            "plain \"two words\" \"say \\\"hi\\\"\""
        );
        assert_eq!(shortcut_arguments([""]), "\"\"");
    }

    #[test]
    fn launch_without_the_guard_changes_nothing() {
        settle_before_launch();
    }
}
