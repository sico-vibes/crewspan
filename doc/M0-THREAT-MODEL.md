# M0 threat model v1 — private, authenticated single-instance deployment

Status: M0 evidence artifact (`CREW-10`, deliverable 2). Scope authority:
[`doc/plans/2026-09-24-crewspan-e2e-v3.md`](plans/2026-09-24-crewspan-e2e-v3.md)
§3.1, §3.4; risk register §15.

Target: the **local M0 reference instance** — one private, single-tenant
Crewspan build on one host, reached over loopback. Baseline: fork `main` at
`49cac8af8`; upstream provenance pin `v2026.916.1` (`d554c4789`).

This version records what is known at M0. It is not the Stable-1.0 security
model (§9.15); that document is later work. Every claim cites a repository path,
a plan section, or verified evidence from the local instance. Where a control is
only *planned*, it is marked as such — it is not counted as present.

## 1. Scope and assumptions

- In scope: the control-plane server, its embedded database, the browser client,
  the agent/runner path, and the operator's host environment.
- Out of scope for v1: the VPS (read-only evidence only per the 2026-09-29
  Board direction), multi-tenant or public exposure, personal/remote runners
  (§9.16, gated), and the later scoped-access model (§5).
- Assumed deployment: loopback listener `127.0.0.1:3100`, embedded PostgreSQL on
  loopback `:54329`, `authenticated` deployment mode (Board decision
  2026-09-29; [`UPSTREAM.md`](../UPSTREAM.md) §9.2).
- The reference instance observed by `CREW-24` was **stopped** at check time and
  was running under the `local_trusted` default, not `authenticated`. v1
  therefore treats "authenticated mode actually enforced" as an **open** control,
  not a satisfied one.

## 2. Assets

| Asset | Where it lives | Evidence |
|---|---|---|
| Company work objects (issues, comments, documents, attachments, runs) | instance database | `packages/db/src/schema/`; `doc/DATABASE.md` |
| Agent API keys (bearer, hashed at rest) | `agent_api_keys` | `AGENTS.md` §8 |
| Company/user secrets and their versions | `company_secrets`, `company_secret_versions`, bindings | `doc/DATABASE.md:361-379` |
| Secrets master key (decrypts secret material) | `.../instances/default/secrets/master.key` | `doc/DATABASE.md:381-391` |
| Provider credentials (API keys, subscription logins) | agent config / host home (`~/.codex/auth.json`) | `docs/adapters/codex-local.md:56-60` |
| Database and logical backups | instance `data/backups`, off-host copy planned (`CREW-9`) | `doc/DATABASE.md:348-358` |
| Non-database instance files (uploads, workspaces) | instance home | `doc/DATABASE.md:356-357` |
| Session cookies and agent run JWTs | browser; run-scoped tokens | `server/src/auth/better-auth.ts`; `docs/api/authentication.md` |
| Execution workspaces (checked-out repositories) | runner host | `packages/adapters/*`; `doc/spec/agent-runs.md` |
| Activity/audit log | `activity_log` | `AGENTS.md` §5.3, §8 |
| Outbound telemetry payloads | Paperclip ingest endpoint (on by default) | `doc/FORK-BOUNDARY.md:130` |

## 3. Actors

| Actor | Trust | Notes / evidence |
|---|---|---|
| Board user | Trusted operator, full control | `AGENTS.md` §8 ("board access is treated as full-control operator context"); UI label **Board** (`ui/src/components/ActivityRow.tsx:53`) |
| Human members (`owner/admin/operator/viewer`) | Semi-trusted, role-scoped | `doc/CREWSPAN-PRODUCT-CONTRACT.md` §6.4 |
| Agents | Untrusted-ish worker, holder of a bearer API key | `AGENTS.md` §8; `server/src/middleware/auth.ts` |
| Runner / CLI adapters | Executes with host privileges by default | `doc/spec/agent-runs.md:319` (Bubblewrap scope optional, off by default) |
| Model providers (external) | Third party receiving prompts/data | `docs/adapters/overview.md` |
| Upstream Paperclip services | Third party; telemetry on by default | `doc/FORK-BOUNDARY.md:128-134` |
| Prompt content (issue bodies, comments, attachments, repository files) | Untrusted input to agents | plan §11.9 |
| Host operator / other host tenants | Trusted OS-level | VPS kept separate from the unrelated Dashboard (`AGENTS.md` project context) |

## 4. Trust boundaries

1. **Browser ↔ control-plane server.** Loopback `127.0.0.1:3100`; Better Auth
   session cookies; private-host trust policy in `authenticated` + `private`
   (`docs/deploy/deployment-modes.md:28-46`; `server/src/auth/better-auth.ts`).
2. **Server ↔ database.** Embedded PostgreSQL on loopback; secrets encrypted at
   rest with a local master key (`doc/DATABASE.md:381-391`).
3. **Server ↔ agent.** Bearer API keys hashed at rest; run-scoped JWTs; keys
   must not cross companies (`AGENTS.md` §8).
4. **Runner ↔ model provider.** Outbound network; API keys or a shared
   subscription login (`docs/adapters/codex-local.md:56-99`). Egress is
   unrestricted unless the optional `networkScope` allowlist is enabled
   (`doc/spec/agent-runs.md:321`).
5. **Instance ↔ upstream Paperclip.** Telemetry, announcements feed, npm update
   channel, docs links, gated Cloud (`doc/FORK-BOUNDARY.md:128-134`).
