//! Tauri integration for the setup emitter. Network work stays off the event loop.
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use orbo_desktop_lib::{engine, quiet, telemetry};
use tauri::Manager;

pub struct DesktopTelemetry {
    emitter: Arc<telemetry::Telemetry>,
    runtime_env: Mutex<BTreeMap<String, String>>,
}

/// The operator's telemetry endpoint, when one is configured.
///
/// Setup telemetry is OFF unless an operator turns it on by name — either explicitly through
/// `ORBO_TELEMETRY_ENABLED`, or implicitly by naming a target through `ORBO_TELEMETRY_URL`.
/// `DO_NOT_TRACK` stays the always-wins kill switch. In debug builds the pre-rename
/// `COPILOTKIT_TELEMETRY_*` names still answer, loudly saying where they are going.
fn opt_in() -> Option<String> {
    let url = std::env::var("ORBO_TELEMETRY_URL")
        .ok()
        .filter(|value| !value.trim().is_empty());
    #[cfg(debug_assertions)]
    if std::env::var("COPILOTKIT_TELEMETRY_URL")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        eprintln!(
            "[telemetry] COPILOTKIT_TELEMETRY_URL is deprecated; set ORBO_TELEMETRY_URL instead"
        );
        return std::env::var("COPILOTKIT_TELEMETRY_URL")
            .ok()
            .filter(|value| !value.trim().is_empty());
    }
    url
}

fn explicitly_enabled() -> bool {
    match std::env::var("ORBO_TELEMETRY_ENABLED") {
        Ok(value) => matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true"),
        Err(_) => false,
    }
}

/// The runtime still speaks the pre-rebrand env names: the third-party CopilotKit runtime reads
/// `COPILOTKIT_TELEMETRY_*` literals directly (gate, sink URL, sample rate), and the identity
/// crosses as `CPK_TELEMETRY_ID`. Remove all of these with the runtime, in wave 3.
const RUNTIME_BRIDGE: [(&str, &str); 4] = [
    ("ORBO_TELEMETRY_DISABLED", "COPILOTKIT_TELEMETRY_DISABLED"),
    (
        "ORBO_TELEMETRY_SAMPLE_RATE",
        "COPILOTKIT_TELEMETRY_SAMPLE_RATE",
    ),
    ("ORBO_TELEMETRY_URL", "COPILOTKIT_TELEMETRY_URL"),
    ("DO_NOT_TRACK", "DO_NOT_TRACK"),
];

/// Debug-only legacy operator inputs, the way the same names are honored for pre-rename setups
/// elsewhere: a warning is printed, and everything goes back over the `ORBO_TELEMETRY_*` bridge.
#[cfg(debug_assertions)]
const LEGACY_RUNTIME_BRIDGE: [(&str, &str); 2] = [
    (
        "COPILOTKIT_TELEMETRY_DISABLED",
        "COPILOTKIT_TELEMETRY_DISABLED",
    ),
    ("COPILOTKIT_TELEMETRY_URL", "COPILOTKIT_TELEMETRY_URL"),
];

pub fn initialize<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let initialized = (|| {
        let context = context(&app.package_info().version.to_string())?;
        // The endpoint an operator names opts telemetry in on its own; without one or an
        // explicit flag the emitter (and the runtime's own telemetry) stay asleep.
        let endpoint = opt_in();
        let emitter = telemetry::Telemetry::open(
            app.path().app_local_data_dir().ok()?.join("telemetry"),
            context,
            telemetry::Config {
                enabled: explicitly_enabled() || endpoint.is_some(),
                endpoint,
                max_queue: 256,
            },
        )
        .ok()?;
        let mut runtime_env = emitter.runtime_env();
        for (variable, bridged) in RUNTIME_BRIDGE {
            if let Ok(value) = std::env::var(variable) {
                runtime_env.insert(bridged.into(), value);
            }
        }
        #[cfg(debug_assertions)]
        for (variable, bridged) in LEGACY_RUNTIME_BRIDGE {
            if let Ok(value) = std::env::var(variable) {
                eprintln!(
                    "[telemetry] {variable} is deprecated; set ORBO_TELEMETRY_URL or \
                     ORBO_TELEMETRY_DISABLED instead"
                );
                runtime_env.insert(bridged.into(), value);
            }
        }
        if emitter.install_id().is_none() {
            runtime_env.insert("COPILOTKIT_TELEMETRY_DISABLED".into(), "1".into());
        }
        app.manage(DesktopTelemetry {
            emitter,
            runtime_env: Mutex::new(runtime_env),
        });
        Some(())
    })();
    if initialized.is_none() {
        eprintln!("[telemetry] local setup telemetry could not initialize");
        return;
    }
    record(
        app,
        telemetry::EventData::StepViewed {
            step: telemetry::Step::Welcome,
        },
    );
}

