use std::path::{Path, PathBuf};
use std::time::Duration;

pub const SERVER_PORT: u16 = 3100;
pub const SERVER_URL: &str = "http://127.0.0.1:3100/";

pub fn startup_ready_timeout(
    existing_default_database: bool,
    seed_recovery_pending: bool,
) -> Duration {
    if existing_default_database && !seed_recovery_pending {
        Duration::from_secs(300)
    } else {
        Duration::from_secs(900)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloseAction {
    Hide,
    Ignore,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayAction {
    Open,
    Quit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ServerMonitorDecision {
    KeepRunning,
    RestartPrompt,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ServerRecoveryAction {
    Restart,
    Quit,
}

pub fn server_monitor_decision(sidecar_running: bool) -> ServerMonitorDecision {
    if sidecar_running {
        ServerMonitorDecision::KeepRunning
    } else {
        ServerMonitorDecision::RestartPrompt
    }
}

pub fn server_recovery_action(restart_requested: bool, quitting: bool) -> ServerRecoveryAction {
    if restart_requested && !quitting {
        ServerRecoveryAction::Restart
    } else {
        ServerRecoveryAction::Quit
    }
}

pub fn close_action(shutdown_started: bool) -> CloseAction {
    if shutdown_started {
        CloseAction::Ignore
    } else {
        CloseAction::Hide
    }
}

pub fn tray_action(menu_id: &str) -> Option<TrayAction> {
    match menu_id {
        "open" => Some(TrayAction::Open),
        "quit" => Some(TrayAction::Quit),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StagePaths {
    pub node: PathBuf,
    pub tsx_loader: PathBuf,
    pub manifest: PathBuf,
    pub sidecar_entry: PathBuf,
    pub server_entry: PathBuf,
    pub db_template: PathBuf,
    pub working_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoaderMode {
    None,
    Tsx,
}

pub fn loader_from_manifest(json: &str) -> LoaderMode {
    match serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|value| {
            value
                .get("loader")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .as_deref()
    {
        Some("none") => LoaderMode::None,
        _ => LoaderMode::Tsx,
    }
}

/// Build the staged runtime paths. `windows` controls the executable suffix so
/// both target layouts can be tested on any host.
/// Tauri returns Windows resource paths in verbatim form (`\\?\C:\dir`), which
/// Node cannot turn into a file URL. Use the ordinary drive form instead.
pub fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

pub fn stage_paths(stage_dir: &Path, windows: bool) -> StagePaths {
    let stage_dir = &plain_path(stage_dir);
    StagePaths {
        node: stage_dir
            .join("runtime")
            .join(if windows { "node.exe" } else { "node" }),
        tsx_loader: stage_dir.join("app/node_modules/tsx/dist/loader.mjs"),
        manifest: stage_dir.join("stage-manifest.json"),
        sidecar_entry: stage_dir.join("sidecar/entry.mjs"),
        server_entry: stage_dir.join("app/server/dist/index.js"),
        db_template: stage_dir.join("db-template"),
        working_dir: stage_dir.to_path_buf(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NavigationDecision {
    Allow,
    OpenExternally,
    Block,
}

/// Classify a URL using parsed URL components supplied by the caller. The
/// internal splash is identified by its Tauri protocol/host pair. The server
/// allowlist is restricted to the exact loopback host and fixed port.
pub fn navigation_decision(
    scheme: &str,
    host: Option<&str>,
    port: Option<u16>,
) -> NavigationDecision {
    if (scheme == "tauri" && host == Some("localhost") && port.is_none())
        || (scheme == "http" && host == Some("tauri.localhost") && port == Some(80))
    {
        return NavigationDecision::Allow;
    }

    if scheme == "http" && host == Some("127.0.0.1") && port == Some(SERVER_PORT) {
        return NavigationDecision::Allow;
    }

    if scheme == "http" || scheme == "https" {
        NavigationDecision::OpenExternally
    } else {
        NavigationDecision::Block
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_windows_prefixes_are_removed() {
        assert_eq!(
            plain_path(Path::new(r"\\?\C:\Users\a\stage")),
            PathBuf::from(r"C:\Users\a\stage")
        );
        assert_eq!(
            plain_path(Path::new(r"\\?\UNC\srv\share\stage")),
            PathBuf::from(r"\\srv\share\stage")
        );
        assert_eq!(
            plain_path(Path::new("/opt/stage")),
            PathBuf::from("/opt/stage")
        );
        let paths = stage_paths(Path::new(r"\\?\C:\App\stage"), true);
        assert_eq!(paths.working_dir, PathBuf::from(r"C:\App\stage"));
    }

    #[test]
    fn stage_paths_use_windows_executable_name() {
        let root = Path::new("/bundle/stage");
        let paths = stage_paths(root, true);
        assert_eq!(paths.node, root.join("runtime/node.exe"));
        assert_eq!(
            paths.tsx_loader,
            root.join("app/node_modules/tsx/dist/loader.mjs")
        );
        assert_eq!(paths.sidecar_entry, root.join("sidecar/entry.mjs"));
        assert_eq!(paths.server_entry, root.join("app/server/dist/index.js"));
        assert_eq!(paths.db_template, root.join("db-template"));
        assert_eq!(paths.manifest, root.join("stage-manifest.json"));
        assert_eq!(paths.working_dir, root);
    }

    #[test]
    fn stage_paths_use_unix_executable_name() {
        assert_eq!(
            stage_paths(Path::new("stage"), false).node,
            PathBuf::from("stage/runtime/node")
        );
    }

    #[test]
    fn only_internal_splash_and_expected_server_are_allowed() {
        assert_eq!(
            navigation_decision("tauri", Some("localhost"), None),
            NavigationDecision::Allow
        );
        assert_eq!(
            navigation_decision("http", Some("tauri.localhost"), None),
            NavigationDecision::OpenExternally
        );
        assert_eq!(
            navigation_decision("http", Some("tauri.localhost"), Some(80)),
            NavigationDecision::Allow
        );
        assert_eq!(
            navigation_decision("http", Some("127.0.0.1"), Some(3100)),
            NavigationDecision::Allow
        );
        assert_eq!(
            navigation_decision("https", Some("127.0.0.1"), Some(3100)),
            NavigationDecision::OpenExternally
        );
        assert_eq!(
            navigation_decision("http", Some("127.0.0.1"), Some(3101)),
            NavigationDecision::OpenExternally
        );
        assert_eq!(
            navigation_decision("https", Some("example.com"), Some(443)),
            NavigationDecision::OpenExternally
        );
        assert_eq!(
            navigation_decision("file", None, None),
            NavigationDecision::Block
        );
        assert_eq!(
            navigation_decision("javascript", None, None),
            NavigationDecision::Block
        );
    }

    #[test]
    fn loopback_constants_are_stable() {
        assert_eq!(SERVER_PORT, 3100);
        assert_eq!(SERVER_URL, "http://127.0.0.1:3100/");
    }

    #[test]
    fn dead_sidecar_requests_recovery_and_live_sidecar_continues() {
        assert_eq!(
            server_monitor_decision(true),
            ServerMonitorDecision::KeepRunning
        );
        assert_eq!(
            server_monitor_decision(false),
            ServerMonitorDecision::RestartPrompt
        );
    }

    #[test]
    fn restart_choice_restarts_unless_shutdown_has_started() {
        assert_eq!(
            server_recovery_action(true, false),
            ServerRecoveryAction::Restart
        );
        assert_eq!(
            server_recovery_action(false, false),
            ServerRecoveryAction::Quit
        );
        assert_eq!(
            server_recovery_action(true, true),
            ServerRecoveryAction::Quit
        );
    }

    #[test]
    fn seed_recovery_uses_first_run_startup_deadline() {
        assert_eq!(startup_ready_timeout(true, true), Duration::from_secs(900));
        assert_eq!(startup_ready_timeout(true, false), Duration::from_secs(300));
        assert_eq!(
            startup_ready_timeout(false, false),
            Duration::from_secs(900)
        );
    }

    #[test]
    fn loader_mode_uses_manifest_and_falls_back_to_tsx() {
        assert_eq!(
            loader_from_manifest(r#"{"loader":"none"}"#),
            LoaderMode::None
        );
        assert_eq!(loader_from_manifest(r#"{"loader":"tsx"}"#), LoaderMode::Tsx);
        assert_eq!(loader_from_manifest(""), LoaderMode::Tsx);
        assert_eq!(loader_from_manifest("not json"), LoaderMode::Tsx);
        assert_eq!(
            loader_from_manifest(r#"{"schemaVersion":1}"#),
            LoaderMode::Tsx
        );
    }

    #[test]
    fn close_hides_unless_shutdown_has_started() {
        assert_eq!(close_action(false), CloseAction::Hide);
        assert_eq!(close_action(true), CloseAction::Ignore);
    }

    #[test]
    fn tray_menu_ids_map_to_open_and_quit() {
        assert_eq!(tray_action("open"), Some(TrayAction::Open));
        assert_eq!(tray_action("quit"), Some(TrayAction::Quit));
        assert_eq!(tray_action("unknown"), None);
    }
}
