use std::{path::PathBuf, time::Duration};

#[derive(Clone, Debug)]
pub struct SidecarConfig {
    pub node_path: PathBuf,
    pub tsx_loader: Option<PathBuf>,
    pub entry_path: PathBuf,
    pub server_entry: Option<PathBuf>,
    pub db_template: Option<PathBuf>,
    pub working_dir: PathBuf,
    pub data_home: PathBuf,
    pub instance_id: String,
    pub config_path: PathBuf,
    pub port: u16,
    pub log_dir: PathBuf,
    pub ready_timeout: Duration,
    pub shutdown_grace: Duration,
    pub health_poll_interval: Duration,
    pub inherited_env: Vec<(String, String)>,
}

impl SidecarConfig {
    pub fn new(
        node_path: PathBuf,
        tsx_loader: Option<PathBuf>,
        entry_path: PathBuf,
        working_dir: PathBuf,
        data_home: PathBuf,
        config_path: PathBuf,
        log_dir: PathBuf,
    ) -> Self {
        Self {
            node_path,
            tsx_loader,
            entry_path,
            server_entry: None,
            db_template: None,
            working_dir,
            data_home,
            instance_id: "desktop".into(),
            config_path,
            port: 3100,
            log_dir,
            ready_timeout: Duration::from_secs(120),
            shutdown_grace: Duration::from_secs(60),
            health_poll_interval: Duration::from_millis(500),
            inherited_env: std::env::vars().collect(),
        }
    }
}
