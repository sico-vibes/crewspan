use crate::{
    config::SidecarConfig,
    env::build_environment,
    error::SidecarError,
    health::{parse_health_response, HealthParse},
    logs::{drain_stderr, drain_stdout, Logger, Tail},
    protocol::{generate_nonce, parse_error_line, parse_ready_line, path_url, ReadyParse},
};
use std::{
    collections::VecDeque,
    io::Write,
    net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopOutcome {
    Graceful,
    Forced,
    AlreadyStopped,
}

#[cfg(windows)]
macro_rules! kill_failed_start {
    ($child:expr, $drains:expr, $job:expr) => {{
        if let Some(job) = $job.as_ref() {
            job.terminate();
        } else {
            windows_job::kill_tree($child.id());
        }
        kill_and_join($child, $drains);
    }};
}
#[cfg(not(windows))]
macro_rules! kill_failed_start {
    ($child:expr, $drains:expr, $job:expr) => {{
        let _ = stringify!($job);
        kill_and_join($child, $drains);
    }};
}

pub fn preflight_port(port: u16) -> Result<(), SidecarError> {
    if port == 0 {
        return Err(SidecarError::InvalidEnvironment {
            message: "The sidecar port must be between 1 and 65535.".into(),
        });
    }
    match TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            Err(SidecarError::PortInUse { port })
        }
        Err(e) => Err(SidecarError::Io {
            message: format!("Could not inspect local port ({})", safe_io_kind(&e)),
        }),
    }
}

pub struct Sidecar {
    child: Child,
    stdin: Option<std::process::ChildStdin>,
    port: u16,
    pid: u32,
    log_dir: PathBuf,
    grace: Duration,
    drains: Vec<JoinHandle<()>>,
    stopped: bool,
    #[cfg(windows)]
    job: Option<windows_job::Job>,
}

