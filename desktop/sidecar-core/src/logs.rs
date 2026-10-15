use std::{
    collections::VecDeque,
    fs::{self, File, OpenOptions},
    io::{self, BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::ChildStderr,
    process::ChildStdout,
    sync::{mpsc::SyncSender, Arc, Mutex},
    thread::{self, JoinHandle},
};

const ROTATE_AT: u64 = 5 * 1024 * 1024;
const MAX_OUTPUT_LINE: usize = 4 * 1024 * 1024;
pub(crate) type Tail = Arc<Mutex<VecDeque<String>>>;

#[derive(Clone)]
pub(crate) struct Logger {
    dir: PathBuf,
    nonce: String,
    env_values: Vec<String>,
    file: Arc<Mutex<Option<File>>>,
}

/// Values worth masking in logs: those of variables whose NAME looks like a secret.
/// Config values such as `true`, `desktop` or `127.0.0.1` must never be masked: doing so
/// wipes almost every log line and makes the log useless. Values shorter than 8 characters
/// are not tracked (too short to be a real secret, too common to mask safely).
pub(crate) fn secret_env_values(environment: &[(String, String)]) -> Vec<String> {
    const MARKERS: [&str; 5] = ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL"];
    environment
        .iter()
        .filter(|(name, value)| {
            let upper = name.to_ascii_uppercase();
            value.len() >= 8 && MARKERS.iter().any(|marker| upper.contains(marker))
        })
        .map(|(_, value)| value.clone())
        .collect()
}

impl Logger {
    pub(crate) fn new(dir: &Path, nonce: &str, env_values: &[String]) -> std::io::Result<Self> {
        fs::create_dir_all(dir)?;
        let logger = Self {
            dir: dir.to_owned(),
            nonce: nonce.to_owned(),
            env_values: env_values
                .iter()
                .filter(|v| !v.is_empty())
                .cloned()
                .collect(),
            file: Arc::new(Mutex::new(None)),
        };
        logger.open_file()?;
        Ok(logger)
    }
    fn open_file(&self) -> std::io::Result<()> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.dir.join("sidecar.log"))?;
        *self.file.lock().expect("log mutex poisoned") = Some(file);
        Ok(())
    }
    fn sanitized(&self, line: &str) -> String {
        let mut safe = line.to_owned();
        if !self.nonce.is_empty() {
            safe = safe.replace(&self.nonce, "***");
        }
        if self.env_values.iter().any(|value| safe.contains(value)) {
            safe = "[redacted sidecar output]".into();
        }
        safe
    }
    fn write(&self, stream: &str, line: &str) {
        let safe = self.sanitized(line);
        let Ok(mut guard) = self.file.lock() else {
            return;
        };
        let path = self.dir.join("sidecar.log");
        let too_large = guard
            .as_ref()
            .and_then(|f| f.metadata().ok())
            .is_some_and(|m| m.len() >= ROTATE_AT);
        if too_large {
            guard.take();
            let _ = fs::remove_file(self.dir.join("sidecar.log.3"));
            for i in (1..=2).rev() {
                let old = self.dir.join(format!("sidecar.log.{i}"));
                if old.exists() {
                    let _ = fs::rename(old, self.dir.join(format!("sidecar.log.{}", i + 1)));
                }
            }
            if path.exists() {
                let _ = fs::rename(&path, self.dir.join("sidecar.log.1"));
            }
            *guard = OpenOptions::new().create(true).append(true).open(path).ok();
        }
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "[{stream}] {safe}");
        }
    }

    pub(crate) fn timing_phase(&self, phase: &str, at_ms: u128) {
        self.write("timing", &format!("phase={phase} at_ms={at_ms}"));
    }

    pub(crate) fn timing_summary(
        &self,
        ready_ms: u128,
        health_ok_ms: u128,
        timing: &crate::protocol::StartupTiming,
    ) {
        self.write(
            "timing",
            &format!(
                "summary ready_ms={ready_ms} health_ok_ms={health_ok_ms} node_boot_ms={} seed_ms={} import_ms={} start_server_ms={}",
                timing.node_boot_ms.unwrap_or_default(),
                timing.seed_ms.unwrap_or_default(),
                timing.import_ms.unwrap_or_default(),
                timing.start_server_ms.unwrap_or_default(),
            ),
        );
    }
}

