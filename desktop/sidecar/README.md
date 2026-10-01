# Crewspan server sidecar

The desktop shell starts `entry.mjs` with its pinned Node runtime. The script imports the built server module and calls `startServer()`; it never launches `server/dist/index.js` as the process entry point. The shell must set `HOST=127.0.0.1` and `PORT=3100`.

## Environment

- `CREWSPAN_SIDECAR_NONCE` — required, non-empty; echoed in the readiness message.
- `CREWSPAN_SIDECAR_SERVER_ENTRY` — optional server module path. Default: `../app/server/dist/index.js` relative to this script.
- `PORT` — required integer from 1 through 65535. A different actual listen port is rejected.
- `HOST` — required and must equal `127.0.0.1`.
- `PAPERCLIP_CONFIG` — required absolute config path. Its directory contains the `.env` file used for secrets.
- `CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS` — optional positive integer; default `45000`.

Before importing the server, the entry script ensures `PAPERCLIP_AGENT_JWT_SECRET` and `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`. Missing values are 32 random bytes encoded as 64 lowercase hexadecimal characters, stored in the adjacent `.env` without replacing existing values. A new file is atomically published; an existing file is atomically replaced when a key must be added. On POSIX, the file is secured to mode `0600`. Values already supplied in the process environment are used as-is and are not written to the file.

## Protocol and exit codes

After a successful start and strict port check, stdout receives one line:

```text
CREWSPAN_SIDECAR_READY {"nonce":"…","port":3100,"pid":1234}
```

The shell may write `shutdown` to stdin. A matching trimmed line, stdin EOF, SIGTERM, or SIGINT requests shutdown once. A successful shutdown exits `0`; stdin EOF before readiness also exits `0` without a READY line when shutdown completes before its deadline.

Errors are one-line JSON messages on stderr, prefixed with `CREWSPAN_SIDECAR_ERROR `:

| Exit | Code | Meaning |
| ---: | --- | --- |
| 0 | — | Requested shutdown completed (or stdin closed before ready) |
| 1 | `start_failed` | Secret setup, module import, or server startup failed |
| 1 | `shutdown_failed` | Server shutdown rejected |
| 64 | `port_mismatch` | Server selected a port other than `PORT`; shutdown was requested |
| 65 | `invalid_env` | Required environment is missing or invalid |
| 70 | `shutdown_timeout` | Shutdown did not resolve before the deadline, including before readiness |

## Known limitations

Found by independent QA and accepted for the first beta. The desktop shell is single-instance and the strict port 3100
stops a second sidecar, so none of these is reachable in normal use.

- If `.env` already exists but lacks a secret, two sidecars started at the same instant against the same data directory can
  each generate their own value; the last rename wins and one process runs with a value that is not persisted. A new `.env` is
  race-safe (`linkSync`).
- An existing `.env` with mode `0400` is left as is (stricter than `0600`).
- `CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS` accepts forms such as `1e3` and `45.0`.
- If stdin closes in the instant between "ready" being set and the READY line being flushed, the process can exit 0 without
  having printed READY (suspected from reading; not reproduced).
- Only a fake server and Linux were exercised. The real built server and Windows are verified by CI and by the owner.
