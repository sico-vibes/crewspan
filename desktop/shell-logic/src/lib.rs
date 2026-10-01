use std::path::{Path, PathBuf};

pub const SERVER_PORT: u16 = 3100;
pub const SERVER_URL: &str = "http://127.0.0.1:3100/";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StagePaths {
    pub node: PathBuf,
    pub tsx_loader: PathBuf,
    pub sidecar_entry: PathBuf,
    pub server_entry: PathBuf,
    pub working_dir: PathBuf,
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
        sidecar_entry: stage_dir.join("sidecar/entry.mjs"),
        server_entry: stage_dir.join("app/server/dist/index.js"),
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
}
