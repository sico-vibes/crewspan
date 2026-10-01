# CLAUDE.md — Crewspan handoff checklist

This is the **Crewspan** fork of Paperclip (`github.com/paperclipai/paperclip`), repository `github.com/sico-vibes/crewspan`, branch `main`. Upstream is **MIT** — rebranding and unrestricted development are permitted.

**Start here:** `doc/plans/2026-09-30-m1-handoff.md`. It is the authoritative handoff. This file is the short checklist around it.

## 1. Confirm the decision before you build

- **M0 is closed with "Go with changes."** Not a clean Go, and the reasons are recorded, not hidden:
  - **S3 (containment) failed** for environmental reasons — no `bwrap` in the shipped image, no `podman`/`runsc` on the host, no provider key — so no adapter was proven contained and the §9.14 fail-closed suite never ran.
  - The remaining spikes (**S1, S2, S4–S7**) need production integration, which a feasibility gate cannot require, so they were re-scoped into M1 exit criteria.
  - The gate's two quantitative inputs (**M2 retrofit sizing**, **upstream sync cost**) are **unmeasured**.
- **Therefore: S3 is now an M1 gate** — containment must be proven, and the §9.14 probe suite must run, **before any agent runs against real data.**

Read, in this order: `AGENTS.md` → `doc/plans/2026-09-30-m1-handoff.md` → `doc/plans/2026-09-24-crewspan-e2e-v3.md` → `docs/CREWSPAN-PRODUCT-CONTRACT.md` → `doc/plans/2026-09-30-m0-go-no-go-recommendation.md`.

## 2. Get it running

1. Node **≥ 24.11**, pnpm **9.15.4** (`corepack enable`, or `npm exec --yes --package=pnpm@9.15.4 -- …`).
2. `pnpm install --frozen-lockfile`
3. `pnpm build` → produces `server/dist/index.js`
4. Start:
   - dev — `.\Start-Default.ps1` (Windows) / `pnpm dev:server`
   - production — `.\Start-Default.ps1 -Mode production`, which runs the container's own command:
     `node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js`
5. Verify: `GET http://127.0.0.1:3100/api/health` → 200, `status=ok`.

**Windows specifics already fixed — do not regress:** cross-platform asset copying in `packages/db` and `server`; `pathToFileURL()` before dynamic `import()` in the Storybook scripts; CRLF→LF normalisation in generated checks; workspace links as **junctions** (symlinks fail without Developer Mode).

## 3. M1 priority 1 — the desktop release

1. **Tauri shell**: launch the *built* server as a loopback sidecar with an embedded database, wait for health, load the SPA, stop the sidecar on quit. Tauri, not Electron — this repo already contains Rust.
2. **Publish a Windows beta installer as a GitHub Release** from this repository.
3. **Auto-update from GitHub Releases** (Tauri's own updater key pair; no OS code signing for now).
4. **Done =** a Windows user installs the beta from Releases with no dev toolchain and no external Postgres, and the next published release auto-updates it.

Then, in order: prove **S3** containment; measure **M2 retrofit sizing** and **upstream sync cost**; complete **S1/S2/S4–S7** as M1 exit criteria.

## 3b. Current status

See `doc/plans/2026-10-01-desktop-handoff-status.md` for how far the desktop beta got, open PR #13 and next steps.

## 4. Guardrails

- Keep the **server + SPA monolith** — desktop is a shell, not a fork. One API client with a configurable base URL.
- Port **3100 stays loopback-only**; never expose it.
- Never commit credentials or tokens; never print the instance env file or `PAPERCLIP_AGENT_JWT_SECRET`.
- **Do not decide B1–B9 in code** (telemetry, announcements, npm/update channel, brand depth, Paperclip Cloud, auth route/exposure, backup retention + DR set, migration vs fresh, baseline re-pin) — they are Board decisions, listed in `doc/plans/2026-09-30-m0-board-decision-packet.md`.
- **Do not vendor Multica code** — its licence conditions travel with it, and it would not integrate with this TypeScript stack. Reimplement patterns.
- Deploy, restart, migration, restore and any destructive action need explicit authorisation.
- Verify before claiming: run the command, cite the output.

## 5. AI orchestration (Claude Cloud sessions only)

When working as **Claude in Claude Cloud**, you are the **lead**: orchestrate, do not do the heavy lifting. Plan with **Claude Opus 5.5 (high, plan-only, no code)** → implement with **Codex `gpt-6-luna` (high)** → QA with **OpenCode Go `opencode-go/deepseek-v4.1-flash`** → you review the diff, then you land it. Delegates never commit, push or merge. You may only do small fixes yourself. Merge to `main` right away once CI is green on the exact head and you have reviewed the diff (merge commit, not squash). Full workflow, lane config (`.delegate/config.json`) and per-session setup: `doc/AI-ORCHESTRATION.md`. This does not apply outside Claude Cloud.
