# M0 explicit unknowns — resolution record

Status: M0 evidence artifact (`CREW-10`, deliverable 4). Scope authority:
[`doc/plans/2026-09-24-crewspan-e2e-v3.md`](plans/2026-09-24-crewspan-e2e-v3.md)
§3.4 ("Explicit unknowns before M0"), with the §3.1 `[M0]` markers this task
touches.

Baseline: fork `main` at `49cac8af8` (Board reference instance, 2026-09-29).
"Resolved" means a repository path or verified reference-instance evidence
answers the question; "carried forward" means it needs a later spike, an
external party, or a Board decision, and names the owner and reason.

## 1. Resolved at M0

| Unknown (§3.4) | Resolution | Evidence |
|---|---|---|
| How sessions and memory persist | Provider sessions persist in the `agent_task_sessions` table (not in a separate chat store). Agent chat is issue-backed: migration `0274_agent_chat.sql` adds conversation identity/state and session generation/boundary columns to `issues` and processed session-boundary generations to `issue_comments`; `/new` removes only the matching conversation session. Durable agent session goals are an additive projection on `agent_task_sessions` with a control outbox. A separate memory-service surface is already designed. | `doc/DATABASE.md:421-423`; `doc/DATABASE.md:272-279`; `doc/plans/2026-03-17-memory-service-surface-api.md` |
| Assign-wake behaviour | Assigning an agent-owned issue **queues a wake-up** (`source: "assignment"`), i.e. assignment implies a start for any status other than `backlog`. This is the inherited behaviour the S7 spike would change. | `server/src/services/issue-assignment-wakeup.ts:25-46` (skip only when `!assigneeAgentId || status === "backlog"`, line 43) |
| Drizzle's multi-stream support | The core schema uses **one** migration stream: `out: "./src/migrations"`, 284 timestamped migrations, journal version 7. Multiple snapshots are pruned to the newest 5. The supported multi-namespace mechanism is **plugin database namespaces** (`plugin_database_namespaces`, `plugin_migrations`), with separate migration directories only under `packages/plugins/*`. There is no second stream for the core app schema. | `packages/db/drizzle.config.ts:5`; `packages/db/src/migrations/meta/_journal.json`; `doc/DATABASE.md:193-200`; `doc/DATABASE.md:344-346` |
| MFA support | **Not supported by the pinned build as configured.** The Better Auth instance enables email/password (with rate limiting) and no second-factor plugin; there is no TOTP/passkey/twoFactor wiring anywhere in `server/src`. Better Auth upstream is plugin-capable, but the fork does not wire it. S8 therefore starts from "absent", not "confirm". | `server/src/auth/better-auth.ts:260-306`; grep for `twoFactor|passkey|TOTP|totp|MFA` under `server/src` returns no matches |
| "Crewspan" trademark screen | Screened and recorded. No exact web match found; closest neighbour is the registered "CrewSnap" mark in an adjacent workforce-software space. Board escalation, not a legal conclusion. | [`doc/M0-TRADEMARK-SCREEN.md`](M0-TRADEMARK-SCREEN.md) |
| CLI adapters and base-URL override (the override half) | Base-URL override exists for the CLI adapters checked: Claude Local resolves `ANTHROPIC_BASE_URL`; Codex Local writes `base_url` provider config; OpenCode Local accepts a custom `baseURL`. | `packages/adapters/claude-local/src/server/models.ts:67-68`; `packages/adapters/codex-local/src/server/runtime-config.test.ts:72`; `packages/adapters/opencode-local/src/server/runtime-config.test.ts:74` |
| Subscription-login CLIs without the host home directory (the credential half) | Codex acquires credentials in a managed home without the host home being the run cwd: the host `~/.codex/auth.json` is symlinked into the managed `CODEX_HOME` and uploaded to the sandbox; an unseeded managed home fails fast rather than running unauthenticated. Claude Local uses the sandbox image's own login when no configured credential is present. So the credential path does not require the host home directory to be exposed to the sandbox — but this is adapter-level evidence, not a containment proof. | `docs/adapters/codex-local.md:56-60`, `:74`; `docs/adapters/overview.md:42-54` |

