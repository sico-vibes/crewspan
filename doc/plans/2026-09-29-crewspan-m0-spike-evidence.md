# Crewspan M0 spike evidence (S1–S8)

**Snapshot:** Crewspan M0 reference `49cac8af8162e362b6fd0f7b91a0ea2af43b0dd1`; upstream provenance pin `v2026.916.1` / `d554c4789ed3930f8a53ac9fdf6503b3187097da`.

**Scope:** Read-only source and repository evidence for the v3 plan's §3.3 spikes. No service was started or changed, no deployment or restore was performed, and no M1–M7 implementation was added. The current Board direction makes `C:\Crewspan` the local M0 reference and puts the VPS out of scope. The v3 S3 wording still says “reference VPS”; this report treats host-dependent results as unproven until the local reference can be exercised under an approved setup.

## Results

| Spike | Question and method | Result and evidence | Unresolved risk | M0 implication |
| --- | --- | --- | --- | --- |
| **S1 — Authorisation retrofit sizing** | Read the M0 system inventory and its reproducible route census. | **Blocked; initial inventory only.** The inventory reports 864 Express route declaration sites and identifies actor/company helpers (`server/src/routes/authz.ts`) but no normalized route-policy manifest. It also says existing company scoping does not provide resource-level filtering and that a universal scoped-query layer is absent. No scoped route guard/query helper prototype or three-domain leak tests are recorded. Evidence: `doc/plans/2026-09-29-crewspan-m0-system-inventories.md` §§1–2, Cross-inventory findings, and Evidence commands. | The 864-site count is not an effort estimate; background jobs, sockets and other non-route access paths also need inventory. | Do not claim S1 pass or set an M2 estimate from the route count. Complete the bounded projects/tasks/attachments prototype and leak tests before sizing. |
| **S2 — Upstream sync rehearsal** | Read the upstream merge discipline and pinned provenance record. | **Blocked; rehearsal not started.** `UPSTREAM.md` §8 says to record each update when rehearsal begins and to rehearse on an isolated branch; it contains no measured conflict-file or elapsed-hours result. The v3 pass condition also requires the S1 skeleton, which is not present in this evidence set. | Sync cost remains unknown. A clean ancestry or diff count would not measure conflict resolution and test time. | Do not claim the under-two-engineer-day condition. Run the isolated rehearsal against the selected upstream release after the S1 skeleton exists. |
| **S3 — Contained adapter and probe suite** | Checked the local reference health endpoint with a read-only GET and reviewed the M0 host scope. | **Blocked; not exercised.** `curl.exe -sS -o NUL -w "%{http_code}" http://127.0.0.1:3100/api/health` returned connection failure (`000`), so no local instance was available for a contained adapter run or probe suite. No VPS probe was attempted because the Board placed the VPS out of M0 scope. | No API-key-capable adapter is proven inside a rootless sandbox; Bubblewrap, rootless Podman and gVisor remain unevaluated for this reference. | S3 remains open. The plan's VPS wording needs to be reconciled with the Board's local-reference decision before recording a pass. |
| **S4 — Git isolation** | Read the M0 system inventory and v3 per-run clone/bundle requirements. | **Blocked; design requirement only.** The v3 plan §9.7 specifies per-run isolation, bundle validation, injection probes and a warm 1 GB provisioning threshold. The M0 inventory's cross-inventory finding says the mandatory sandbox supervisor and other Crewspan M3 execution components are not implemented at the pinned snapshot. No per-run clone, bundle validation, injection probe or provisioning measurement is recorded. | Shared git object/config/ref state or hook/config injection has not been tested against the chosen design. | No S4 pass claim. Keep the per-run repository design undecided until a local reproducible prototype passes each probe and timing gate. |
| **S5 — Model gateway** | Reviewed the M0 adapter/runtime inventory and adapter model configuration references. | **Blocked; adapter controls are not gateway proof.** The inventory points to ACPX model/effort propagation in `packages/adapter-utils/src/acpx-engine/execute.ts`; the v3 plan §10.3 treats gateway enforcement, token/spend limits, metering and keeping the real key outside the sandbox as new work. There is no recorded end-to-end run through a Crewspan gateway. | Base-URL/configuration support does not prove model allowlisting, cap enforcement, usage metering or credential exclusion. | No gateway-enforced adapter class is proven. Do not describe model controls as enforced or metered from adapter flags alone. |
| **S6 — Session scope** | Reviewed the adapter/session inventory and the v3 `(agent, project)` prototype requirement. | **Blocked; persistence is known, isolation is not.** The inventory records provider/session state in `agent_task_sessions` and run records. No prototype keyed by `(agent, project)` or cross-scope recall probe is documented. | Context can persist across task/project boundaries; cross-scope recall behavior remains unmeasured. | Do not claim the proposed session partition or a passing recall probe. Preserve this as an M0 risk for the gate. |
| **S7 — Assignment semantics** | Traced `server/src/services/issue-assignment-wakeup.ts` and checked the inventory for a company-level opt-out. | **Partial result; pass condition blocked.** The helper returns for an unassigned or backlog issue; otherwise it queues `heartbeat.wakeup` with `source: "assignment"`. The inventory says a per-company “Assign does not start” setting is a planned Crewspan change, not a current universal setting. No setting prototype or inherited-client compatibility test is recorded. | Assignment mutations can enqueue an agent wake; a setting that separates assignment from start is not proven. | The underlying behavior question is answered “yes, assignment can wake.” S7 still does not pass until the setting prototype and compatibility test are complete. |
| **S8 — Board MFA support** | Checked the pinned dependency/configuration and the Better Auth plugin documentation. | **Result: TOTP is supported by the auth framework, but not enabled in this application.** The pinned server dependency is `better-auth` 1.7.2 (`server/package.json`). The M0 auth factory calls `betterAuth(authConfig)` without a 2FA plugin, and no MFA schema/configuration is present in that path. Better Auth documents a TOTP-capable two-factor plugin ([official 2FA docs](https://better-auth.com/docs/plugins/2fa)); its 1.7 release notes include the two-factor API. No passkey claim is needed to answer the plan's “TOTP or passkeys” question. | Framework capability does not make Board MFA mandatory or available in the running app. Enrollment, schema, sign-in challenge and Board enforcement remain unimplemented. | The feasibility question passes at framework level. Record that implementation is still required before any preview gate that mandates Board MFA. |

## Recommendation

This evidence does **not** support recording a §3.5 Go: S1–S7 do not meet their stated pass conditions, and the M2 estimate and sync duration are unknown. This is a recommendation to hold the M0 gate open, not a Board decision. Do not begin M1–M7 implementation until the Board records the go/no-go and the blocked spikes are either completed or explicitly dispositioned.

## Reproduction notes

- Baseline identity: `git rev-parse 49cac8af8` → `49cac8af8162e362b6fd0f7b91a0ea2af43b0dd1`.
- Route census recorded by the inventory: `git grep -n -E 'router\.(get|post|put|patch|delete)\(' -- server/src/routes ':!server/src/routes/*.test.ts'`.
- Assignment wake path: `server/src/services/issue-assignment-wakeup.ts`.
- Auth pin and initialization: `server/package.json`; `server/src/auth/better-auth.ts`.
- Local reference availability check: read-only HTTP GET to `http://127.0.0.1:3100/api/health`; connection failed during this review.
- No test suite was run because this report contains no code change and the missing spike infrastructure prevents the specified integration probes.

## 2026-09-30 live-instance re-run

This addendum supersedes the S3 availability observation above. It keeps the
original pinned-source snapshot and upstream provenance separate from the
currently running local reference, which is newer than that snapshot.

**Method and live identity:** Read-only HTTP GETs to
`http://127.0.0.1:3100/api/health`, `/api/companies`, and the Crewspan company
agent/task-session endpoints. No startup was needed because the health endpoint
was already responding; no restart, migration, restore, configuration change,
agent wake, or test execution was performed. Health reported `ok`,
`authReady: true`, `deploymentMode: local_trusted`, branch `main`, commit
`6334712b7d78e8662eac79d713cc9ba9a392ede9`, and no local changes. It also
reported the latest database backup as 47.5 hours old against a 26-hour limit.
The live reference was therefore available, but is not the pinned
`49cac8af8` source snapshot.

| Spike | Re-run result | What the live read proves and what remains open |
| --- | --- | --- |
| **S1 — Authorisation retrofit sizing** | **Still blocked.** | A healthy live API does not provide the required scoped route/query prototype or projects/tasks/attachments leak tests. This re-run made no cross-company or cross-resource probes. |
| **S2 — Upstream sync rehearsal** | **Still blocked.** | No sync was attempted: the required S1 skeleton and measured isolated merge/reverse-merge rehearsal are still absent. |
| **S3 — Contained adapter and probe suite** | **Live service confirmed; spike still blocked.** | The health GET succeeded. The read-only Crewspan agents GET listed 13 agents, all `codex_local`. No API-key-capable adapter run inside Bubblewrap/rootless Podman/gVisor and no §9.14 fail-closed probe suite was run. Starting an agent or running probes would execute work and mutate instance state, outside this read-only re-run. The stale-backup warning is operational evidence, not a sandbox result. |
| **S4 — Git isolation** | **Still blocked; no live-instance proof.** | Read-only API access cannot validate per-run clone separation, bundle validation, hook/config injection resistance, or warm 1 GB provisioning time. No repository was cloned or modified and no bundle was produced. |
| **S5 — Model gateway** | **Still blocked; no end-to-end proof.** | The live agent list showed only `codex_local`; it did not establish a gateway-backed adapter or prove model allowlisting, caps, metering, or key exclusion. No model request was sent. |
| **S6 — Session scope** | **Persistence observed; scope prototype/probe still blocked.** | Read-only task-session GETs returned 11 sessions across six agents. A returned session record has `agentId` and `taskKey`, but no `projectId` field. That is not evidence of cross-project leakage or isolation: no `(agent, project)` key prototype or cross-scope recall probe was performed. |
| **S7 — Assignment semantics** | **Still blocked.** | The prior source trace remains the available evidence that assignment can enqueue a wake. The per-company “assign does not start” prototype and inherited-client compatibility test were not part of this read-only live-instance pass. |
| **S8 — Board MFA support** | **Unchanged from the source-level result above.** | The TOTP framework feasibility result remains separate from whether MFA is enabled or required in the running local instance. |

### Re-run recommendation

The evidence still does **not** support a §3.5 Go. S1, S2, S3, S4, S5, S6,
and S7 remain short of their stated pass conditions; S3's former “no listener”
blocker is removed, but its sandbox and probe requirements remain untested.
The M2 estimate and sync duration are still unknown. This report recommends
holding the gate open; only the Board records the go/no-go.

### Re-run reproduction

- `GET http://127.0.0.1:3100/api/health` — `ok`; live commit and backup warning recorded above.
- `GET http://127.0.0.1:3100/api/companies` — read-only company listing.
- `GET /api/companies/a0a9196c-9b96-4610-8f31-5d6495b791d5/agents` — 13 Crewspan agents; adapter type summary only.
- `GET /api/agents/{id}/task-sessions` for the listed Crewspan agents — 11 sessions across six agents; response contents were summarized without exposing session identifiers or payloads.
- No tests or state-changing probes were run because this re-run was explicitly read-only against the live instance.

## 2026-09-30 throwaway prototype probes

The assigned follow-up adds isolated feasibility experiments in
`spikes/m0/prototypes.test.mjs`. They run on synthetic fixtures or temporary
repositories only; they do not modify Paperclip routes, adapters, settings,
the live reference, or the VPS. The command was
`node --test spikes/m0/prototypes.test.mjs` (6 passed, 0 failed; 7.3 s total).
The initial run was blocked by Windows `spawn EPERM`; the successful run used
the approved elevated local command. Results below distinguish those narrow
prototype checks from each plan-level pass condition.

| Spike | Question and method | Result | §3.3 outcome |
| --- | --- | --- | --- |
| **S1 — Authorisation retrofit sizing** | In-memory route/query-policy shape over three fixture domains (projects, tasks, attachments), each containing same-company in-scope, same-company out-of-scope, and cross-company rows; also omitted the scope input. | Only the same-company in-scope row was returned in all three fixtures; missing scope threw. This demonstrates a small fail-closed filter shape. It is **not applied to production route handlers or database queries**, and it is not the plan's leak suite. | **Fail.** Route guard/query helper application and leak tests against actual endpoints remain absent; no M2 estimate can be recalculated from this fixture. |
| **S2 — Upstream sync rehearsal** | Checked the S1 artifact produced here against the plan's requirement that the rehearsal branch carry the S1 skeleton. | No merge was attempted. The S1 result above is an in-memory feasibility function, not a route/query skeleton; treating it as the required skeleton would overstate the rehearsal. Thus conflict resolution and suite duration remain unmeasured. The previously reported Board measurements (64 behind / 23 ahead and two generated metadata conflicts) are not a merge rehearsal. | **Fail / blocked.** Run an isolated merge only after an actual S1 skeleton exists; do not infer engineer-days from ancestry or the Board's diff count. |
| **S3 — Contained adapter and probe suite** | Checked for `bwrap`, `podman`, and `runsc`; tested the fail-closed launch decision when none exists. | No supported sandbox executable was found. The prototype rejected launch with “contained execution unavailable; refusing fallback.” No adapter was started and no §9.14 probes were run. | **Fail.** The failure path is demonstrated, but no rootless sandbox, supervisor, API-key-capable CLI adapter, or full probe suite is available on this host. VPS execution remains out of scope. |
| **S4 — Git isolation** | Built a temporary bare mirror and one-branch repository, cloned one permitted ref with `--no-local`, configured a hook path on the mirror, checked clone metadata isolation, created a result bundle, and ran `git bundle verify`. | All checks passed. The clone took **759 ms** for the tiny one-ref fixture on this run. The clone had a distinct git directory, only `main`, no inherited `core.hooksPath`; the bundle verified and the mirror did not receive the run result. | **Partial; overall fail.** This proves basic local clone/bundle mechanics and one config-injection boundary. It does not test the production broker, malicious bundle validation, all hook/config injection paths, protected-ref enforcement, or the 1 GB under-30-second gate. |
| **S5 — Model gateway** | In-memory gateway policy prototype checked an allowlisted model, token maximum, usage count, and that the sandbox-facing request does not serialize the configured provider key. Negative probes used a disallowed model and an over-cap request. | Accepted request metered 32 requested tokens; both negative requests were rejected; the sandbox-facing object contained no provider key. | **Fail.** This is a mock policy function, not a real adapter routed through a Crewspan gateway. Real usage reconciliation and credential isolation in a sandbox remain unproven. |
| **S6 — Session scope** | Prototype generated a required `(agent, project)` key and stored a canary under one in-memory key; queried the same agent under another project and omitted project scope. | Project A and B keys differed; project B could not recall A's canary; missing project scope threw. | **Partial; overall fail.** The partition key is feasible, but provider session persistence, existing task-session integration, and a real cross-scope recall probe are not implemented. |
| **S7 — Assign semantics** | Tested a per-company setting shape against disabled, enabled, and absent values. | `disabled` prevented wake; `enabled` and absent values preserved wake behavior for compatibility. | **Partial; overall fail.** The default compatibility rule is feasible, but no company setting storage/read path is wired and no inherited API client integration test was run. |

### Updated gate assessment

The throwaway probes close several feasibility questions but **do not complete
the §3.3 pass conditions**. S1, S2, S3, S4, S5, S6, and S7 all remain fails or
partials as detailed above. Keep the M0 decision open; this report does not
record a Board go/no-go and does not authorize M1–M7 implementation.
