# M1 P1: Windows desktop beta - plan

**Status:** implementation underway; Windows release proof remains outstanding. **Author of the plan:** Claude Opus 5.5 (effort high, read-only),
dispatched through the `plan` lane of the AI orchestration layer (`doc/AI-ORCHESTRATION.md`).
The planner changed no files. The lead reviewed the plan and spot-checked its key claims against the repo.

## Lead review (changes to the plan below)

Verified against the repo: `startServer()` returns `listenPort` and `shutdown()` and does not auto-start on
import; the server silently falls back to another port when the requested one is busy; on Windows
`embedded-postgres` stops Postgres with `taskkill /f /t` (a hard kill); no `desktop/` directory, no Tauri
code and no `windows-latest` job exist yet.

1. **Repo visibility is resolved.** The repo is public, so risk 1 below (private repo blocks the updater
   feed) does not apply. Decision O1 is closed.
2. **Split T5.** T5 is too large for one delegated run. It is split into T5a (Tauri scaffold, config,
   splash), T5b (sidecar lifecycle wiring, quit sequencing) and T5c (navigation guard, IPC capabilities,
   single-instance, elevation error).
3. **Keep T3 minimal.** `server/src/index.ts` is an upstream-owned file. T3 adds at most a few lines there
   and puts the logic in a new file, to keep the upstream sync cost low.
4. **Phase 0 does not block T1-T4.** Code can proceed with the public-key placeholder. Phase 0 must be done
   before T7 and T8.
5. **New owner decision O12.** Update behaviour: the plan prompts the user before installing an update. The
   owner's definition of done says the next release "auto-updates" the app. Confirm that prompt-then-install
   is acceptable, or choose silent install on next launch.
6. **Workflow limits.** Codex runs in a Linux container and cannot build or run a Windows installer. Windows
   behaviour is proven only by Windows CI and by the owner's manual test (section 6).

## Implementation update (2026-10-01)

Implementation update recorded 2026-10-01. Linux evidence and source inspection are separated from Windows-only proof below.

- **Packaging recipe (replaces `pnpm deploy`).** `pnpm --filter @paperclipai/server deploy --prod` gave 1.4 GB, 45,541 files and 1,738 symlinks, which a Windows installer
  cannot carry. Instead: (1) full install and build; (2) in a clean checkout, `pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@paperclipai/server..."
  --config.node-linker=hoisted` (about 5 s, no symlinks except `.bin`); (3) `scripts/desktop/stage-server.mjs` copies the built server, the UI and the needed workspace
  packages (as real directories under `app/node_modules/@paperclipai`) into a stage folder; (4) run with the pinned Node and the tsx loader, as upstream's Dockerfile does.
  Layout: `runtime/`, `sidecar/entry.mjs`, `app/server/{dist,ui-dist,skills}`, `app/node_modules`. (The plan text said `app/ui-dist`; the built layout is `app/server/ui-dist`.)
- **Real Linux end-to-end run passed**: pinned Node 24.21.0 + tsx + `entry.mjs` + the real built server + embedded PostgreSQL. READY in about 15-18 s on first run, `/api/health` ok,
  UI served (HTTP 200), server and Postgres bound to `127.0.0.1` only, clean shutdown with no leftover process and no stale `postmaster.pid`.
- **Size.** Linux stage: 86,308 files and 2.7 GB. Pruning `*.d.ts` and `*.map` from `node_modules` (on by default, `--no-prune` to disable) gives 52,136 files and 2.25 GB. The
  payload is dominated by bundled agent CLI binaries (Claude, Codex, OpenCode). Windows has one variant of each, so it is smaller. Expect a large installer.
