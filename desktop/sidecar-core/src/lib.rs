#![deny(unsafe_code)]

mod config;
mod env;
mod error;
mod health;
mod logs;
mod phase;
mod process;
mod protocol;

pub use config::SidecarConfig;
pub use env::{build_environment, environment_name_is_blocked};
pub use error::SidecarError;
pub use health::{parse_health_response, HealthParse};
pub use phase::{classify_line, PhaseSignal, StartupPhase, StartupProgress};
pub use process::{preflight_port, Sidecar, StopOutcome};
pub use protocol::{
    generate_nonce, parse_error_line, parse_ready_line, path_to_file_url, ReadyParse,
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn config() -> SidecarConfig {
        SidecarConfig::new(
            "n".into(),
            Some("t".into()),
            "e".into(),
            "w".into(),
            "d".into(),
            "c".into(),
            "l".into(),
        )
    }

    #[test]
    fn environment_is_filtered_sorted_and_preserves_opt_outs() {
        let mut c = config();
        c.inherited_env = vec![
            ("PORT".into(), "9".into()),
            ("PAPERCLIP_SECRET".into(), "fake".into()),
            ("DO_NOT_TRACK".into(), "1".into()),
            ("PAPERCLIP_TELEMETRY_DISABLED".into(), "true".into()),
            ("DATABASE_URL".into(), "fake-db".into()),
            ("SAFE".into(), "yes".into()),
            (
                "CREWSPAN_SIDECAR_DB_TEMPLATE".into(),
                "inherited-path".into(),
            ),
        ];
        let env = build_environment(&c, "nonce");
        assert!(env.windows(2).all(|w| w[0].0 <= w[1].0));
        assert!(!env
            .iter()
            .any(|(k, _)| k == "PORT" && env.iter().any(|(_, v)| v == "9")));
        assert!(env.contains(&("DO_NOT_TRACK".into(), "1".into())));
        assert!(env.contains(&("PAPERCLIP_TELEMETRY_DISABLED".into(), "true".into())));
        assert!(env.contains(&("HOST".into(), "127.0.0.1".into())));
        assert!(env.contains(&("CREWSPAN_SIDECAR_DB_TEMPLATE".into(), "off".into())));
        assert!(!env
            .iter()
            .any(|(k, _)| k == "PAPERCLIP_SECRET" || k == "DATABASE_URL"));
    }
    #[test]
    fn environment_name_case_rules_are_explicit() {
        assert!(!environment_name_is_blocked("paperclip_secret", false));
        assert!(environment_name_is_blocked("paperclip_secret", true));
        assert!(!environment_name_is_blocked("do_not_track", true));
        assert!(!environment_name_is_blocked(
            "paperclip_telemetry_disabled",
            true
        ));
    }
    #[test]
    fn configured_database_template_overrides_the_inherited_environment() {
        let mut c = config();
        c.db_template = Some(PathBuf::from("/bundle/stage/db-template"));
        c.inherited_env = vec![(
            "CREWSPAN_SIDECAR_DB_TEMPLATE".into(),
            "inherited-path".into(),
        )];
        assert!(build_environment(&c, "nonce").contains(&(
            "CREWSPAN_SIDECAR_DB_TEMPLATE".into(),
            "/bundle/stage/db-template".into()
        )));
    }

    #[test]
    fn preflight_rejects_port_zero_without_binding() {
        assert!(matches!(
            preflight_port(0),
            Err(SidecarError::InvalidEnvironment { .. })
        ));
    }

    #[test]
    fn cancelled_start_returns_before_spawning() {
        use std::sync::atomic::AtomicBool;

        let cancel = AtomicBool::new(true);
        let mut callback = |_| {};
        assert!(matches!(
            Sidecar::start_cancellable(config(), &cancel, &mut callback),
            Err(SidecarError::Cancelled)
        ));
    }
    #[test]
    fn protocol_parsers_cover_ready_and_errors() {
        assert_eq!(parse_ready_line("other", "n"), ReadyParse::NotReady);
        assert_eq!(
            parse_ready_line("CREWSPAN_SIDECAR_READY {bad}", "n"),
            ReadyParse::NotReady
        );
        assert_eq!(
            parse_ready_line(
                "CREWSPAN_SIDECAR_READY {\"nonce\":\"x\",\"port\":4,\"pid\":7}",
                "n"
            ),
            ReadyParse::NonceMismatch
        );
        assert_eq!(
            parse_ready_line(
                "CREWSPAN_SIDECAR_READY {\"nonce\":\"n\",\"port\":4,\"pid\":7}",
                "n"
            ),
            ReadyParse::Ready { port: 4, pid: 7 }
        );
        assert!(matches!(
            parse_error_line("CREWSPAN_SIDECAR_ERROR {\"code\":\"invalid_env\"}"),
            Some(SidecarError::InvalidEnvironment { .. })
        ));
        assert!(matches!(
            parse_error_line(
                "CREWSPAN_SIDECAR_ERROR {\"code\":\"port_mismatch\",\"requested\":3,\"actual\":4}"
            ),
            Some(SidecarError::PortMismatch {
                requested: 3,
                actual: 4
            })
        ));
        for code in ["start_failed", "shutdown_timeout", "shutdown_failed"] {
            let line = format!(
                "CREWSPAN_SIDECAR_ERROR {{\"code\":\"{code}\",\"message\":\"fake secret\"}}"
            );
            let error = parse_error_line(&line).unwrap();
            assert!(matches!(error, SidecarError::StartFailed { .. }));
            assert!(!error.to_string().contains("fake secret"));
        }
    }
    #[test]
    fn health_parses_standard_and_chunked_responses() {
        assert_eq!(
            parse_health_response(
                "HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}"
            ),
            HealthParse::Ok
        );
        assert_eq!(parse_health_response("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n15\r\n{\"status\":\"starting\"}\r\n0\r\n\r\n"), HealthParse::Starting);
        assert_eq!(
            parse_health_response("HTTP/1.1 200 OK\r\n\r\n{\"status\":\"busy\"}"),
            HealthParse::Other("busy".into())
        );
        assert_eq!(parse_health_response("garbage"), HealthParse::Unparseable);
        assert_eq!(
            parse_health_response(
                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nffffffffffffffff\r\n"
            ),
            HealthParse::Unparseable
        );
        assert_eq!(
            parse_health_response("HTTP/1.1 503 Nope\r\n\r\n{\"status\":\"ok\"}"),
            HealthParse::Unparseable
        );
    }
    #[test]
    fn file_urls_encode_and_normalize_both_path_shapes() {
        assert_eq!(
            path_to_file_url("/opt/Crew span/a#b.mjs"),
            "file:///opt/Crew%20span/a%23b.mjs"
        );
        assert_eq!(
            path_to_file_url("C:\\Program Files\\x.mjs"),
            "file:///C:/Program%20Files/x.mjs"
        );
        assert_eq!(
            path_to_file_url(r"\\?\C:\Users\a b\x.mjs"),
            "file:///C:/Users/a%20b/x.mjs"
        );
        assert_eq!(
            crate::protocol::strip_verbatim_prefix(r"\\?\UNC\srv\share\x"),
            r"\\srv\share\x"
        );
        assert_eq!(
            path_to_file_url("/tmp/café.mjs"),
            "file:///tmp/caf%C3%A9.mjs"
        );
    }
    #[test]
    fn nonce_is_128_bit_hex_and_unique() {
        let values = (0..1000)
            .map(|_| generate_nonce())
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(values.len(), 1000);
        assert!(values
            .iter()
            .all(|v| v.len() == 32 && v.chars().all(|c| c.is_ascii_hexdigit())));
    }
    #[test]
    fn error_presentations_never_include_payload_secrets() {
        let error = SidecarError::StartFailed {
            message: "fake-secret".into(),
        };
        assert!(!error.to_string().contains("fake-secret"));
        assert!(!error.user_message().contains("fake-secret"));
        let _ = PathBuf::from("unused");
    }
}
