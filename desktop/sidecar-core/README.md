# `crewspan-sidecar-core`

A plain Rust library for starting, monitoring, and stopping the Crewspan server sidecar. It runs the pinned Node runtime with `--import <tsx loader file URL> <entry.mjs>`, waits for the nonce-bound READY line, then polls `/api/health` before returning a handle. The desktop shell should call it from a worker thread.

The listener is always restricted to `127.0.0.1`; the crate accepts no host setting. Environment inheritance is allowlist-oriented, startup output is logged with secret filtering and rotation, and shutdown requests `shutdown` over stdin before forcing termination after the grace period. This crate has no Tauri dependency.