## 2. Resolved [M0] markers in §3.1 that this task closes

| §3.1 marker | Resolution | Evidence |
|---|---|---|
| `[M0: mode name]` — authenticated mode name | `authenticated`, exposed as `authenticated + private` for a private deployment. Supersedes the `local_trusted` default (Board decision 2026-09-29). | `docs/deploy/deployment-modes.md:24-46`; [`UPSTREAM.md`](../UPSTREAM.md) §9.2 |
| Design tokens "expected in `ui/src/index.css`" | Confirmed present (the token layer is `ui/src/index.css`). | `ui/src/index.css` (145,460 bytes) |
| `DESIGN.md` principles `[M0]` | Present. | `DESIGN.md` |
| Storybook build `[M0]` | Storybook is configured; the baseline *capture* is CREW-8 work, not this task. | `doc/FORK-BOUNDARY.md` §1 (Storybook scripts in `ui/package.json`) |

Terminology (`§2.6`) is resolved by [`doc/M0-TERM-TABLE.md`](M0-TERM-TABLE.md).

## 3. Carried forward (with owner and reason)

| Unknown (§3.4) | Why it is not resolved at M0 | Owner | Gate / follow-up |
|---|---|---|---|
| Size of the authorisation retrofit | Needs the §3.2 route/query inventories and a prototype guard with leak tests. Neither exists yet (`CREW-24` req 8 unmet); M0 is an evidence gate, not an implementation milestone. | Crewspan Backend Engineer | S1 (`CREW-3`); feeds the §3.5 M2 estimate |
| Can CLI adapters run in a **sandbox** (containment half) | Bubblewrap filesystem/network scope is optional and off by default; the local Windows reference has no rootless container runtime. The VPS (read-only) has `bwrap` but no `podman`/`runsc`. A live containment + probe-suite run has not been done. | Crewspan Backend Engineer | S3/S5 (`CREW-3`); plan §9.12, §9.14 |
| Can subscription-login CLIs run **without the host home** inside a real sandbox (containment proof) | Adapter credential seeding is documented (see §1), but there is no in-sandbox execution proof yet; S3 owns that. | Crewspan Backend Engineer | S3 (`CREW-3`) |
| Whether the target host supports gVisor or nested virtualisation | External/host capability question. The local reference is out of scope for it and the VPS is out of M0 scope; the host runs no `runsc`/`podman`. Under the plan this drives the §3.5 "go with changes" branch (Contained-namespaces grade). | Board (provider/host decision) + Engineering for the probe | S3 (`CREW-3`); plan §3.4, §3.5, §9.12 |
| Upstream roadmap for human org nodes and permissions (#11353) | Needs an upstream response. No upstream issue/PR has been opened yet, so there is nothing to record. | Crewspan QA & Release (upstream engagement) | §3.6; record the response in `UPSTREAM.md` §7.5 |
| Terms of each provider for sharing subscriptions | External legal/contract matter. The adapter docs describe the shared-subscription credential mechanics and the API-key alternative, but the providers' terms are not reviewed here. | Board | External review; plan §3.4, §10.6 |
| Off-host backup and restore rehearsal (adjacent §3.1/§3.4 operational unknown; Alpha-1 gate) | Local hourly backups exist; no off-host encrypted copy and no completed restore rehearsal are evidenced. Requires a Board-owned destination, encryption and key custody. | Crewspan QA & Release | `CREW-9`; plan §13.9; Board decision D3 |
| "Crewspan" trademark clearance (beyond the light screen) | A proper clearance search and counsel opinion are outside agent scope; this task only screens and flags. | Board | [`doc/M0-TRADEMARK-SCREEN.md`](M0-TRADEMARK-SCREEN.md); Board decision D5 |

## 4. Residual risk

Every carried-forward item above is either an external decision (Board/legal),
a later spike (`CREW-3`), or an operational rehearsal (`CREW-9`). None is a
reason to start M1: the §3.5 go/no-go is not recorded, so the M0 gate stays
open ([`UPSTREAM.md`](../UPSTREAM.md) §9.5; `CREW-24`).
