#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod updater;

use crewspan_shell_logic::{
    close_action, loader_from_manifest, navigation_decision, server_monitor_decision,
    server_recovery_action, stage_paths, startup_ready_timeout, tray_action, CloseAction,
    LoaderMode, NavigationDecision, ServerMonitorDecision, ServerRecoveryAction, TrayAction,
    SERVER_PORT, SERVER_URL,
};
use crewspan_sidecar_core::{Sidecar, SidecarConfig, StartupProgress};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
    time::Instant,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

pub(crate) struct Lifecycle {
    state: Mutex<LifecycleState>,
    changed: Condvar,
    stop_sender: mpsc::Sender<()>,
    shutdown_started: AtomicBool,
    shutdown_complete: AtomicBool,
    cancel_start: AtomicBool,
    updater_checks_started: AtomicBool,
    tray_notice_shown: AtomicBool,
}

#[derive(Default)]
struct LifecycleState {
    starting: bool,
    sidecar_running: bool,
}

impl Lifecycle {
    fn new(stop_sender: mpsc::Sender<()>, tray_notice_shown: bool) -> Self {
        Self {
            state: Mutex::new(LifecycleState::default()),
            changed: Condvar::new(),
            stop_sender,
            shutdown_started: AtomicBool::new(false),
            shutdown_complete: AtomicBool::new(false),
            cancel_start: AtomicBool::new(false),
            updater_checks_started: AtomicBool::new(false),
            tray_notice_shown: AtomicBool::new(tray_notice_shown),
        }
    }

    pub(crate) fn is_quitting(&self) -> bool {
        self.shutdown_started.load(Ordering::SeqCst)
    }

    fn begin_quit(&self) -> bool {
        if self
            .shutdown_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return false;
        }
        self.cancel_start.store(true, Ordering::SeqCst);
        let _ = self.stop_sender.send(());
        true
    }

    pub(crate) fn stop_for_update(&self) -> bool {
        if !self.begin_quit() {
            return false;
        }

        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        while state.starting || state.sidecar_running {
            state = self.changed.wait(state).unwrap_or_else(|p| p.into_inner());
        }
        self.shutdown_complete.store(true, Ordering::SeqCst);
        true
    }

    fn start_updater_checks_once(&self) -> bool {
        self.updater_checks_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}

