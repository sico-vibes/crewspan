use crate::SidecarError;
use serde::Deserialize;
use std::{
    hash::{BuildHasher, Hasher},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const READY: &str = "CREWSPAN_SIDECAR_READY ";
const ERROR: &str = "CREWSPAN_SIDECAR_ERROR ";
pub(crate) const TIMING: &str = "CREWSPAN_SIDECAR_TIMING ";

#[derive(Debug, Default, Deserialize)]
pub(crate) struct StartupTiming {
    pub node_boot_ms: Option<u64>,
    pub seed_ms: Option<u64>,
    pub import_ms: Option<u64>,
    pub start_server_ms: Option<u64>,
}

pub(crate) fn parse_timing_line(line: &str) -> Option<StartupTiming> {
    let json = line.strip_prefix(TIMING)?;
    serde_json::from_str(json).ok()
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReadyParse {
    NotReady,
    Ready { port: u16, pid: u32 },
    NonceMismatch,
}

#[derive(Deserialize)]
struct ReadyMessage {
    nonce: String,
    port: u16,
    pid: u32,
}

pub fn parse_ready_line(line: &str, expected_nonce: &str) -> ReadyParse {
    let Some(json) = line.strip_prefix(READY) else {
        return ReadyParse::NotReady;
    };
    let Ok(value) = serde_json::from_str::<ReadyMessage>(json) else {
        return ReadyParse::NotReady;
    };
    if value.nonce != expected_nonce {
        return ReadyParse::NonceMismatch;
    }
    ReadyParse::Ready {
        port: value.port,
        pid: value.pid,
    }
}

#[derive(Deserialize)]
struct ErrorMessage {
    code: String,
    requested: Option<u16>,
    actual: Option<u16>,
}

pub fn parse_error_line(line: &str) -> Option<SidecarError> {
    let json = line.strip_prefix(ERROR)?;
    let msg: ErrorMessage = serde_json::from_str(json).ok()?;
    Some(match msg.code.as_str() {
        "invalid_env" => SidecarError::InvalidEnvironment {
            message: "The sidecar rejected its configuration.".into(),
        },
        "port_mismatch" => SidecarError::PortMismatch {
            requested: msg.requested?,
            actual: msg.actual?,
        },
        "start_failed" => SidecarError::StartFailed {
            message: "The sidecar reported a startup failure.".into(),
        },
        "shutdown_timeout" => SidecarError::StartFailed {
            message: "The sidecar shutdown timed out.".into(),
        },
        "shutdown_failed" => SidecarError::StartFailed {
            message: "The sidecar could not shut down cleanly.".into(),
        },
        _ => return None,
    })
}

/// Windows APIs can return "verbatim" paths (`\\?\C:\dir`). Node rejects the
/// matching file URL, so convert them to the ordinary drive form first.
pub fn strip_verbatim_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_owned()
    } else {
        path.to_owned()
    }
}

pub fn path_to_file_url(path: &str) -> String {
    let path = strip_verbatim_prefix(path);
    let normalized = path.replace('\\', "/");
    let absolute = if normalized.starts_with('/') {
        normalized
    } else {
        format!("/{normalized}")
    };
    let mut out = String::from("file://");
    for (i, byte) in absolute.bytes().enumerate() {
        let drive_colon = i == 2
            && absolute
                .as_bytes()
                .get(1)
                .is_some_and(u8::is_ascii_alphabetic)
            && byte == b':';
        if byte.is_ascii_alphanumeric()
            || matches!(byte, b'/' | b'-' | b'_' | b'.' | b'~')
            || drive_colon
        {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn path_url(path: &Path) -> String {
    path_to_file_url(&path.to_string_lossy())
}

pub fn generate_nonce() -> String {
    let mut bytes = [0u8; 16];
    #[cfg(unix)]
    {
        use std::io::Read;
        if std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut bytes))
            .is_ok()
        {
            return bytes.iter().map(|b| format!("{b:02x}")).collect();
        }
    }
    // On Windows std exposes no CSPRNG API. This is a per-launch handshake, not a secret key.
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        ^ (std::process::id() as u128);
    for round in 0..4 {
        let state = std::collections::hash_map::RandomState::new();
        let mut hasher = state.build_hasher();
        hasher.write_u128(seed.rotate_left(round * 23));
        hasher.write_u32(std::process::id());
        let offset = round as usize * 4;
        bytes[offset..offset + 4].copy_from_slice(&(hasher.finish() as u32).to_le_bytes());
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
