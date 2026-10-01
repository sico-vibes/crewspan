use std::{error::Error, fmt, time::Duration};

#[derive(Debug)]
pub enum SidecarError {
    PortInUse {
        port: u16,
    },
    SpawnFailed {
        message: String,
    },
    EarlyExit {
        code: Option<i32>,
        stderr_tail: String,
    },
    ReadyTimeout {
        waited: Duration,
    },
    NonceMismatch,
    PortMismatch {
        requested: u16,
        actual: u16,
    },
    InvalidEnvironment {
        message: String,
    },
    StartFailed {
        message: String,
    },
    HealthTimeout {
        waited: Duration,
        last_status: Option<String>,
    },
    Io {
        message: String,
    },
    ShutdownTimeout,
}

impl SidecarError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::PortInUse { .. } => "port_in_use",
            Self::SpawnFailed { .. } => "spawn_failed",
            Self::EarlyExit { .. } => "early_exit",
            Self::ReadyTimeout { .. } => "ready_timeout",
            Self::NonceMismatch => "nonce_mismatch",
            Self::PortMismatch { .. } => "port_mismatch",
            Self::InvalidEnvironment { .. } => "invalid_environment",
            Self::StartFailed { .. } => "start_failed",
            Self::HealthTimeout { .. } => "health_timeout",
            Self::Io { .. } => "io",
            Self::ShutdownTimeout => "shutdown_timeout",
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::PortInUse { port } => format!("Port {port} is already in use. Close the program that is using it (another Crewspan?) and try again."),
            Self::SpawnFailed { .. } => "Crewspan could not start its local server runtime. Check the installation and try again.".into(),
            Self::EarlyExit { .. } => "Crewspan's local server stopped before it was ready. Try restarting the app.".into(),
            Self::ReadyTimeout { .. } | Self::HealthTimeout { .. } => "Crewspan's local server took too long to become ready. Try restarting the app.".into(),
            Self::NonceMismatch => "Crewspan could not verify its local server startup. Try restarting the app.".into(),
            Self::PortMismatch { .. } => "Crewspan's local server could not use its configured port. Restart the app and try again.".into(),
            Self::InvalidEnvironment { .. } => "Crewspan's local server configuration is invalid. Repair or reinstall the app, then try again.".into(),
            Self::StartFailed { .. } => "Crewspan's local server failed to start. Try restarting the app.".into(),
            Self::Io { .. } => "Crewspan could not access a required local resource. Check available disk space and permissions.".into(),
            Self::ShutdownTimeout => "Crewspan's local server did not stop cleanly and was forced to close.".into(),
        }
    }
}

impl fmt::Display for SidecarError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PortInUse { port } => write!(f, "Port {port} is already in use"),
            Self::SpawnFailed { .. } => f.write_str("Could not start the sidecar process"),
            Self::EarlyExit { code, .. } => {
                write!(f, "Sidecar exited before readiness (code {code:?})")
            }
            Self::ReadyTimeout { .. } => f.write_str("Sidecar readiness timed out"),
            Self::NonceMismatch => f.write_str("Sidecar readiness nonce did not match"),
            Self::PortMismatch { requested, actual } => {
                write!(f, "Sidecar listened on port {actual}, expected {requested}")
            }
            Self::InvalidEnvironment { .. } => f.write_str("Sidecar environment is invalid"),
            Self::StartFailed { .. } => f.write_str("Sidecar startup failed"),
            Self::HealthTimeout { .. } => f.write_str("Sidecar health check timed out"),
            Self::Io { .. } => f.write_str("Sidecar I/O failed"),
            Self::ShutdownTimeout => f.write_str("Sidecar shutdown timed out"),
        }
    }
}

impl Error for SidecarError {}