fn main() {
    let (stop_sender, stop_receiver) = mpsc::channel();
    let lifecycle = Arc::new(Lifecycle::new(stop_sender, false));
    let startup_progress = Arc::new(Mutex::new(None));
    let startup_at = Arc::new(Instant::now());
    let receiver_for_setup = Arc::new(Mutex::new(Some(stop_receiver)));
    let state_for_instance = Arc::clone(&lifecycle);
    let state_for_single_instance = Arc::clone(&lifecycle);
    let progress_for_setup = Arc::clone(&startup_progress);
    let startup_at_for_setup = Arc::clone(&startup_at);
    let receiver_for_setup_copy = Arc::clone(&receiver_for_setup);
    // CSP remains null for the server-served SPA; navigation is allowlisted and
    // capabilities are scoped only to Tauri's local splash origin below.
    let builder = tauri::Builder::default()
        // The plugin's documented requirement is to register first.
        .plugin(tauri_plugin_single_instance::init(
            move |app, _argv, _cwd| {
                if !state_for_single_instance.is_quitting() {
                    show_main_window(app);
                }
            },
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let paths = resolve_stage_paths(app)?;
            let data_home = app.path().app_local_data_dir()?.join("crewspan");
            let config_path = data_home.join("instances/desktop/config.json");
            let tray_notice_path = data_home.join(".tray-notice-shown");
            state_for_instance
                .tray_notice_shown
                .store(tray_notice_path.is_file(), Ordering::SeqCst);
            let log_dir = app.path().app_log_dir()?;

            let manifest = std::fs::read_to_string(&paths.manifest).unwrap_or_default();
            let tsx_loader = match loader_from_manifest(&manifest) {
                LoaderMode::None => None,
                LoaderMode::Tsx if paths.tsx_loader.is_file() => Some(paths.tsx_loader),
                LoaderMode::Tsx => None,
            };

            // The config file must stay absent until the server creates it with valid contents.
            std::fs::create_dir_all(config_path.parent().expect("config has parent"))?;
            std::fs::create_dir_all(&data_home)?;
            std::fs::create_dir_all(&log_dir)?;

            build_tray(app, Arc::clone(&state_for_instance))?;

            build_main_window(
                app.handle().clone(),
                Arc::clone(&state_for_instance),
                Arc::clone(&progress_for_setup),
                Arc::clone(&startup_at_for_setup),
                log_dir.join("desktop.log"),
                tray_notice_path,
            )?;
            let existing_default_db = has_existing_default_database(
                &config_path,
                &data_home.join("instances/desktop/db"),
            );
            let seed_recovery_pending = data_home
                .join("instances/desktop/.db-seed-pending")
                .is_file();
            let mut sidecar_config = SidecarConfig::new(
                paths.node,
                tsx_loader,
                paths.sidecar_entry,
                paths.working_dir,
                data_home,
                config_path,
                log_dir.clone(),
            );
            sidecar_config.server_entry = Some(paths.server_entry);
            sidecar_config.db_template = Some(paths.db_template);
            sidecar_config.port = SERVER_PORT;
            sidecar_config.ready_timeout =
                startup_ready_timeout(existing_default_db, seed_recovery_pending);

            start_sidecar_worker(
                app.handle().clone(),
                Arc::clone(&state_for_instance),
                sidecar_config,
                log_dir,
                Arc::clone(&progress_for_setup),
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

fn is_splash_url(scheme: &str, host: Option<&str>, port: Option<u16>) -> bool {
    (scheme == "tauri" && host == Some("localhost") && port.is_none())
        || (scheme == "http" && host == Some("tauri.localhost") && port == Some(80))
}

fn has_existing_default_database(
    config_path: &std::path::Path,
    default_db: &std::path::Path,
) -> bool {
    if std::env::var("DATABASE_URL").is_ok_and(|value| !value.trim().is_empty()) {
        return false;
    }
    let config: serde_json::Value = if config_path.exists() {
        let Ok(contents) = std::fs::read_to_string(config_path) else {
            return false;
        };
        let Ok(config) = serde_json::from_str(&contents) else {
            return false;
        };
        config
    } else {
        serde_json::Value::Null
    };
    let database = config.get("database");
    if database
        .and_then(|database| database.get("mode"))
        .and_then(serde_json::Value::as_str)
        == Some("postgres")
    {
        return false;
    }
    if let Some(configured_dir) = database
        .and_then(|database| database.get("embeddedPostgresDataDir"))
        .and_then(serde_json::Value::as_str)
    {
        if !std::path::Path::new(configured_dir).is_absolute()
            || std::path::Path::new(configured_dir) != default_db
        {
            return false;
        }
    }
    default_db.join("PG_VERSION").is_file()
}

fn send_progress_to_splash<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    progress: StartupProgress,
) {
    let allowed_splash = window.url().ok().is_some_and(|url| {
        is_splash_url(url.scheme(), url.host_str(), url.port_or_known_default())
            && navigation_decision(url.scheme(), url.host_str(), url.port_or_known_default())
                == NavigationDecision::Allow
    });
    if !allowed_splash {
        return;
    }
    let payload = serde_json::json!({
        "phase": progress.phase.label(),
        "elapsedMs": progress.elapsed.as_millis(),
        "detail": progress.detail,
    });
    let script = format!("window.crewspanSetPhase&&window.crewspanSetPhase({payload})");
    let _ = window.eval(&script);
}

fn append_timing_log(path: &std::path::Path, line: &str) {
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{line}");
    }
}

#[cfg(debug_assertions)]
fn dev_stage_override() -> Option<PathBuf> {
    std::env::var_os("CREWSPAN_STAGE_DIR").map(PathBuf::from)
}

#[cfg(not(debug_assertions))]
fn dev_stage_override() -> Option<PathBuf> {
    None
}

fn build_tray<R: tauri::Runtime>(
    app: &tauri::App<R>,
    lifecycle: Arc<Lifecycle>,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(icon) = app.default_window_icon() else {
        return Ok(());
    };
    let open = MenuItem::with_id(app, "open", "Open Crewspan", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Crewspan", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let app_for_menu = app.handle().clone();
    let app_for_click = app.handle().clone();
    let lifecycle_for_click = Arc::clone(&lifecycle);
    TrayIconBuilder::with_id("crewspan")
        .icon(icon.clone())
        .tooltip("Crewspan (starting…)")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |_app, event| {
            if let Some(action) = tray_action(event.id().as_ref()) {
                handle_tray_action(app_for_menu.clone(), Arc::clone(&lifecycle), action);
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) && !lifecycle_for_click.is_quitting()
            {
                show_main_window(&app_for_click);
            }
        })
        .build(app.handle())?;
    Ok(())
}

fn handle_tray_action<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
    action: TrayAction,
) {
    if lifecycle.is_quitting() {
        return;
    }
    match action {
        TrayAction::Open => show_main_window(&app),
        TrayAction::Quit => begin_shutdown(app, lifecycle),
    }
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_main_window<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
    latest_progress: Arc<Mutex<Option<StartupProgress>>>,
    startup_at: Arc<Instant>,
    timing_log: PathBuf,
    tray_notice_path: PathBuf,
) -> Result<WebviewWindow<R>, Box<dyn std::error::Error>> {
    let app_for_navigation = app.clone();
    let progress_for_load = Arc::clone(&latest_progress);
    let startup_for_load = Arc::clone(&startup_at);
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
            })
            .on_page_load(move |window, payload| {
                if payload.event() != tauri::webview::PageLoadEvent::Finished {
                    return;
                }
                let url = payload.url();
                if is_splash_url(url.scheme(), url.host_str(), url.port_or_known_default())
                    && navigation_decision(
                        url.scheme(),
                        url.host_str(),
                        url.port_or_known_default(),
                    ) == NavigationDecision::Allow
                {
                    if let Some(progress) =
                        *progress_for_load.lock().unwrap_or_else(|p| p.into_inner())
                    {
                        send_progress_to_splash(&window, progress);
                    }
                } else if url.as_str() == SERVER_URL {
                    let elapsed = startup_for_load.elapsed().as_millis();
                    append_timing_log(&timing_log, &format!("[timing] spa_loaded_ms={elapsed}"));
                }
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
            match close_action(lifecycle.is_quitting()) {
                CloseAction::Ignore => {}
                CloseAction::Hide => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    if !lifecycle.tray_notice_shown.swap(true, Ordering::SeqCst) {
                        let _ = std::fs::OpenOptions::new()
                            .write(true)
                            .create_new(true)
                            .open(&tray_notice_path);
                        let keep_running = app_handle
                            .dialog()
                            .message("Crewspan is still running in the system tray.")
                            .title("Crewspan is in the tray")
                            .kind(MessageDialogKind::Info)
                            .buttons(MessageDialogButtons::OkCancelCustom(
                                "Keep running".into(),
                                "Quit".into(),
                            ))
                            .blocking_show();
                        if !keep_running {
                            begin_shutdown(app_handle.clone(), Arc::clone(&lifecycle));
                        }
                    }
                }
            }
        }
    });

    Ok(window)
}

