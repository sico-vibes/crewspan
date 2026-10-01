use crewspan_sidecar_core::{Sidecar, SidecarConfig, SidecarError, StopOutcome};
use std::{net::TcpListener, path::PathBuf, process::Command, time::Duration};
use tempfile::TempDir;

fn node() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|p| p.join(if cfg!(windows) { "node.exe" } else { "node" }))
        .find(|p| p.is_file())
}
fn port() -> u16 {
    let s = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    s.local_addr().unwrap().port()
}
fn setup(
    mode: &str,
    status: &str,
    starting: usize,
    timeout: Duration,
    grace: Duration,
) -> Option<(TempDir, SidecarConfig)> {
    let Some(node) = node() else {
        eprintln!("skipping sidecar integration test: node is not on PATH");
        return None;
    };
    let dir = tempfile::tempdir().unwrap();
    let entry = dir.path().join("fake.mjs");
    std::fs::write(&entry, FAKE).unwrap();
    let loader = dir.path().join("loader.mjs");
    std::fs::write(&loader, "export {};\n").unwrap();
    let mut c = SidecarConfig::new(
        node,
        loader,
        entry,
        dir.path().to_owned(),
        dir.path().join("home"),
        dir.path().join("config.json"),
        dir.path().join("logs"),
    );
    c.port = port();
    c.ready_timeout = timeout;
    c.shutdown_grace = grace;
    c.health_poll_interval = Duration::from_millis(20);
    c.inherited_env = vec![
        ("FAKE_MODE".into(), mode.into()),
        ("FAKE_STATUS".into(), status.into()),
        ("FAKE_STARTING".into(), starting.to_string()),
    ];
    // Node on Windows aborts at startup (CSPRNG assertion) without SystemRoot.
    for (name, value) in std::env::vars() {
        if matches!(name.to_ascii_uppercase().as_str(), "SYSTEMROOT" | "WINDIR") {
            c.inherited_env.push((name, value));
        }
    }
    Some((dir, c))
}
const FAKE: &str = r#"
import http from 'node:http';
let requests = 0;
const nonce = process.env.CREWSPAN_SIDECAR_NONCE;
const port = Number(process.env.PORT);
const mode = process.env.FAKE_MODE || '';
if (mode === 'error') { console.error('CREWSPAN_SIDECAR_ERROR {"code":"invalid_env","message":"fake detail"}'); process.exit(65); }
if (mode === 'empty-exit') process.exit(2);
if (mode === 'verbose') setInterval(() => { for (let i = 0; i < 100; i++) console.log('verbose sidecar output'); }, 10);
if (mode === 'no-ready') { setInterval(() => {}, 1000); process.stdin.resume(); }
if (mode === 'bad-nonce' || mode === 'bad-port') { console.log(`CREWSPAN_SIDECAR_READY ${JSON.stringify({nonce: mode === 'bad-nonce' ? 'wrong' : nonce, port: mode === 'bad-port' ? port + 1 : port, pid: process.pid})}`); setInterval(() => {}, 1000); }
const server = http.createServer((req, res) => { requests++; const starting = Number(process.env.FAKE_STARTING || 0); const status = requests <= starting ? 'starting' : (process.env.FAKE_STATUS || 'ok'); const body = JSON.stringify({status}); res.writeHead(200, {'content-type':'application/json','content-length':Buffer.byteLength(body)}); res.end(body); });
server.listen(port, '127.0.0.1', () => { if (mode === 'invalid-utf8') process.stdout.write(Buffer.from([0xff, 0x0a])); if (!['no-ready','bad-nonce','bad-port'].includes(mode)) console.log(`CREWSPAN_SIDECAR_READY ${JSON.stringify({nonce, port, pid: process.pid})}`); });
process.stdin.setEncoding('utf8'); let input=''; process.stdin.on('data', chunk => { input += chunk; if (input.includes('shutdown')) { if (mode === 'hang') return; server.close(() => process.exit(0)); } });
"#;

