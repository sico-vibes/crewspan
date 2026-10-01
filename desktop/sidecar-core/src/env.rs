use crate::SidecarConfig;

pub fn environment_name_is_blocked(name: &str, windows_case_insensitive: bool) -> bool {
    let folded;
    let name = if windows_case_insensitive {
        folded = name.to_ascii_uppercase();
        folded.as_str()
    } else {
        name
    };
    if name == "PAPERCLIP_TELEMETRY_DISABLED" || name == "DO_NOT_TRACK" {
        return false;
    }
    name.starts_with("PAPERCLIP_")
        || name.starts_with("DATABASE_")
        || name.starts_with("BETTER_AUTH_")
        || matches!(
            name,
            "HOST" | "PORT" | "SERVE_UI" | "NODE_OPTIONS" | "NODE_ENV"
        )
}

pub fn build_environment(config: &SidecarConfig, nonce: &str) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = config
        .inherited_env
        .iter()
        .filter(|(name, _)| !environment_name_is_blocked(name, cfg!(windows)))
        .cloned()
        .collect();
    let mut set = |k: &str, v: String| {
        env.retain(|(name, _)| {
            if cfg!(windows) {
                !name.eq_ignore_ascii_case(k)
            } else {
                name != k
            }
        });
        env.push((k.to_owned(), v));
    };
    set("NODE_ENV", "production".into());
    set(
        "PAPERCLIP_HOME",
        config.data_home.to_string_lossy().into_owned(),
    );
    set("PAPERCLIP_INSTANCE_ID", config.instance_id.clone());
    set(
        "PAPERCLIP_CONFIG",
        config.config_path.to_string_lossy().into_owned(),
    );
    set("PAPERCLIP_DEPLOYMENT_MODE", "local_trusted".into());
    set("PAPERCLIP_BIND", "loopback".into());
    set("HOST", "127.0.0.1".into());
    set("PORT", config.port.to_string());
    set("SERVE_UI", "true".into());
    set("PAPERCLIP_UI_DEV_MIDDLEWARE", "false".into());
    set("PAPERCLIP_MIGRATION_AUTO_APPLY", "true".into());
    set("PAPERCLIP_DISABLE_CWD_ENV_FILE", "true".into());
    set("PAPERCLIP_OPEN_ON_LISTEN", "false".into());
    set("CREWSPAN_SIDECAR_NONCE", nonce.into());
    if let Some(path) = &config.server_entry {
        set(
            "CREWSPAN_SIDECAR_SERVER_ENTRY",
            path.to_string_lossy().into_owned(),
        );
    }
    env.sort_by(|a, b| a.0.cmp(&b.0));
    env
}