fn context(version: &str) -> Option<telemetry::Context> {
    use telemetry::{Architecture, Distribution, Engine, NumericVersion, Platform, RuntimeEnv};
    let platform = match std::env::consts::OS {
        "macos" => Platform::Macos,
        "windows" => Platform::Windows,
        "linux" => Platform::Linux,
        _ => Platform::Other,
    };
    let mut command = match platform {
        Platform::Macos => {
            let mut c = quiet::command("/usr/bin/sw_vers");
            c.arg("-productVersion");
            c
        }
        Platform::Windows => {
            let mut c = quiet::command("cmd");
            c.args(["/C", "ver"]);
            c
        }
        _ => {
            let mut c = quiet::command("uname");
            c.arg("-r");
            c
        }
    };
    let os_version = command
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .split(|c: char| !c.is_ascii_digit() && c != '.')
                .find_map(|part| NumericVersion::parse(part).ok())
        });
    Some(telemetry::Context {
        distribution: Distribution::Desktop,
        app_version: NumericVersion::parse(version.split('-').next()?).ok()?,
        platform,
        arch: match std::env::consts::ARCH {
            "aarch64" => Architecture::Aarch64,
            "x86_64" => Architecture::X86_64,
            _ => Architecture::Other,
        },
        os_version,
        engine: Engine::None,
        runtime_env: if cfg!(debug_assertions) {
            RuntimeEnv::Development
        } else {
            RuntimeEnv::Production
        },
    })
}

pub fn record<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: telemetry::EventData) {
    let Some(state) = app.try_state::<DesktopTelemetry>() else {
        return;
    };
    if state.emitter.record(event).is_err() {
        eprintln!("[telemetry] setup event could not be saved");
        return;
    }
    let emitter = Arc::clone(&state.emitter);
    if std::thread::Builder::new()
        .name("orbo-telemetry".into())
        .spawn(move || {
            if emitter.flush().is_err() {
                eprintln!("[telemetry] delivery deferred until the next flush");
            }
        })
        .is_err()
    {
        eprintln!("[telemetry] delivery deferred until the next flush");
    }
}

pub fn observe_engine<R: tauri::Runtime>(app: &tauri::AppHandle<R>, status: &engine::EngineStatus) {
    let engine = status.address.as_ref().map(|address| address.engine);
    let kind = match engine {
        Some(engine::Engine::Docker) => telemetry::Engine::Docker,
        Some(engine::Engine::Podman) => telemetry::Engine::Podman,
        None => telemetry::Engine::None,
    };
    if let Some(state) = app.try_state::<DesktopTelemetry>() {
        let _ = state.emitter.update_engine(kind);
        if let Ok(mut env) = state.runtime_env.lock() {
            env.insert(
                "ORBO_ENGINE".into(),
                engine.map(|value| value.binary()).unwrap_or("none").into(),
            );
        }
    }
    record(
        app,
        telemetry::EventData::EngineDetected {
            engine: kind,
            responding: status.responding,
        },
    );
}

pub fn runtime_env<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> BTreeMap<String, String> {
    app.try_state::<DesktopTelemetry>()
        .and_then(|state| state.runtime_env.lock().ok().map(|env| env.clone()))
        .unwrap_or_default()
}