#[test]
fn happy_path_health_logs_and_idempotent_stop() {
    let Some((_dir, config)) = setup("", "ok", 0, Duration::from_secs(4), Duration::from_secs(2))
    else {
        return;
    };
    let mut sidecar = Sidecar::start(config).unwrap();
    assert_eq!(
        sidecar.url(),
        format!("http://127.0.0.1:{}/", sidecar.port())
    );
    assert!(sidecar.is_running());
    let log = std::fs::read_to_string(sidecar.log_dir().join("sidecar.log")).unwrap();
    assert!(!log.contains("CREWSPAN_SIDECAR_NONCE"));
    assert_eq!(sidecar.stop(), StopOutcome::Graceful);
    assert_eq!(sidecar.stop(), StopOutcome::AlreadyStopped);
    assert!(!sidecar.is_running());
}
#[test]
fn health_starting_then_ok() {
    let Some((_dir, config)) = setup("", "ok", 3, Duration::from_secs(4), Duration::from_secs(2))
    else {
        return;
    };
    let mut sidecar = Sidecar::start(config).unwrap();
    assert_eq!(sidecar.stop(), StopOutcome::Graceful);
}

#[test]
fn invalid_utf8_before_ready_does_not_break_pipe_drain() {
    let Some((_dir, config)) = setup(
        "invalid-utf8",
        "ok",
        0,
        Duration::from_secs(4),
        Duration::from_secs(2),
    ) else {
        return;
    };
    let mut sidecar = Sidecar::start(config).unwrap();
    assert_eq!(sidecar.stop(), StopOutcome::Graceful);
}

#[test]
fn verbose_output_is_drained_while_health_is_starting() {
    let Some((_dir, config)) = setup(
        "verbose",
        "ok",
        20,
        Duration::from_secs(4),
        Duration::from_secs(2),
    ) else {
        return;
    };
    let mut sidecar = Sidecar::start(config).unwrap();
    assert_eq!(sidecar.stop(), StopOutcome::Graceful);
}
#[test]
fn port_in_use_is_rejected_before_spawn() {
    let Some((_dir, mut config)) =
        setup("", "ok", 0, Duration::from_secs(1), Duration::from_secs(1))
    else {
        return;
    };
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    config.port = listener.local_addr().unwrap().port();
    assert!(matches!(
        Sidecar::start(config),
        Err(SidecarError::PortInUse { .. })
    ));
}
#[test]
fn startup_errors_and_early_exit_are_reported() {
    let Some((_dir, config)) = setup(
        "error",
        "ok",
        0,
        Duration::from_secs(3),
        Duration::from_secs(1),
    ) else {
        return;
    };
    assert!(matches!(
        Sidecar::start(config),
        Err(SidecarError::InvalidEnvironment { .. })
    ));
    let Some((_dir, config)) = setup(
        "empty-exit",
        "ok",
        0,
        Duration::from_secs(3),
        Duration::from_secs(1),
    ) else {
        return;
    };
    assert!(
        matches!(Sidecar::start(config), Err(SidecarError::EarlyExit { stderr_tail, .. }) if stderr_tail.is_empty())
    );
}
#[test]
fn readiness_timeout_nonce_and_port_mismatch_kill_child() {
    let Some((_dir, config)) = setup(
        "no-ready",
        "ok",
        0,
        Duration::from_millis(250),
        Duration::from_secs(1),
    ) else {
        return;
    };
    assert!(matches!(
        Sidecar::start(config),
        Err(SidecarError::ReadyTimeout { .. })
    ));
    let Some((_dir, config)) = setup(
        "bad-nonce",
        "ok",
        0,
        Duration::from_secs(2),
        Duration::from_secs(1),
    ) else {
        return;
    };
    assert!(matches!(
        Sidecar::start(config),
        Err(SidecarError::NonceMismatch)
    ));
    let Some((_dir, config)) = setup(
        "bad-port",
        "ok",
        0,
        Duration::from_secs(2),
        Duration::from_secs(1),
    ) else {
        return;
    };
    assert!(matches!(
        Sidecar::start(config),
        Err(SidecarError::PortMismatch { .. })
    ));
}
#[test]
fn forced_stop_and_drop_stop_the_child() {
    let Some((_dir, config)) = setup(
        "hang",
        "ok",
        0,
        Duration::from_secs(3),
        Duration::from_millis(150),
    ) else {
        return;
    };
    let mut sidecar = Sidecar::start(config).unwrap();
    let start = std::time::Instant::now();
    assert_eq!(sidecar.stop(), StopOutcome::Forced);
    assert!(start.elapsed() < Duration::from_secs(3));
    let Some((_dir, config)) = setup("", "ok", 0, Duration::from_secs(3), Duration::from_secs(1))
    else {
        return;
    };
    let pid = {
        let sidecar = Sidecar::start(config).unwrap();
        sidecar.pid()
    };
    let gone = if cfg!(windows) {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}")])
            .output()
            .map(|o| !String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
    } else {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| !o.status.success())
    }
    .unwrap_or(true);
    assert!(gone, "sidecar process {pid} survived Drop");
}