impl Sidecar {
    pub fn start(config: SidecarConfig) -> Result<Self, SidecarError> {
        preflight_port(config.port)?;
        let nonce = generate_nonce();
        let environment = build_environment(&config, &nonce);
        let env_values = crate::logs::secret_env_values(&environment);
        let logger =
            Logger::new(&config.log_dir, &nonce, &env_values).map_err(|e| SidecarError::Io {
                message: format!("Could not open sidecar log ({})", safe_io_kind(&e)),
            })?;
        let mut command = Command::new(&config.node_path);
        command
            .args(["--import", &path_url(&config.tsx_loader)])
            .arg(&config.entry_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(&config.working_dir)
            .env_clear();
        for (key, value) in &environment {
            command.env(key, value);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| SidecarError::SpawnFailed {
            message: format!("Could not start the local runtime ({})", safe_io_kind(&e)),
        })?;
        // The Job Object only prevents orphaned child processes (for example Postgres). It can fail
        // for environmental reasons, so a failure must not stop the app from starting: carry on
        // without it and fall back to `taskkill /T /F` when a forced stop is needed.
        #[cfg(windows)]
        let job = windows_job::Job::assign(&child).ok();
        let pid = child.id();
        let stdin = child.stdin.take();
        let (tx, rx) = mpsc::sync_channel(8);
        let stderr_tx = tx.clone();
        let tail: Tail = Arc::new(Mutex::new(VecDeque::with_capacity(50)));
        let drains = vec![
            drain_stdout(
                child.stdout.take().expect("piped stdout"),
                logger.clone(),
                tx,
            ),
            drain_stderr(
                child.stderr.take().expect("piped stderr"),
                logger,
                Arc::clone(&tail),
                stderr_tx,
            ),
        ];
        let started = Instant::now();
        let deadline = started + config.ready_timeout;
        let ready = loop {
            if let Some(status) = child.try_wait().map_err(|e| SidecarError::Io {
                message: format!("Could not inspect sidecar process ({})", safe_io_kind(&e)),
            })? {
                join_drains(drains);
                if let Some(mapped) = mapped_tail(&tail) {
                    return Err(mapped);
                }
                return Err(SidecarError::EarlyExit {
                    code: status.code(),
                    stderr_tail: tail_string(&tail),
                });
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                kill_failed_start!(&mut child, drains, job);
                return Err(SidecarError::ReadyTimeout {
                    waited: config.ready_timeout,
                });
            }
            match rx.recv_timeout(remaining.min(Duration::from_millis(100))) {
                Ok(line) => {
                    if let Some(error) = parse_error_line(&line) {
                        kill_failed_start!(&mut child, drains, job);
                        return Err(error);
                    }
                    match parse_ready_line(&line, &nonce) {
                        ReadyParse::NotReady => {}
                        ReadyParse::NonceMismatch => {
                            kill_failed_start!(&mut child, drains, job);
                            return Err(SidecarError::NonceMismatch);
                        }
                        ReadyParse::Ready {
                            port,
                            pid: ready_pid,
                        } => {
                            if port != config.port {
                                kill_failed_start!(&mut child, drains, job);
                                return Err(SidecarError::PortMismatch {
                                    requested: config.port,
                                    actual: port,
                                });
                            }
                            break (port, ready_pid);
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {}
            }
        };
        let _reported_pid = ready.1;
        let mut last_status = None;
        loop {
            for _line in rx.try_iter() {}
            if let Some(status) = child.try_wait().map_err(|e| SidecarError::Io {
                message: format!("Could not inspect sidecar process ({})", safe_io_kind(&e)),
            })? {
                join_drains(drains);
                if let Some(mapped) = mapped_tail(&tail) {
                    return Err(mapped);
                }
                return Err(SidecarError::EarlyExit {
                    code: status.code(),
                    stderr_tail: tail_string(&tail),
                });
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                kill_failed_start!(&mut child, drains, job);
                return Err(SidecarError::HealthTimeout {
                    waited: config.ready_timeout,
                    last_status,
                });
            }
            match check_health(config.port) {
                Ok(HealthParse::Ok) => break,
                Ok(HealthParse::Starting) => last_status = Some("starting".into()),
                Ok(HealthParse::Other(s)) => last_status = Some(s),
                Ok(HealthParse::Unparseable) | Err(()) => last_status = Some("unparseable".into()),
            }
            for _line in rx.try_iter() {}
            std::thread::sleep(config.health_poll_interval.min(remaining));
        }
        Ok(Self {
            child,
            stdin,
            port: ready.0,
            pid,
            log_dir: config.log_dir,
            grace: config.shutdown_grace,
            drains,
            stopped: false,
            #[cfg(windows)]
            job,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }
    pub fn pid(&self) -> u32 {
        self.pid
    }
    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }
    pub fn is_running(&mut self) -> bool {
        !self.stopped && self.child.try_wait().map(|s| s.is_none()).unwrap_or(false)
    }

    pub fn stop(&mut self) -> StopOutcome {
        if self.stopped {
            return StopOutcome::AlreadyStopped;
        }
        self.stopped = true;
        if let Some(mut stdin) = self.stdin.take() {
            let _ = stdin.write_all(b"shutdown\n");
            drop(stdin);
        }
        let deadline = Instant::now() + self.grace;
        let mut graceful = false;
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => {
                    graceful = true;
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        if !graceful {
            #[cfg(windows)]
            {
                match &self.job {
                    Some(job) => job.terminate(),
                    None => windows_job::kill_tree(self.child.id()),
                }
                // Safety net: harmless if the process is already gone.
                let _ = self.child.kill();
            }
            #[cfg(not(windows))]
            {
                let _ = self.child.kill();
            }
        }
        let _ = self.child.wait();
        join_drains(std::mem::take(&mut self.drains));
        #[cfg(windows)]
        {
            self.job.take();
        }
        if graceful {
            StopOutcome::Graceful
        } else {
            StopOutcome::Forced
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn check_health(port: u16) -> Result<HealthParse, ()> {
    let addr: SocketAddr = ("127.0.0.1", port)
        .to_socket_addrs()
        .map_err(|_| ())?
        .next()
        .ok_or(())?;
    let mut stream =
        TcpStream::connect_timeout(&addr, Duration::from_millis(400)).map_err(|_| ())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|_| ())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|_| ())?;
    stream
        .write_all(
            format!(
                "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            )
            .as_bytes(),
        )
        .map_err(|_| ())?;
    let mut response = String::new();
    use std::io::Read;
    stream.read_to_string(&mut response).map_err(|_| ())?;
    Ok(parse_health_response(&response))
}
fn tail_string(tail: &Tail) -> String {
    tail.lock()
        .map(|t| t.iter().cloned().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}
fn mapped_tail(tail: &Tail) -> Option<SidecarError> {
    tail.lock()
        .ok()?
        .iter()
        .find_map(|line| parse_error_line(line))
}
fn join_drains(drains: Vec<JoinHandle<()>>) {
    for handle in drains {
        let _ = handle.join();
    }
}
fn kill_and_join(child: &mut Child, drains: Vec<JoinHandle<()>>) {
    let _ = child.kill();
    let _ = child.wait();
    join_drains(drains);
}
fn safe_io_kind(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "resource not found",
        std::io::ErrorKind::PermissionDenied => "permission denied",
        std::io::ErrorKind::AddrInUse => "address in use",
        _ => "operating system error",
    }
}

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows_job {
    use std::{io, mem::size_of, process::Child};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
        },
    };
    /// Kills a process and everything it started (no Job Object available).
    pub fn kill_tree(pid: u32) {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .status();
    }

    pub struct Job(HANDLE);
    impl Job {
        pub fn assign(child: &Child) -> io::Result<Self> {
            // SAFETY: CreateJobObjectW accepts null security attributes/name and returns an owned handle.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                // SAFETY: GetLastError reads the calling thread's error from the failed creation call.
                return Err(io::Error::from_raw_os_error(
                    unsafe { GetLastError() } as i32
                ));
            }
            // SAFETY: the C structure accepts all-zero initialization; its flags are set immediately below.
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: the pointer and byte size refer to a live, correctly sized structure for this call.
            if unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            } == 0
            {
                // SAFETY: GetLastError reads the error from the failed configuration call.
                let code = unsafe { GetLastError() };
                // SAFETY: handle is the valid job handle created above and is released on this failure path.
                unsafe {
                    CloseHandle(handle);
                }
                return Err(io::Error::from_raw_os_error(code as i32));
            }
            // SAFETY: OpenProcess requests only rights needed for job assignment on this child PID.
            let process =
                unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, child.id()) };
            if process.is_null() {
                // SAFETY: GetLastError reads the error from the failed OpenProcess call.
                let code = unsafe { GetLastError() };
                // SAFETY: handle is the valid job handle created above and is released on this failure path.
                unsafe {
                    CloseHandle(handle);
                }
                return Err(io::Error::from_raw_os_error(code as i32));
            }
            // SAFETY: both handles are valid for the duration of this assignment call.
            let assigned = unsafe { AssignProcessToJobObject(handle, process) };
            // SAFETY: process is a valid process handle returned by OpenProcess and is released once.
            unsafe {
                CloseHandle(process);
            }
            if assigned == 0 {
                // SAFETY: GetLastError reads the error from the failed assignment call.
                let code = unsafe { GetLastError() };
                // SAFETY: handle is the valid job handle created above and is released on this failure path.
                unsafe {
                    CloseHandle(handle);
                }
                return Err(io::Error::from_raw_os_error(code as i32));
            }
            Ok(Self(handle))
        }
        pub fn terminate(&self) {
            // SAFETY: this object owns a valid job handle until Drop.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }
    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: this object owns the handle and drops it once.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}
