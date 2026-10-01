use serde::Deserialize;
use std::time::Duration;

pub const SERVER_PHASE_MARKERS: &str = include_str!("phase-markers.json");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupPhase {
    Launching,
    PreparingDatabase,
    ApplyingUpdates,
    StartingServer,
    Loading,
}

impl StartupPhase {
    pub fn label(self) -> &'static str {
        match self {
            Self::Launching => "Starting…",
            Self::PreparingDatabase => "Preparing database",
            Self::ApplyingUpdates => "Applying updates",
            Self::StartingServer => "Starting server",
            Self::Loading => "Loading Crewspan",
        }
    }

    fn rank(self) -> u8 {
        match self {
            Self::Launching => 0,
            Self::PreparingDatabase => 1,
            Self::ApplyingUpdates => 2,
            Self::StartingServer => 3,
            Self::Loading => 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StartupProgress {
    pub phase: StartupPhase,
    pub elapsed: Duration,
    pub detail: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PhaseSignal {
    pub phase: StartupPhase,
    pub detail: Option<u32>,
}

impl PhaseSignal {
    pub fn advance(self, current: StartupPhase) -> StartupPhase {
        if self.phase.rank() > current.rank() {
            self.phase
        } else {
            current
        }
    }
}

#[derive(Deserialize)]
struct SidecarPhase {
    phase: String,
}

#[derive(Deserialize)]
struct PinoLine {
    msg: String,
}

pub fn classify_line(line: &str) -> Option<PhaseSignal> {
    if let Some(json) = line.strip_prefix("CREWSPAN_SIDECAR_PHASE ") {
        let phase = serde_json::from_str::<SidecarPhase>(json).ok()?.phase;
        let phase = match phase.as_str() {
            "seed_database" | "load_server" => StartupPhase::PreparingDatabase,
            "start_server" => StartupPhase::PreparingDatabase,
            _ => return None,
        };
        return Some(PhaseSignal {
            phase,
            detail: None,
        });
    }

    let msg = serde_json::from_str::<PinoLine>(line).ok()?.msg;
    let markers: Vec<&str> = serde_json::from_str(SERVER_PHASE_MARKERS).ok()?;
    let marker = *markers.iter().find(|marker| msg.starts_with(**marker))?;
    let phase = match marker {
        "Using embedded PostgreSQL because no DATABASE_URL set"
        | "Embedded PostgreSQL cluster already exists" => StartupPhase::PreparingDatabase,
        "Detected first-run embedded PostgreSQL setup" | "Applying " => {
            StartupPhase::ApplyingUpdates
        }
        "Embedded PostgreSQL ready" => StartupPhase::StartingServer,
        "Server listener bound on" => StartupPhase::StartingServer,
        "Server startup recovery complete" => StartupPhase::Loading,
        _ => return None,
    };
    let detail = if marker == "Applying " {
        msg.strip_prefix("Applying ")
            .and_then(|tail| tail.split_once(" pending migrations"))
            .and_then(|(count, _)| count.parse::<u32>().ok())
    } else {
        None
    };
    Some(PhaseSignal { phase, detail })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_server_marker_classifies_and_progress_never_moves_backwards() {
        let markers: Vec<&str> = serde_json::from_str(SERVER_PHASE_MARKERS).unwrap();
        let mut current = StartupPhase::Launching;
        for marker in markers {
            let message = if marker == "Applying " {
                "Applying 12 pending migrations for Embedded PostgreSQL"
            } else {
                marker
            };
            let line = serde_json::json!({ "level": 30, "msg": message }).to_string();
            let signal = classify_line(&line).expect(message);
            let previous = current;
            current = signal.advance(current);
            assert!(current.rank() >= previous.rank());
            assert!(current.rank() >= signal.phase.rank());
            if marker == "Applying " {
                assert_eq!(signal.detail, Some(12));
            }
        }
        assert_eq!(current, StartupPhase::Loading);
    }

    #[test]
    fn sidecar_markers_and_real_pino_lines_are_recognized() {
        assert_eq!(
            classify_line(r#"CREWSPAN_SIDECAR_PHASE {"phase":"seed_database","elapsedMs":4}"#)
                .unwrap()
                .phase,
            StartupPhase::PreparingDatabase
        );
        assert_eq!(
            classify_line(
                r#"{"level":30,"msg":"Applying 3 pending migrations for Embedded PostgreSQL"}"#
            )
            .unwrap()
            .detail,
            Some(3)
        );
        assert_eq!(classify_line("garbage"), None);
        assert_eq!(
            classify_line(r#"CREWSPAN_SIDECAR_PHASE {"phase":"untrusted","elapsedMs":0}"#),
            None
        );
    }
}