pub(crate) fn drain_stdout(
    stream: ChildStdout,
    logger: Logger,
    sender: SyncSender<String>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let _ = read_lossy_lines(BufReader::new(stream), |line| {
            logger.write("out", &line);
            let _ = sender.send(line);
        });
    })
}
pub(crate) fn drain_stderr(
    stream: ChildStderr,
    logger: Logger,
    tail: Tail,
    sender: SyncSender<String>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let _ = read_lossy_lines(BufReader::new(stream), |line| {
            logger.write("err", &line);
            let _ = sender.send(line.clone());
            if let Ok(mut ring) = tail.lock() {
                if ring.len() == 50 {
                    ring.pop_front();
                }
                ring.push_back(logger.sanitized(&line));
            }
        });
    })
}

fn read_lossy_lines<R: BufRead>(mut reader: R, mut on_line: impl FnMut(String)) -> io::Result<()> {
    let mut line = Vec::new();
    let mut truncated = false;
    loop {
        let (consumed, newline) = {
            let available = reader.fill_buf()?;
            if available.is_empty() {
                if !line.is_empty() || truncated {
                    on_line(decode_line(&line, truncated));
                }
                return Ok(());
            }
            let newline = available.iter().position(|byte| *byte == b'\n');
            let consumed = newline.map_or(available.len(), |index| index + 1);
            let payload_len = newline.map_or(consumed, |index| index);
            let copy_len = payload_len.min(MAX_OUTPUT_LINE.saturating_sub(line.len()));
            line.extend_from_slice(&available[..copy_len]);
            truncated |= copy_len < payload_len;
            (consumed, newline.is_some())
        };
        reader.consume(consumed);
        if newline {
            on_line(decode_line(&line, truncated));
            line.clear();
            truncated = false;
        }
    }
}

fn decode_line(bytes: &[u8], truncated: bool) -> String {
    let mut line = String::from_utf8_lossy(bytes).into_owned();
    if line.ends_with('\r') {
        line.pop();
    }
    if truncated {
        line.push_str(" [line truncated]");
    }
    line
}
#[cfg(test)]
pub(crate) fn append_test_lines(dir: &Path, lines: &[String]) -> std::io::Result<()> {
    let logger = Logger::new(dir, "", &[])?;
    for line in lines {
        logger.write("out", line);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_reader_lossily_decodes_and_caps_long_lines() {
        let mut lines = Vec::new();
        read_lossy_lines(&b"\xffready\n"[..], |line| lines.push(line)).unwrap();
        assert_eq!(lines, vec!["�ready"]);

        let input = vec![b'a'; MAX_OUTPUT_LINE + 16];
        let mut lines = Vec::new();
        read_lossy_lines(&input[..], |line| lines.push(line)).unwrap();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].ends_with(" [line truncated]"));
        assert!(lines[0].len() < MAX_OUTPUT_LINE + 32);
    }

    #[test]
    fn only_secret_looking_values_are_masked_and_logs_stay_readable() {
        let environment = vec![
            ("SERVE_UI".to_string(), "true".to_string()),
            ("PAPERCLIP_INSTANCE_ID".to_string(), "desktop".to_string()),
            ("HOST".to_string(), "127.0.0.1".to_string()),
            ("NODE_ENV".to_string(), "production".to_string()),
            (
                "OPENAI_API_KEY".to_string(),
                "sk-test-0123456789".to_string(),
            ),
            ("SHORT_TOKEN".to_string(), "abc".to_string()),
        ];
        let secrets = secret_env_values(&environment);
        assert_eq!(secrets, vec!["sk-test-0123456789".to_string()]);

        let temp = tempfile::tempdir().unwrap();
        let logger = Logger::new(temp.path(), "nonce-abcdef012345", &secrets).unwrap();
        assert_eq!(
            logger.sanitized("listening on 127.0.0.1 desktop true production"),
            "listening on 127.0.0.1 desktop true production"
        );
        assert_eq!(
            logger.sanitized("handshake nonce-abcdef012345 done"),
            "handshake *** done"
        );
        assert_eq!(
            logger.sanitized("auth header sk-test-0123456789 sent"),
            "[redacted sidecar output]"
        );
    }
    #[test]
    fn rotates_and_keeps_three_old_files() {
        let temp = tempfile::tempdir().unwrap();
        let line = "x".repeat(1024);
        let lines = vec![line; 15 * 1024 + 40];
        append_test_lines(temp.path(), &lines).unwrap();
        assert!(temp.path().join("sidecar.log").is_file());
        for index in 1..=3 {
            assert!(temp.path().join(format!("sidecar.log.{index}")).is_file());
        }
        assert!(!temp.path().join("sidecar.log.4").exists());
    }
}