fn start_sidecar_worker<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
    config: SidecarConfig,
    log_dir: PathBuf,
    latest_progress: Arc<Mutex<Option<StartupProgress>>>,
    stop_receiver: mpsc::Receiver<()>,
) {
    std::thread::spawn(move || 'start_sidecar: loop {
        {
            let mut state = lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
            if lifecycle.shutdown_started.load(Ordering::SeqCst) {
                return;
            }
            state.starting = true;
        }

        let app_for_progress = app.clone();
        let progress_for_callback = Arc::clone(&latest_progress);
        match Sidecar::start_cancellable(config.clone(), &lifecycle.cancel_start, &mut |progress| {
            *progress_for_callback
                .lock()
                .unwrap_or_else(|p| p.into_inner()) = Some(progress);
            if let Some(window) = app_for_progress.get_webview_window("main") {
                send_progress_to_splash(&window, progress);
            }
        }) {
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
                if let Some(tray) = app.tray_by_id("crewspan") {
                    let _ = tray.set_tooltip(Some("Crewspan"));
                }
                if lifecycle.start_updater_checks_once() {
                    updater::start_periodic_checks(app.clone(), Arc::clone(&lifecycle));
                }
                loop {
                    match stop_receiver.recv_timeout(std::time::Duration::from_secs(5)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                            sidecar.stop();
                            let mut state =
                                lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                            state.sidecar_running = false;
                            drop(state);
                            lifecycle.changed.notify_all();
                            return;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if server_monitor_decision(sidecar.is_running())
                                == ServerMonitorDecision::KeepRunning
                            {
                                continue;
                            }
                            if let Some(window) = app.get_webview_window("main") {
                                if let Ok(url) = "tauri://localhost/index.html".parse() {
                                    let _ = window.navigate(url);
                                }
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            sidecar.stop();
                            {
                                let mut state =
                                    lifecycle.state.lock().unwrap_or_else(|p| p.into_inner());
                                state.sidecar_running = false;
                            }
                            lifecycle.changed.notify_all();
                            if lifecycle.is_quitting() {
                                return;
                            }
                            // The custom first button maps to true on all supported platforms.
                            let restart = app.dialog()
                                .message("Crewspan's local server stopped unexpectedly. Restart the server?")
                                .title("Crewspan server stopped")
                                .kind(MessageDialogKind::Error)
                                .buttons(MessageDialogButtons::OkCancelCustom("Restart".into(), "Quit".into()))
                                .blocking_show();
                            if server_recovery_action(restart, lifecycle.is_quitting())
                                == ServerRecoveryAction::Restart
                            {
                                continue 'start_sidecar;
                            }
                            begin_shutdown(app.clone(), Arc::clone(&lifecycle));
                            return;
                        }
                    }
                }
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
                if matches!(&error, crewspan_sidecar_core::SidecarError::Cancelled) {
                    return;
                }

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
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
    if !lifecycle.begin_quit() {
        return;
    }
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

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn quit_during_update_keeps_update_as_the_shutdown_owner() {
        let (sender, receiver) = mpsc::channel();
        let lifecycle = Arc::new(Lifecycle::new(sender, false));
        lifecycle
            .state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .sidecar_running = true;

        let update_lifecycle = Arc::clone(&lifecycle);
        let update = std::thread::spawn(move || update_lifecycle.stop_for_update());
        receiver.recv().expect("update requested sidecar stop");
        assert!(!lifecycle.begin_quit());

        lifecycle
            .state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .sidecar_running = false;
        lifecycle.changed.notify_all();
        assert!(update.join().unwrap());
    }

    #[test]
    fn update_during_quit_is_rejected() {
        let (sender, _receiver) = mpsc::channel();
        let lifecycle = Lifecycle::new(sender, false);
        assert!(lifecycle.begin_quit());
        assert!(!lifecycle.stop_for_update());
    }

    #[test]
    fn updater_checks_start_only_once_across_sidecar_restarts() {
        let (sender, _receiver) = mpsc::channel();
        let lifecycle = Lifecycle::new(sender, false);
        assert!(lifecycle.start_updater_checks_once());
        assert!(!lifecycle.start_updater_checks_once());
    }

    #[test]
    fn closing_while_starting_hides_without_starting_shutdown() {
        let (sender, _receiver) = mpsc::channel();
        let lifecycle = Lifecycle::new(sender, false);
        lifecycle
            .state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .starting = true;
        assert_eq!(close_action(lifecycle.is_quitting()), CloseAction::Hide);
        assert!(!lifecycle.is_quitting());
    }
}
