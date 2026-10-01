#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use crewspan_shell_logic::{
    navigation_decision, stage_paths, NavigationDecision, SERVER_PORT, SERVER_URL,
};
use crewspan_sidecar_core::{Sidecar, SidecarConfig};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
    time::Duration,
};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

struct Lifecycle {
    state: Mutex<LifecycleState>,
    changed: Condvar,
    stop_sender: mpsc::Sender<()>,
    shutdown_started: AtomicBool,
    shutdown_complete: AtomicBool,
}

#[derive(Default)]
struct LifecycleState {
    starting: bool,
    sidecar_running: bool,
}

impl Lifecycle {
    fn new(stop_sender: mpsc::Sender<()>) -> Self {
        Self {
            state: Mutex::new(LifecycleState::default()),
            changed: Condvar::new(),
            stop_sender,
            shutdown_started: AtomicBool::new(false),
            shutdown_complete: AtomicBool::new(false),
        }
    }
}

fn main() {
    let (stop_sender, stop_receiver) = mpsc::channel();
    let lifecycle = Arc::new(Lifecycle::new(stop_sender));
    let receiver_for_setup = Arc::new(Mutex::new(Some(stop_receiver)));
    let state_for_instance = Arc::clone(&lifecycle);
    let receiver_for_setup_copy = Arc::clone(&receiver_for_setup);
    // CSP remains null for the server-served SPA; navigation is allowlisted and
    // capabilities are scoped only to Tauri's local splash origin below.
    let builder = tauri::Builder::default()
        // The plugin's documented requirement is to register first.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let paths = resolve_stage_paths(app)?;
            let data_home = app.path().app_local_data_dir()?.join("crewspan");
            let config_path = data_home.join("instances/desktop/config.json");
            let log_dir = app.path().app_log_dir()?;

            // The config file must stay absent until the server creates it with valid contents.
            std::fs::create_dir_all(config_path.parent().expect("config has parent"))?;
            std::fs::create_dir_all(&log_dir)?;

            build_main_window(app.handle().clone(), Arc::clone(&state_for_instance))?;
            let mut sidecar_config = SidecarConfig::new(
                paths.node,
                paths.tsx_loader,
                paths.sidecar_entry,
                paths.working_dir,
                data_home,
                config_path,
                log_dir.clone(),
            );
            sidecar_config.server_entry = Some(paths.server_entry);
            sidecar_config.port = SERVER_PORT;
            sidecar_config.ready_timeout = Duration::from_secs(300);

            start_sidecar_worker(
                app.handle().clone(),
                Arc::clone(&state_for_instance),
                sidecar_config,
                log_dir,
                receiver_for_setup_copy
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .take()
                    .expect("sidecar worker is started once"),
            );
            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("failed to build Crewspan desktop shell");
    app.run(move |app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if !lifecycle.shutdown_complete.load(Ordering::SeqCst) {
                api.prevent_exit();
                begin_shutdown(app_handle.clone(), Arc::clone(&lifecycle));
            }
        }
    });
}

fn resolve_stage_paths<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<crewspan_shell_logic::StagePaths, Box<dyn std::error::Error>> {
    let stage_dir = dev_stage_override().unwrap_or(app.path().resource_dir()?.join("stage"));
    Ok(stage_paths(&stage_dir, cfg!(target_os = "windows")))
}

#[cfg(debug_assertions)]
fn dev_stage_override() -> Option<PathBuf> {
    std::env::var_os("CREWSPAN_STAGE_DIR").map(PathBuf::from)
}

#[cfg(not(debug_assertions))]
fn dev_stage_override() -> Option<PathBuf> {
    None
}

fn build_main_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
) -> Result<WebviewWindow<R>, Box<dyn std::error::Error>> {
    let app_for_navigation = app.clone();
    let navigation_window =
        WebviewWindowBuilder::new(&app, "main", WebviewUrl::App(PathBuf::from("index.html")))
            .title("Crewspan")
            .inner_size(1280.0, 800.0)
            .min_inner_size(900.0, 600.0)
            .visible(true)
            .on_navigation(move |url| {
                let decision =
                    navigation_decision(url.scheme(), url.host_str(), url.port_or_known_default());
                if decision == NavigationDecision::OpenExternally {
                    let _ = app_for_navigation
                        .opener()
                        .open_url(url.as_str(), None::<String>);
                }
                decision == NavigationDecision::Allow
            });

    let app_for_new_window = app.clone();
    let window = navigation_window
        .on_new_window(move |url, _features| {
            let decision =
                navigation_decision(url.scheme(), url.host_str(), url.port_or_known_default());
            if decision == NavigationDecision::OpenExternally {
                let _ = app_for_new_window
                    .opener()
                    .open_url(url.as_str(), None::<String>);
            }
            if decision == NavigationDecision::Allow {
                tauri::webview::NewWindowResponse::Allow
            } else {
                tauri::webview::NewWindowResponse::Deny
            }
        })
        .build()?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            begin_shutdown(app_handle.clone(), Arc::clone(&lifecycle));
        }
    });

    Ok(window)
}

fn start_sidecar_worker<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
    config: SidecarConfig,
    log_dir: PathBuf,
    stop_receiver: mpsc::Receiver<()>,
) {
    std::thread::spawn(move || loop {
        {
            let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
            if lifecycle.shutdown_started.load(Ordering::SeqCst) {
                return;
            }
            state.starting = true;
        }

        match Sidecar::start(config.clone()) {
            Ok(mut sidecar) => {
                let quitting = {
                    let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                    if lifecycle.shutdown_started.load(Ordering::SeqCst) {
                        true
                    } else {
                        state.sidecar_running = true;
                        state.starting = false;
                        false
                    }
                };
                if quitting {
                    sidecar.stop();
                    let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                    state.starting = false;
                    drop(state);
                    lifecycle.changed.notify_all();
                    return;
                }
                lifecycle.changed.notify_all();
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(url) = SERVER_URL.parse() {
                        let _ = window.navigate(url);
                    }
                }
                let _ = stop_receiver.recv();
                sidecar.stop();
                let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                state.sidecar_running = false;
                drop(state);
                lifecycle.changed.notify_all();
                return;
            }
            Err(error) => {
                {
                    let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                    state.starting = false;
                }
                lifecycle.changed.notify_all();
                if lifecycle.shutdown_started.load(Ordering::SeqCst) {
                    return;
                }

                let message = format!("{}\n\nLogs: {}", error.user_message(), log_dir.display());
                // blocking_show maps the custom OK button ("Retry") to true on every platform.
                let retry = app
                    .dialog()
                    .message(message)
                    .title("Crewspan could not start")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Retry".into(),
                        "Quit".into(),
                    ))
                    .blocking_show();
                if !retry {
                    begin_shutdown(app, Arc::clone(&lifecycle));
                    return;
                }
            }
        }
    });
}

fn begin_shutdown<R: tauri::Runtime>(app: tauri::AppHandle<R>, lifecycle: Arc<Lifecycle>) {
    if lifecycle.shutdown_started.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = lifecycle.stop_sender.send(());
    // First-run startup can take minutes; hide the window so closing it feels immediate.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    std::thread::spawn(move || {
        let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
        while state.starting || state.sidecar_running {
            state = lifecycle
                .changed
                .wait(state)
                .unwrap_or_else(|p| p.into_inner());
        }
        drop(state);
        lifecycle.shutdown_complete.store(true, Ordering::SeqCst);
        app.exit(0);
    });
}