- **Windows MAX_PATH.** Worst relative path is 182 characters; with a 60-character install prefix the worst case is 242 of 259. The default per-user install path is
  `C:\Users\<name>\AppData\Local\Crewspan\`.
- **The shell must never create `config.json`.** The server accepts a missing config (defaults, embedded Postgres) but rejects an empty `{}`. The sidecar only needs the config
  *path*, to place its `.env` secrets file next to it.
- **Gate fix.** `node --test <directory>` does not work; name the test files.
- **Build phases now present in the repository:** staged server payload and entry script; Windows Postgres clean-stop support; Rust sidecar lifecycle core; Tauri shell with splash, tray, navigation guard, first-run progress and shutdown; Windows CI installer build; updater check/prompt/install wiring; and release workflow/feed generation. The sidecar startup reports named phases and timings to the splash and app log. A database template is built optionally in CI to accelerate first launch, with initialization fallback if it is unavailable.
- **No-tsx staging is supported:** the stage manifest selects either the tsx loader or direct Node startup. The current Node 24.21.0 run used tsx; direct/no-tsx startup remains **UNPROVEN** until its staged path is exercised.
- **Lifecycle polish in this update:** cancellable first-run startup, five-second sidecar process monitoring, and Restart/Quit recovery are implemented. Rust unit gates can validate the pure decision and lifecycle core, but the Tauri dialog and window navigation are **UNPROVEN** until a Windows GUI run.
- **Local sandbox gate limits:** the ten sidecar loopback integration tests are **UNPROVEN** here because the sandbox denies test-port binding (`Operation not permitted`). The named Node gate passed the db-template, phase-marker and staging files; `desktop/sidecar/entry.test.mjs` is **UNPROVEN** in this sandbox because its child test process exits with code 1 without a diagnostic. Rerun those gates in ordinary CI.
- **Tauri cannot be compiled in this Linux container** (no GTK/WebKit). The Windows target check and Windows CI job are separate gates; installer creation, first-run timing, process cleanup, tray behavior, updater signing/install, SmartScreen and clean-machine startup are **UNPROVEN** until those Windows runs succeed.
- **Updater code and feed workflow are present**, but successful signed update installation is **UNPROVEN** until a Windows beta upgrades to a later release with the configured signing key and feed.
- **NSIS compression uses zlib** to reduce installer build time in CI compared with higher-compression settings; this trades a potentially larger installer for faster packaging. Actual wall-time and output-size effects remain **UNPROVEN** until Windows CI measures them.

---

# Crewspan M1 P1: Windows desktop beta (Tauri shell, sidecar, GitHub Releases auto-update)

**Why:** ADR-0001 and the M1 handoff §4 require an installable, self-updating Windows app, built from the unchanged server + SPA monolith. **Done when:** a Windows user installs the beta from Releases with no dev toolchain and no external Postgres, it runs, and the next published release updates it automatically.

## 1. Findings

### a. Rust/Tauri scaffolding
- **What exists:** one Rust workspace, the runner, at `packages/paperclip-runner/runner/Cargo.toml` (member `runner-core`).
  - Toolchain is pinned to 1.97.1 in `packages/paperclip-runner/rust-toolchain.toml`.
  - It builds `paperclip-runnerd` as part of `pnpm build`: `server/package.json:38` → `packages/paperclip-runner/package.json:63`.
  - Windows `.exe` staging is already handled in `packages/paperclip-runner/scripts/stage-runner-binary.mjs:10`.
- **What does not exist:**
  - No Tauri code anywhere (no `tauri.conf.json`, no `@tauri-apps/*`).
  - No desktop directory.
  - No Windows CI job in any workflow (a search for `windows-latest` finds nothing).
  - No updater keys.
- **Doc conflict:** the v3 plan §2.4 (`doc/plans/2026-09-24-crewspan-e2e-v3.md:186`) lists native desktop clients as a non-goal. ADR-0001 (accepted 2026-09-29, later) supersedes it. The owner should add a one-line note to v3.
- **UNKNOWN:** whether `paperclip-runnerd` compiles on windows-latest. The handoff says `pnpm build` works on the owner's Windows machine, but no CI has proven it.

### b. Embedded database
**Yes, it is production-grade embedded Postgres, not PGlite.** `AGENTS.md:48` says PGlite, but that is stale.

How it works:
- **Selection:** when `DATABASE_URL` is unset, the server starts `embedded-postgres@18.1.0-beta.16`, patched (`server/src/index.ts:433-639`, `doc/DATABASE.md:5-20`).
- **Supervision:** the server supervises it (`server/src/embedded-postgres-supervisor.ts`) and stops it last in an ordered teardown (`server/src/shutdown.ts:104-194`).
- **Reference instance:** the owner's Windows reference instance already runs this way — `Start-Default.ps1:28-29` clears `DATABASE_URL`.

Windows behaviour:

| Aspect | Behaviour (evidence) |
|---|---|
| Data dir | `<PAPERCLIP_HOME>/instances/<id>/db`. Home defaults to `%USERPROFILE%\.paperclip`, **the same as the owner's reference instance** (`packages/shared/src/home-paths.ts:16-20,55-60`). The desktop must override it. |
| Port | Default 54329, settable only in the config file (`server/src/config.ts:331`). If busy, the server silently takes the next free port, after checking that a reachable Postgres is not its own data dir (`index.ts:525-544`). Postgres gets no `listen_addresses` flag, so it uses the default `localhost` (the `embedded-postgres` `dist/index.js:174-180`). |
| First start | `initdb`, then all migrations applied automatically (`index.ts:557-631`). **Duration on Windows: UNKNOWN.** |
| Upgrade | Pending migrations apply automatically when stdin is not a terminal (`index.ts:243-246`), which is always true for a sidecar. There is no pre-migration backup and no rollback. Hourly backups with 7-day retention exist by default (`config.ts:255-275`). |
| Shutdown | **On Windows, `embedded-postgres` stops Postgres with `taskkill /f /t`** (`dist/index.js:216-223`), a hard kill on every quit. The data survives through crash recovery (fsync), but the stop is unclean. `pg_ctl` ships in the platform package (Linux package `dist/index.js:4`; the Windows package is presumed to match — **verify**). |
| Admin | `postgres.exe` is spawned directly (`dist/index.js:174`). Postgres refuses to run under an elevated admin token. That affects "Run as administrator", machines with UAC off, **GitHub Windows runners**, and likely Windows Sandbox (**UNKNOWN**). |
| Root on Linux | `embedded-postgres` refuses to run as root unless a `postgres` user exists (`dist/index.js:165-168`). Linux smoke tests must run as non-root. |

### c. Packaging the sidecar
- **Why it needs tsx today:** the workspace exports TypeScript source (`packages/db/package.json:15-18`, `"./*": "./src/*.ts"`). Published builds instead switch to `dist` through `publishConfig` (`:19-32`).
- **Reusable helpers already exist:**
  - `scripts/prepare-bundled-package.mjs:10` `materializePublishManifest()` applies `publishConfig`.
  - `scripts/prepare-bundled-package.mjs:190-212` handles the platform binaries.
- **Windows native binaries are pinned in `pnpm-lock.yaml`:** `@embedded-postgres/windows-x64` (:2026), `@heif2jpeg/...-win32-x64-msvc` (:2581), `@img/sharp-win32-x64` (:2739). `cpu-features` is optional.

| Option | Verdict |
|---|---|
| **A. `pnpm --filter @paperclipai/server deploy --prod` on windows-latest (hoisted, no links), then materialize `publishConfig` exports, add `ui-dist` and `skills`, and ship a pinned official `node.exe`. Run with plain `node server/dist/index.js` (no tsx).** | **Recommended.** Uses the lockfile-pinned versions and applies the pnpm patches (the `postgres@3.4.9` patch matters, see `doc/DATABASE.md:154-160`). Gets Windows binaries. |
| B. npm tarballs from the release tooling, then `npm install` | Rejected: unpinned third-party versions, and it loses the `postgres` patch. |
| C. Copy the whole built workspace, as in the Docker image | Rejected: pnpm junctions and symlinks cannot go through NSIS, and it ships dev dependencies. |
| D. Node SEA / single-file bundle | Rejected: ESM, native modules and dynamic imports rule it out. |
| E. Require the user to install Node | Rejected: violates "no dev toolchain". |

Pitfalls to guard against:
- The payload must contain **no junctions or symlinks**.
- **No `exports` entry may point at a `.ts` file.**
- **Build on Windows,** so pnpm picks the win32 optional dependencies. The runner vendor binary is also compiled on the host.
- **Check patch markers** (as the existing staging code does).
- **Path lengths** — risk of exceeding MAX_PATH.
- **File count** — slows NSIS and Defender scanning.
- **VC++ runtime for `postgres.exe` on a clean machine — UNKNOWN.**
- **pnpm 9.15.4 `deploy` behaviour (publishConfig, `node-linker=hoisted`, patches) — UNKNOWN.** T2 is a spike that proves it, with a documented fallback.

### d. Startup contract
- **The server silently changes its listen port if the requested one is busy** (`index.ts:681-685`). The shell must enforce the port itself.
- **Loopback is enforced for `local_trusted`** (`index.ts:656-665`), and loopback is the default: `HOST` is `127.0.0.1`, port 3100 (`config.ts:190,317`).
- **Readiness:** health reports `starting` until recovery finishes, then `ok` (`server/src/routes/health.ts:240-241`).
- **Controllable shutdown:** `startServer()` returns `listenPort` and `shutdown()` (`index.ts:2040-2046`) and does not auto-start when imported (`index.ts:2087`). A desktop-owned entry script can therefore control it.
- **Windows stop signal:** a GUI parent cannot send SIGTERM to a child on Windows, so stdin is the stop channel.

### e. UI
- **The SPA is served by the server** from `../ui-dist` or `../../ui/dist` (`server/src/app.ts:973-1027`). `SERVE_UI` is on by default (`config.ts:337-340`).
- **There is already a single API client:** `ui/src/api/client.ts:55` routes every call through `deploymentApiUrl()` (`ui/src/lib/deployment-base.ts:38-40`).
  - The base URL is Vite's build-time `BASE_URL`, relative and same-origin.
  - WebSockets use `buildSameOriginWebSocketUrl`.
- **Recommendation:** the webview loads `http://127.0.0.1:<port>/`. **No UI change is needed.** A runtime-configurable origin is not needed for P1.
- **Service worker:** the SPA ships one (`ui/src/main.tsx:36`), so the origin (port) must stay stable.

### f. Updater
- **Plugin:** Tauri 2 `tauri-plugin-updater` with `createUpdaterArtifacts: true`. NSIS `setup.exe` plus `.sig`, verified with Tauri's minisign-style key pair.
- **Keys:** the owner generates them locally with `cargo tauri signer generate -w <path outside repo>`, with a password.
  - The private key and its password go into GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, scoped to a protected environment.
  - The public key is committed in `tauri.conf.json`.
  - Losing the private key means installed apps can never update again. Escrow is an owner decision that overlaps B7.
- **Feed:** `latest.json` is served from a fixed rolling release, `desktop-beta`: `https://github.com/sico-vibes/crewspan/releases/download/desktop-beta/latest.json`. This avoids `/releases/latest` semantics, which exclude prereleases.
  - Versions are `0.1.N` (plain semver; NSIS only, no MSI/WiX).
  - Tags are `desktop-vX.Y.Z`, which avoids the npm lanes' `beta/v*` tags (`release.yml`).
- **Update flow:** download and verify, **stop the sidecar and database first** (files under the install directory are locked while running), then `install()` in passive mode, which exits the app and relaunches it. The new version applies migrations automatically.
- **The endpoint, public key and app identifier are baked in at the first release.** Mistakes can only be fixed by manual reinstall.
- **Blocker, UNKNOWN:** whether the repo is public. Release assets on a private repo cannot be downloaded without authentication.

### g. Release pipeline
- **Fork CI runs upstream's workflow:** PR CI calls upstream's reusable workflow (`.github/workflows/pr.yml:15` → `paperclipai/paperclip/...pr-trusted.yml@master`). Checks added to the fork's `pr-trusted.yml` would never run. **Desktop CI must live in its own workflow file.**
- **Policies:**
  - `pnpm-lock.yaml` changes are blocked (`pr-trusted.yml:268-279`), so add no npm dependencies. Use the Cargo-installed `tauri-cli` and the global `window.__TAURI__` object.
  - Migration numbers must be append-only (`:297-301`). This plan adds no migrations.
  - Node-version policy (`scripts/check-node-version-policy.mjs:25-46`): workflows must say `node-version: 24`, and any new `package.json` needs `engines.node ">=24.11.0"`. Avoid adding a `package.json` at all.
- **Upstream release lanes are fork-scoped:** they are skipped in the fork (`release.yml:91-96`).
- **Workspace boundary:** `pnpm-workspace.yaml` does not include `desktop/`, so the workspace checks are unaffected.
- **Tag-creation risk:** `release.yml` records that `GITHUB_TOKEN` tag creation can fail on commits that touch workflow files.

### h. What can be tested where
- **Linux (Codex, CI):**
  - Entry-script unit tests.
  - Staging-script tests.
  - A staged Linux boot smoke (non-root).
  - `cargo test` of a Tauri-free lifecycle crate.
  - `latest.json` generator and workflow-policy tests.
- **Windows CI (windows-latest):**
  - `pnpm build`, Windows staging, and a payload smoke against the runner's preinstalled PostgreSQL service. Embedded Postgres cannot run there because the runner is elevated.
  - `cargo tauri build`.
- **Owner's real machine only:** embedded Postgres on Windows, SmartScreen, the GUI, quit and crash cleanup, and auto-update. Section 6 is the test script.

### i. Risks
Ranked in section 7.

## 2. Recommended architecture

| Decision | Recommendation | Rejected alternatives |
|---|---|---|
| Location | Top-level `desktop/` Cargo workspace:<br>• `sidecar-core` — pure Rust lifecycle library, testable on Linux<br>• `src-tauri` — thin glue<br>• `sidecar/entry.mjs`<br>• `splash/` | Inside the runner workspace: couples to runner checks and Docker cache. As a pnpm package: churns the lockfile. |
| Payload | Option A (`pnpm deploy`) staged into `desktop/stage/{runtime/node.exe, app/}` and shipped as Tauri `bundle.resources` | Archive extracted on first run: fallback only if T2 measures more than ~40k files or NSIS fails. |
| Node | Official `node-v24.x-win-x64.zip`, pinned version and SHA-256 in `scripts/desktop/node-runtime.json` | System Node: not allowed. |
| Launch | `std::process::Command` from Rust, `CREATE_NO_WINDOW`, piped stdio drained by threads into rotating logs, child in a Job Object (no kill-on-close) | tauri-plugin-shell sidecar: its kill is a hard `TerminateProcess` and leaves Postgres orphaned. |
| Stop | stdin `shutdown` line or EOF triggers `started.shutdown()` (T3 makes the Postgres stop clean). After 60 s: `pg_ctl stop -m fast` on the data dir, then `TerminateJobObject`. | SIGTERM: does not exist on Windows. |
| Port | 3100, strict. Shell pre-binds 127.0.0.1:3100, then the entry script verifies `listenPort === PORT` (else exit 64). Conflict shows a clear error. | Auto-picking a port: changes the origin and service-worker scope, and could load a different server. |
| Readiness | Nonce handshake line `CREWSPAN_SIDECAR_READY {json}` plus polling health until `status=="ok"`. Timeout 300 s on first run, 120 s after. | Health polling alone: cannot tell our server from another one on the port. |
| Data | `PAPERCLIP_HOME=%LOCALAPPDATA%\<identifier>\paperclip`, `PAPERCLIP_INSTANCE_ID=desktop`, explicit `PAPERCLIP_CONFIG`, a fresh instance | `%USERPROFILE%\.paperclip`: would collide with the reference instance. Importing it is B8. |
| UI | Server-served SPA in the main window. Local splash page for starting and errors. Only the splash origin gets IPC; the remote origin gets none. External links open in the system browser. | Bundling the SPA at the `tauri://` origin: CORS, cookies, service worker, refactor. |
| Install | NSIS, `installMode: currentUser` (no UAC, updater-friendly), `webviewInstallMode: embedBootstrapper` | MSI: per-machine install and no prerelease versions. |
| Updates | Check on launch and every 6 h, prompt the user, download, stop the sidecar, install passive | Silent forced restart: could interrupt work. |
| CI | `.github/workflows/desktop.yml` (PR and push, no secrets) and `desktop-release.yml` (`workflow_dispatch`, `desktop-release` environment with the owner as required reviewer) | Adding to `pr-trusted.yml`: never runs in the fork. `tauri-action`: less control over the rolling `latest.json`. |

**Sidecar environment.**
- **Set:**
  - `NODE_ENV=production`, `PAPERCLIP_HOME`, `PAPERCLIP_INSTANCE_ID=desktop`, `PAPERCLIP_CONFIG`
  - `PAPERCLIP_DEPLOYMENT_MODE=local_trusted`, `PAPERCLIP_BIND=loopback`, `HOST=127.0.0.1`, `PORT=3100`
  - `SERVE_UI=true`, `PAPERCLIP_UI_DEV_MIDDLEWARE=false`, `PAPERCLIP_MIGRATION_AUTO_APPLY=true`
  - `PAPERCLIP_DISABLE_CWD_ENV_FILE=true` (`server/src/env-file-policy.ts:7`), `PAPERCLIP_OPEN_ON_LISTEN=false` (`index.ts:1883`)
  - `CREWSPAN_SIDECAR_NONCE`
- **Strip if inherited:** `PAPERCLIP_*`, `DATABASE_*`, `BETTER_AUTH_*`, `HOST`, `PORT`, `SERVE_UI`.
- **Preserve:** `PAPERCLIP_TELEMETRY_DISABLED` and `DO_NOT_TRACK` (the user's own opt-out).
- **Agent JWT secret:** without one, agent JWTs are disabled (`server/src/agent-auth-jwt.ts:40-41`). Before importing the server, the entry script creates `PAPERCLIP_AGENT_JWT_SECRET` in `<instance>/.env` if it is absent, the same place onboard writes it (`cli/src/commands/onboard.ts:450`). It uses an atomic write like `server/src/services/decision-signing.ts:95-113` and **never logs it**.

## 3. Phased plan

| Phase | Goal | Files | Acceptance | Gate commands | Verify on |
|---|---|---|---|---|---|
| **0 Prereqs (owner, lead)** | Unblock the updater | GitHub settings, secrets, environment | Repo public (or feed host decided). Secrets and the `desktop-release` environment exist. Public key handed to the lead. Identifier frozen. | none | Owner |
| **1 Sidecar payload** | A staged server that runs with plain node | `desktop/sidecar/entry.mjs` (+ `.test.mjs`), `scripts/desktop/stage-server.mjs` (+ test), `scripts/desktop/node-runtime.json`, `.gitignore` | Linux: stage, boot through the entry script in a temp home, health `ok`, stdin `shutdown`, exit 0, `postmaster.pid` gone. Verifier: 0 links, 0 `.ts` exports, patch markers present, file count and max path length reported. | `node --test desktop/sidecar scripts/desktop`<br>`pnpm check:node-version`<br>`node scripts/desktop/stage-server.mjs --platform linux-x64 --smoke` | Linux |
| **2 Clean Postgres stop on Windows** | No hard kill of Postgres | `server/src/embedded-postgres-windows-stop.ts` (+ `server/src/__tests__/…test.ts`), about 5 lines in `server/src/index.ts` (`createEmbeddedPostgres`) | On win32, `stop()` runs `pg_ctl stop -D <dir> -m fast -w -t 30` and falls back to the original. Unit tests with injected platform and exec. Other platforms unchanged. | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/embedded-postgres-windows-stop.test.ts src/__tests__/embedded-postgres-supervisor.test.ts`<br>`pnpm --filter @paperclipai/server typecheck` | Linux (logic); real run on Windows |
| **3 Lifecycle core** | Testable start, ready, stop and error handling | `desktop/Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` (1.97.1), `desktop/sidecar-core/**` | `cargo test` passes against a fake child covering: ready, timeout, early exit, port busy, graceful stop, forced-stop fallback, env sanitising, log rotation, stale `sidecar.pid`. Windows code behind `cfg(windows)`. | `cargo test --manifest-path desktop/Cargo.toml -p crewspan-sidecar-core --locked`<br>optional: `cargo check --target x86_64-pc-windows-msvc -p crewspan-sidecar-core` | Linux; Windows in CI |
| **4 Tauri shell** | The app | `desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/*.json,src/main.rs}`, `desktop/splash/{index.html,splash.js}` | Windows CI `cargo tauri build` produces `Crewspan_*_x64-setup.exe`. Config policy test: NSIS per-user, remote origin gets no IPC capability, updater endpoint and public-key placeholder present. | `node --test scripts/desktop/tauri-config.test.mjs`; the Windows job in phase 5 | Windows CI plus owner |
| **5 Desktop CI** | Build proof on every PR | `.github/workflows/desktop.yml` | Linux job green. Windows job: `pnpm build`, stage win32-x64, payload smoke against the runner's PG service with `DATABASE_URL`, `cargo tauri build` with updater artifacts off, installer uploaded as an artifact. | workflow run on the PR | GitHub |
| **6 Updater** | Auto-update | `desktop/src-tauri/src/updater.rs`, `main.rs` wiring | Prompt, download, stop sidecar, install. A failed download leaves the app running. | `cargo test -p crewspan-sidecar-core`; Windows build | Owner |
| **7 Release** | Publish to Releases | `.github/workflows/desktop-release.yml`, `scripts/desktop/write-latest-json.mjs` (+ test), `scripts/desktop/check-desktop-workflows.test.mjs` | Dispatch with version X: validates version > feed and tag unused, owner approves the environment, signed build, release `desktop-vX` (setup.exe, `.sig`, `SHA256SUMS`), then `latest.json` replaced on `desktop-beta`. | `node --test scripts/desktop`<br>`pnpm check:node-version` | GitHub plus owner |
| **8 Docs and beta** | Runbooks; releases 0.1.0 then 0.1.1 | `doc/DESKTOP.md`, a line in `CLAUDE.md` §3 | Owner test script (section 6) passes, including the update from 0.1.0 to 0.1.1. | none | Owner |

## 4. Task breakdown for Codex (one bounded run each)

| Task | Depends on | Scope and acceptance |
|---|---|---|
| **T1** Sidecar entry script | none | `desktop/sidecar/entry.mjs`: validate env; create the JWT secret atomically (0600, never printed); `import(pathToFileURL(serverEntry))`; `startServer()`; enforce the strict port (exit 64); print the READY line with the nonce; stdin `shutdown` or EOF calls `shutdown()` once, with a 45 s internal deadline. `CREWSPAN_SIDECAR_SERVER_ENTRY` override for tests. `node --test` with a fake server module. |
| **T2** Staging script (spike) | T1 | `stage-server.mjs --platform <linux-x64\|win32-x64> [--smoke]`: `pnpm --filter @paperclipai/server deploy --prod` (hoisted; if that fails, dereference-copy); materialize `publishConfig` with the existing helper; copy `ui/dist` → `app/ui-dist` and `skills` → `app/skills` through `scripts/copy-build-assets.mjs`; fetch and SHA-verify node; verifier; `stage-manifest.json` (counts, sizes, max path). **Report which pnpm behaviour was observed.** |
| **T3** Clean Postgres stop on Windows | none | As in phase 2. No behaviour change off win32. |
| **T4** `sidecar-core` crate | T1 (protocol) | As in phase 3. Linux tests use a fake child script. Job Object, `CREATE_NO_WINDOW` and the elevation check are compile-only behind `cfg(windows)`. |
| **T5** Tauri app | T4 | As in phase 4. Includes single-instance, splash (Retry, Open logs, Quit), navigation guard, quit sequencing, and an error when elevated ("run without administrator rights"). Icons generated in CI with `cargo tauri icon ui/public/android-chrome-512x512.png` (nothing binary committed). No updater yet. |
| **T6** `desktop.yml` | T2, T5 | As in phase 5. `tauri-cli` via `cargo install --locked` with a pinned version and cache. `permissions: contents: read`. No secrets. |
| **T7** Updater | T5 | As in phase 6. Public-key placeholder `REPLACE_WITH_OWNER_PUBKEY`. The release workflow refuses to run while it is the placeholder. |
| **T8** Release workflow and `latest.json` | T6, T7 | As in phase 7. Signing secrets only in the bundle step. `contents: write` only in the publish job. Concurrency group `desktop-release`. |
| **T9** Docs | T8 | `doc/DESKTOP.md`: architecture, data and log paths, key-generation and escrow runbook, release runbook, owner test script. |

**Lead-only small fixes:**
- Insert the owner's public key.
- Generate or commit `desktop/Cargo.lock` if the Codex container has no network.

**Order:** T1 → T2 (T3 and T4 can run in parallel) → T5 → T6 → T7 → T8 → T9.

## 5. QA plan (OpenCode, per task)

- **All tasks:**
  - `git diff --stat` shows no changes to `pnpm-lock.yaml`, no migrations and no `package.json` edits.
  - `pnpm check:node-version` passes.
  - `grep -rE "TAURI_SIGNING|PRIVATE KEY|AGENT_JWT_SECRET=" desktop scripts/desktop .github` finds no literal values.
  - Report exact commands and their output.
- **T1:** run `node --test desktop/sidecar`. Run it again with a server double that picks port+1 and check for exit 64. Pipe `shutdown` and check `shutdown()` is called exactly once. Confirm the secret file mode and that the secret never appears in stdout or stderr.
- **T2:** run `stage-server.mjs --platform linux-x64 --smoke` as non-root. Report the manifest (files, MB, max path), the verifier result, the health JSON `status`, and that shutdown leaves no `postgres` process and no `postmaster.pid`. Also report which fallback, if any, pnpm deploy needed.
- **T3:** run the vitest files listed in phase 2 and the server typecheck. Confirm the non-win32 path is byte-identical in behaviour (test asserts).
- **T4:** run `cargo test -p crewspan-sidecar-core --locked` and report the test count. Try `cargo check --target x86_64-pc-windows-msvc` and report pass or "target unavailable".
- **T5–T8:** run the config and workflow policy tests with `node --test scripts/desktop`. Lint the YAML by parsing it. Confirm:
  - `pull_request` jobs have no `secrets.*`
  - `environment: desktop-release` is on the signing job
  - the remote origin has no capability
  - `installMode: currentUser`
  - the updater endpoint URL is exact
  - After CI runs, report the Windows job status and the artifact name and size.
- **T9:** check links and that the documented commands match the scripts.

## 6. Owner test script (Windows beta)

**Setup:**
- **Clean machine:** use a **new local *standard* (non-admin) Windows user**. That gives a clean profile with no admin rights. Windows Sandbox likely runs elevated, which makes Postgres refuse to start, so a failure there is expected and still worth reporting.
- **Port 3100:** stop the reference instance (`C:\Crewspan`) first, or expect the port-conflict test in step 7 to fire.
- **Data:** use **dummy data only**. The S3 containment gate is not met, so do not run agents on real data.

Record each step as pass or fail, with a screenshot of any dialog or error.

1. **Download** `Crewspan_0.1.0_x64-setup.exe` from Release `desktop-v0.1.0`. Note any browser warning ("not commonly downloaded") and what you clicked.
2. **Run the installer.** Record the SmartScreen text, whether "More info → Run anyway" was offered, and whether Smart App Control blocked it outright. There should be no UAC prompt. Record the install time.
3. **First launch.** The splash says "Starting…". Record the seconds until the board UI appears (first run includes database setup). Record the window title and version.
4. **Use it.** Create a company and one task, then close the window.
5. **Check cleanup.** Within 60 s, `Get-Process node,postgres -ErrorAction SilentlyContinue` returns nothing. Report the output.
6. **Relaunch.** The company and task are still there. Record the startup time.
7. **Port conflict.** In PowerShell run `$l=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,3100); $l.Start()`, then launch Crewspan. Expect a clear "port 3100 in use" message and Retry. Run `$l.Stop()`, click Retry, and the app should start.
8. **Crash.** End `Crewspan.exe` in Task Manager. Within 60 s, check no `node` or `postgres` processes remain. Relaunch and the data is intact.
9. **Loopback only.** `Get-NetTCPConnection -LocalPort 3100 -State Listen` shows only `127.0.0.1`. Also run it for the Postgres port shown in the logs.
10. **Auto-update.** Tell the lead to publish 0.1.1, which needs your approval on the environment. Relaunch 0.1.0. Accept the update prompt. The app should close, update with no UAC prompt, and reopen with the title showing 0.1.1. The data is intact and no old `node` or `postgres` processes linger.
11. **Uninstall** without ticking "delete app data" and confirm `%LOCALAPPDATA%\<identifier>` still exists. Optionally reinstall and check the data is back.

**Report back:**
- Windows edition and build (`winver`), and whether the user was standard or admin.
- Pass or fail per step, with timings for steps 3, 6 and 10.
- SmartScreen and Smart App Control behaviour.
- A zip of `%LOCALAPPDATA%\<identifier>\logs\`. **Do not send the instance `.env`** or anything under `secrets\`.

## 7. Risks, unknowns and owner decisions

### Risks, ranked
1. **Repo visibility (UNKNOWN, blocker).** If `sico-vibes/crewspan` is private, the updater cannot fetch `latest.json` or the installers.
2. **First release freezes the identifier, updater endpoint and public key.** An error can only be fixed by a manual reinstall. Losing the private key ends auto-update.
3. **Unsigned installer.** SmartScreen warns on download and first run. **Smart App Control on clean Windows 11 can block it with no bypass.** Updates downloaded by Tauri carry no Mark-of-the-Web, so they are usually not prompted.
4. **Elevated token (admin with UAC off, "Run as admin", Sandbox, CI).** Embedded Postgres refuses to start. For the beta: detect it and show an error. Later: a restricted-token launch.
5. **Windows Postgres stop is `taskkill /f`, and leftover processes lock files, which fails updates.** Mitigated by T3, the `pg_ctl` safety net, the Job Object and the stale-pid check.
6. **pnpm deploy behaviour (UNKNOWN).** Payload size, file count, MAX_PATH, NSIS build time and Defender scan time are all unmeasured until T2.
7. **VC++ runtime for `postgres.exe` on a clean PC (UNKNOWN).** CI runners have it installed. Only step 2–3 on a clean profile or machine proves it. If it fails, fix by shipping the DLLs next to the app ("app-local").
8. **`pnpm build` and `paperclip-runnerd` on windows-latest have never run in CI (UNKNOWN).**
9. **Migrations apply automatically on update,** with no pre-update backup and no rollback. A failed migration means the app will not start; only the hourly backup remains.
10. **Data-dir safety.** An env wiring bug could hit the reference instance; mitigated by the distinct home, the `desktop` instance ID, the explicit config and the sanitised env. The uninstaller's "delete app data" option deletes the database.
11. **Telemetry and announcements are on by default in server defaults** (`config.ts:362-364`). The desktop inherits this unchanged, which is B1/B2 territory.
12. **Fork CI.** The required `ci / verify` gate comes from upstream, and `desktop.yml` results may not be required by branch protection. The lead must check them before merging.
13. **`GITHUB_TOKEN` tag or release creation may be rejected** on commits that touch workflows. Recovery is a manual tag or an owner-approved token.
14. **Codex container limits.** No Windows, possibly no network for crates or rustup targets, possibly running as root. Windows-only code is proven only in CI and by the owner.
15. **Tauri version drift and WebView2 on old Windows 10.** Mitigated by pinning versions and embedding the WebView2 bootstrapper.
16. **Clean machines have no `git` or agent CLIs,** so agent features degrade. This is out of P1 scope.

### Owner decisions (none are made in code)
**Before the work starts:**
- **O1** Make the repo public, or pick another public host for release assets.
- **O2** Generate the updater key pair, set the secrets, and decide escrow for the private key (overlaps B7).
- **O3** Freeze the app identifier. Proposed: `io.github.sicovibes.crewspan`.

**Before the first publish:**
- **O4 (B1, B2)** Whether a beta may ship with the server's current telemetry and announcements defaults.
- **O5 (B4)** Installer and product name "Crewspan" and the icon. The existing Paperclip icon is a placeholder.
- **O6 (B3)** Confirm the desktop's GitHub-Releases feed (`desktop-beta`, `desktop-v*`) is separate from the npm channel.
- **O7** Approve every publish through the `desktop-release` environment. Publishing is outward-facing.

**During the work:**
- **O8 (B8)** The beta uses a fresh, isolated data dir. Importing the reference instance is out of scope.
- **O9 (B7)** Keep the inherited backup defaults (hourly, 7 days) in the desktop data dir, or add a pre-update backup.
- **O10** Port policy: strict 3100 with an error (recommended), or a persisted alternate port.
- **O11** Add a note to v3 plan §2.4 that ADR-0001 supersedes the "no native desktop" non-goal.
