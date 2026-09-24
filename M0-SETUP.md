# Crewspan M0 local setup

## Current state

- GitHub fork: `https://github.com/sico-vibes/crewspan`
- Branch: `m0/paperclip-v2026.916.1`
- Baseline: Paperclip tag `v2026.916.1`, commit `d554c4789ed3930f8a53ac9fdf6503b3187097da`
- `origin` points to the Crewspan fork; `upstream` points to `paperclipai/paperclip`.
- This is an installed, local Paperclip baseline for Crewspan development. Crewspan product changes and the full M0 audit/spikes have not been done yet.

## Start and stop

Open PowerShell in `C:\Crewspan` and run:

```powershell
.\Start-M0.ps1
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). The API health endpoint is [http://127.0.0.1:3100/api/health](http://127.0.0.1:3100/api/health). Press Ctrl+C in that PowerShell window to stop the server.

The start script pins pnpm 9.15.4 and sets the app home, instance ID, loopback bind, and port in the same process. Paperclip uses its embedded PostgreSQL database under `C:\Crewspan\.paperclip-home\instances\m0\db`; it does not connect to the separate PostgreSQL 17 service or the usual `%USERPROFILE%\.paperclip` location.

## Agent API credentials

Agent runs authenticate to the API with a short-lived JWT that Paperclip mints at
adapter spawn and injects as `PAPERCLIP_API_KEY`. The server can only mint that
token when `PAPERCLIP_AGENT_JWT_SECRET` (or `BETTER_AUTH_SECRET`) is set — see
`server/src/agent-auth-jwt.ts`. With neither set, `createLocalAgentJwt` returns
`null`, runs start without a usable key, and **every agent write fails with 401**.

`Start-M0.ps1` handles this automatically:

- On first run it generates 48 random bytes and stores them base64-encoded in
  `C:\Crewspan\.paperclip-home\agent-jwt-secret.txt`.
- Every later run reads that same file, so the secret is stable across restarts
  and previously issued run tokens keep validating.
- The value lives only in that file. It is not in the script and not in git:
  `.paperclip-home/` is ignored by both `.gitignore` and `.git/info/exclude`.

Operational notes:

- **The server must be restarted for a secret change to take effect.** The
  secret is read into the process environment at startup only.
- Do not delete `agent-jwt-secret.txt` while runs are in flight. A new secret
  invalidates outstanding run tokens, and those runs start failing with 401.
- Treat the file as a credential. Anyone who can read it can mint agent tokens
  for this instance. It is not encrypted at rest and relies on Windows file
  permissions.
- Tokens are scoped per instance and per company, and default to a 48h TTL
  (`PAPERCLIP_AGENT_JWT_TTL_SECONDS`). The `instance_id` claim is `m0` here, so
  a token minted by this instance will not authenticate against another one.

To confirm an agent run actually received working credentials, run this from
inside an agent session — it should return the agent record, not 401:

```sh
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "${PAPERCLIP_API_URL%/}/agents/me"
```

## Installed tools

- Node.js 25.8.0
- pnpm 9.15.4, invoked through `npm exec` because Corepack is not installed
- Workspace dependencies for all 36 packages
- Plugin SDK and UI build outputs

The frozen-lockfile dependency install downloaded all 1,292 packages and built the native dependencies. Its final root postinstall returned Windows `EPERM` while creating symbolic links for excluded development plugins. Eight local junctions were created under `node_modules` to let this checkout run without changing Paperclip source files. The current install is usable; a fresh Windows install may need Windows Developer Mode or an equivalent junction workaround.

## Development notes

- `Start-M0.ps1` runs the server directly with the built UI. Restart it after server code changes; rebuild the UI after UI changes with `npm exec --yes --package=pnpm@9.15.4 -- pnpm --filter @paperclipai/ui build`.
- The Codex model picker reads the installed Codex CLI model catalog and includes `gpt-6-luna`. All Crewspan agents use that model with high reasoning.
- OpenCode Go has its own AI connection and model catalog. The local Board has a personal OpenCode Go connection imported from the already configured OpenCode CLI account; no key is stored in this repository.
- The Onboarding project has `C:\Crewspan` as its primary local workspace for the M0 fork inventory. The agent reporting tree and current M0 scope are recorded in [the handoff](doc/plans/2026-09-24-crewspan-m0-handoff.md).
- Windows agent runs use Codex's explicit CLI engine where ACP fails. Managed Codex MCP configuration uses `http_headers`, and skill directories use Windows junctions. A live run confirmed that startup and skill injection work, but Codex's local `workspace-write` policy rejected PowerShell execution before repository reads. All agents are paused; do not treat the current Windows workstation run as a functioning confined agent workspace or bypass its sandbox to make it run. The v3 plan's containment proof is a separate M0 test on the reference VPS.
- The standard `pnpm dev` runner currently checks generated runner protocol files that are stale in the pinned baseline. `pnpm --filter @paperclipai/paperclip-runner generate:protocol-types` refreshes them before using that runner; review its generated-file changes before committing.
- The installed M0 here is a working local development environment, not a completed Crewspan implementation or the full V3 M0 audit.

## Setup incident

One launch during setup omitted the isolated environment variables and created `C:\Users\jbmst\.paperclip\instances\default\db`. The process is stopped and its embedded PostgreSQL PID is no longer running. The execution policy rejected the guarded cleanup, so that task-created directory remains untouched. The active Crewspan instance and its database are under `C:\Crewspan\.paperclip-home`.