6. **Host ↔ instance.** The instance home, the secrets master key file, and
   database backups all sit on the host filesystem (`doc/DATABASE.md:356-391`).
7. **Company ↔ company.** `company_id` is the hard boundary, enforced in routes
   and services (`AGENTS.md` §5.1; `doc/CREWSPAN-PRODUCT-CONTRACT.md` §6.1).

## 5. Top risks (v1)

Likelihood/impact are M0 judgements, not measurements.

| # | Risk | L | I | Evidence | Control / mitigation | Owner | State |
|---|---|---|---|---|---|---|---|
| R1 | Telemetry sends Crewspan usage to `telemetry.paperclip.ing` by default | High | Med | `doc/FORK-BOUNDARY.md:130` | Set `PAPERCLIP_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`; Board decision | Board | Open |
| R2 | Auth mode is `local_trusted` (no login) while §3.1 requires `authenticated`; any bind beyond loopback is then a full-control exposure | Med | High | `CREW-24` report §1 (inferred default); `docs/deploy/deployment-modes.md:8-22` | Set `PAPERCLIP_DEPLOYMENT_MODE=authenticated`; keep loopback bind; bootstrap/claim flow | Board (D4) / Engineering | Open |
| R3 | Agent containment unproven: adapters run as host processes; Bubblewrap filesystem scope is optional and off by default | Med | High | `doc/spec/agent-runs.md:319`; plan §9.12, S3 | Run S3 (§3.3); enable fail-closed `filesystemScope`/`networkScope` or rootless Podman; least privilege | Engineering (S3) | Open |
| R4 | Prompt injection through issue/comment/attachment/repo content steers an agent to exfiltrate or act destructively | Med | High | plan §11.9, §9.9; `AGENTS.md` §5.3 | Injection guards (§11.9), egress allowlist, approval gates for governed actions | Engineering | Open |
| R5 | Disaster recovery unproven: hourly local backups only; DB backups exclude non-DB files and the secrets master key | Med | High | `doc/DATABASE.md:348-358`; `CREW-24` §1 (44 local `.sql.gz`) | Off-host encrypted copy + restore rehearsal (`CREW-9`); restore DB **and** master key together | Board (D3) / Engineering | Open |
| R6 | Subscription-login credentials shared into managed homes, and provider terms for subscription sharing are unverified | Med | Med | `docs/adapters/codex-local.md:56-99`; plan §3.4 ("terms of each provider for sharing subscriptions") | Prefer per-agent API keys where required; complete provider ToS review | Engineering / Board | Open |
| R7 | Supply chain: CLI self-update resolves to the `paperclipai` npm package; the fork also inherits Paperclip branding and defaults | Low | High | `doc/FORK-BOUNDARY.md:133`, `:128-134` | Board decision on update channel + brand; pin and verify the build | Board | Open |
| R8 | Secrets master key sits beside the database it protects; loss or theft is total | Low | High | `doc/DATABASE.md:381-391` | Key-file permissions (0600 enforced best-effort), separate off-host key custody | Board (D3) | Open |
| R9 | Cross-company leakage if `company_id` filtering is bypassed by a route/query | Low | High | `AGENTS.md` §5.1; plan §5.7, §5.11; `CREW-2`/S1 not done | Scoped query layer and leak tests (§5.11, S1) | Engineering (S1) | Open |
| R10 | Unauthenticated bootstrap/claim window or leaked invite | Low | High | `docs/deploy/deployment-modes.md:62-74`; `CREW-7` §1 (`bootstrapStatus=ready`, invite inactive) | One-time claim URL; audit board claim; no public exposure | Engineering | Open |
| R11 | Paperclip announcements feed renders third-party content inside the Crewspan UI | Med | Low | `doc/FORK-BOUNDARY.md:131` | Point at own feed or disable via config | Board | Open |
| R12 | Audit completeness: a mutating action that skips the activity log weakens every other control | Low | Med | `AGENTS.md` §5.3, §8 | Enforce activity logging in routes/services; review in §3.2 auth inventory | Engineering | Open |

## 6. Controls already present (inherited)

- Company-scoped access enforced in routes/services (`AGENTS.md` §5.1).
- Agent bearer keys hashed at rest; agent keys cannot access other companies
  (`AGENTS.md` §8).
- Secrets referenced, never inlined; read-path redaction and
  `secret_access_events` (`doc/CREWSPAN-PRODUCT-CONTRACT.md` §6.2).
- Single-assignee tasks, atomic checkout, approval gates, budget hard-stop
  (`AGENTS.md` §5.3).
- Activity logging for mutating actions (`AGENTS.md` §5.3).
- Optional Bubblewrap filesystem scope and hostname-allowlist egress proxy exist
  (`doc/spec/agent-runs.md:319-321`) — present but off by default.

## 7. Out of scope / carried forward

- Multi-tenant and public exposure hardening (§13.7, §9.12).
- Personal and remote runners (§9.16).
- Per-project/per-issue ACLs and restricted conversations — later milestones
  (§5, §11.4).
- gVisor / nested-virtualisation availability on the target host (§3.4) — see
  [`doc/M0-EXPLICIT-UNKNOWNS.md`](M0-EXPLICIT-UNKNOWNS.md).
- The Stable-1.0 security model and the §9.14 probe suite.