pub fn failure<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    error_class: telemetry::SetupErrorClass,
) {
    let Some(state) = app.try_state::<DesktopTelemetry>() else {
        return;
    };
    let step = state
        .emitter
        .snapshot()
        .ok()
        .and_then(|state| state.last_step)
        .unwrap_or(telemetry::Step::Install);
    record(app, telemetry::EventData::SetupFailed { step, error_class });
}

pub fn pull_completed<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    metrics: orbo_desktop_lib::pull_metrics::PullMetrics,
) {
    record(
        app,
        telemetry::EventData::ImagePull {
            outcome: metrics.outcome,
            duration_ms: metrics.duration_ms,
            bytes: metrics.bytes,
        },
    );
}

pub fn shutdown<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(state) = app.try_state::<DesktopTelemetry>() {
        if state.emitter.shutdown().is_err() {
            eprintln!("[telemetry] pending setup events retained for next launch");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::temp_root;
    use tauri::Manager;

    fn context() -> telemetry::Context {
        telemetry::Context {
            distribution: telemetry::Distribution::Desktop,
            app_version: telemetry::NumericVersion::parse("1.2.3").unwrap(),
            platform: telemetry::Platform::Macos,
            arch: telemetry::Architecture::Aarch64,
            os_version: None,
            engine: telemetry::Engine::None,
            runtime_env: telemetry::RuntimeEnv::Test,
        }
    }

    struct Fixture {
        app: tauri::App<tauri::test::MockRuntime>,
        window: tauri::WebviewWindow<tauri::test::MockRuntime>,
    }

    impl Fixture {
        fn new() -> Self {
            let data_dir = temp_root("desktop-telemetry-ipc");
            let emitter = telemetry::Telemetry::open_with_env(
                data_dir,
                context(),
                telemetry::Config {
                    enabled: true,
                    endpoint: None,
                    max_queue: 256,
                },
                telemetry::EnvOverride::Enabled,
            )
            .unwrap();
            let app = tauri::test::mock_builder()
                .manage(DesktopTelemetry {
                    emitter,
                    runtime_env: Mutex::new(BTreeMap::new()),
                })
                .invoke_handler(tauri::generate_handler![crate::record_setup_event])
                .build(tauri::test::mock_context(tauri::test::noop_assets()))
                .unwrap();
            let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
                .build()
                .unwrap();
            Self { app, window }
        }

        fn invoke(&self, event: serde_json::Value) {
            let _ = tauri::test::get_ipc_response(
                &self.window,
                tauri::webview::InvokeRequest {
                    cmd: "record_setup_event".into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: if cfg!(any(windows, target_os = "android")) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .unwrap(),
                    body: tauri::ipc::InvokeBody::Json(serde_json::json!({ "event": event })),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.into(),
                },
            );
        }

        fn queued(&self) -> Vec<telemetry::EventData> {
            self.app
                .state::<DesktopTelemetry>()
                .emitter
                .snapshot()
                .unwrap()
                .queue
                .into_iter()
                .map(|event| event.data)
                .collect()
        }
    }

    #[test]
    fn setup_telemetry_ipc_accepts_only_frontend_setup_events() {
        let fixture = Fixture::new();

        fixture.invoke(serde_json::json!({
            "kind": "step_viewed",
            "step": "harness"
        }));
        fixture.invoke(serde_json::json!({
            "kind": "harness_chosen",
            "harness": "byo_url"
        }));
        assert_eq!(fixture.queued().len(), 2);

        fixture.invoke(serde_json::json!({
            "kind": "harness_chosen",
            "harness": "byo_url",
            "url": "https://example.invalid"
        }));
        fixture.invoke(serde_json::json!({
            "kind": "step_viewed",
            "step": "credentials"
        }));
        fixture.invoke(serde_json::json!({
            "kind": "activated"
        }));

        let queued = fixture.queued();
        assert_eq!(queued.len(), 2);
        assert!(matches!(
            queued[0],
            telemetry::EventData::StepViewed {
                step: telemetry::Step::Harness
            }
        ));
        assert!(matches!(
            queued[1],
            telemetry::EventData::HarnessChosen {
                harness: telemetry::Harness::ByoUrl
            }
        ));
    }
}
