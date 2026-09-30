# ADR-0001 — One server, two deliveries: hosted web and Windows desktop

- **Status:** accepted (Board, 2026-09-29)
- **Scope:** delivery architecture for Crewspan. Does not authorise implementation before the M0 go/no-go.

## Context

Crewspan must be usable both as a **hosted web app** and as a **Windows desktop app**, without refactoring the application codebase. The desktop build must be installable from this repository as a **beta release**, and must **auto-update from GitHub Releases** so development changes can be picked up without manual reinstalls. OS code signing is deliberately deferred.

Paperclip already ships the shape this needs:

- `SERVE_UI=true` — the server serves the built SPA, so the same UI runs hosted or local.
- `PAPERCLIP_DEPLOYMENT_MODE` (`local_trusted` / `authenticated`) and `PAPERCLIP_DEPLOYMENT_EXPOSURE` (`private` / `public`) — desktop vs hosted is configuration, not a code fork.
- `embedded-postgres` locally, external PostgreSQL via `DATABASE_URL`, with one migration set.
- A container image is already the canonical hosted build.

## Decision

1. **Keep the server + SPA monolith.** The UI stays a single Vite SPA build, delivery-agnostic. No SSR/framework migration.
2. **Desktop is a shell, not a fork.** A **Tauri** app launches the *built* server (`server/dist`) as a sidecar bound to loopback with `local_trusted` mode and an embedded database, waits for health, then loads the SPA; it stops the sidecar on quit. Tauri over Electron: the repo already contains Rust, and the resulting app is far smaller and faster.
3. **One API client, configurable base URL.** Every UI call goes through a single client whose base URL is configuration. Same-origin assumptions are treated as bugs.
4. **Distribution:** GitHub Releases. A workflow builds the Windows installer and publishes it under a `beta` tag; the desktop app self-updates from those releases.
5. **Auto-update without OS signing.** Tauri's updater verifies updates with its own generated key pair, not an Authenticode certificate — so beta auto-update works without a code-signing certificate. Authenticode signing remains a later, separate decision.
6. **Native pieces ship per platform.** The runner and OS sandboxing are native; desktop packaging must cross-build them per OS/arch. This is the long pole, not the application code.

## Consequences

- No large refactor: the work is a shell, a sidecar lifecycle, an API-base audit, per-OS native packaging, and a release/update pipeline.
- Hosted and desktop share one schema, one API and one UI, so a bug fixed once lands in both.
- A mobile client later becomes "another client of the same API", not a rewrite.
- Reading Multica's open-source desktop/daemon model for **patterns** is fine; **vendoring their code is not** — Apache-2.0 attribution plus their Part I conditions would travel with it, and it would not integrate with this TypeScript stack. Reimplement.
