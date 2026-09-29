# Crewspan M0 system inventories

**Snapshot:** Crewspan `main` at `49cac8af8162e362b6fd0f7b91a0ea2af43b0dd1` (M0 reference selected by the Board), upstream provenance pin `v2026.916.1` / `d554c4789ed3930f8a53ac9fdf6503b3187097da`. At task start, `git diff --stat 49cac8af8..HEAD` reported only `UPSTREAM.md`; this inventory is the new M0 audit deliverable.

**Purpose:** repository-grounded M0 census for the twelve surfaces listed in [the v3 plan](2026-09-24-crewspan-e2e-v3.md), Â§3.2. This describes code present at the snapshot; the product contract and future plan are not treated as proof of implementation. The report does not add `cs_*` tables or implement a later milestone.

## Reading the classifications

- **Inherited/current:** behavior found in the Paperclip-derived implementation at the M0 reference SHA. The fork includes upstream changes after the provenance tag; see `UPSTREAM.md` Â§3â€“4 for the ancestry and exact fork commits.
- **Crewspan addition:** a difference introduced by the fork or an explicit Crewspan runtime/product decision. A proposal in a plan is called a *planned addition*, not a current feature.
- **Absent/deferred:** not implemented at the M0 snapshot or explicitly deferred by the v3 plan. An existing Paperclip feature with a similar name does not imply the planned Crewspan semantics.

Unless a statement says otherwise, **company-scoped** below means the current company/tenant boundary. It does not claim resource-level permission filtering. The route and query layers are large: the source census command for route declarations is `git grep -n -E 'router\.(get|post|put|patch|delete)\(' -- server/src/routes ':!server/src/routes/*.test.ts'` (864 declaration sites in this snapshot). The pointers below identify the authoritative declaration and guard locations; confirm a specific endpoint's handler before relying on a policy decision.

## 1. Routes

**Current surface.** Express mounts `/api` in `server/src/app.ts:638-656,956-957`; auth is mounted separately at `/api/auth` and `/api/auth/{*authPath}` (`server/src/app.ts:573-575`). Route modules are exported from `server/src/routes/index.ts:1-43` and wired into the API router in `server/src/app.ts`. A complete declaration census found 864 `router.get/post/put/patch/delete` sites (command above). Principal domains are: access/auth (`access.ts`, `auth.ts`, `authz.ts`); companies/members (`companies.ts`); agents and self-service (`agents.ts`); issues/checkout/comments (`issues.ts`, `issues-checkout-wakeup.ts`, `issue-tree-control.ts`); projects; files/folders; approvals; connections/secrets/tools; costs/activity; routines; environment/execution workspaces; chat/email; decisions/queues; plugins; health and instance administration. The individual method, path, and handler are the `router.<method>(...)` declarations in those files; line-numbered census is reproducible with `git grep -n`.

**Actor/resource/auth shape.** Actor context is built by `actorMiddleware` (`server/src/middleware/auth.ts:220`); route helpers include `assertAuthenticated`, `assertBoard`, `assertBoardOrgAccess`, `assertBoardOrAgent`, `assertInstanceAdmin`, and `assertCompanyAccess` (`server/src/routes/authz.ts:26-75`). `getAccessibleResource` is the 404-on-inaccessible-resource helper (`authz.ts:182`). Company access checks prevent an agent crossing its company and enforce active membership/read-only viewer rules for writes (`authz.ts:75-155`). A route can add resource-specific checks or use a service-level authorization decision; there is no single blanket guard that proves every route is protected.

**Response shape.** Collection routes generally return arrays/page envelopes and summary endpoints return aggregates; the handler determines whether a response is a list, count, or item. The source has no generated route-policy manifest that records method/path + actor + resource + guard + list/count for all 864 sites. **M0 risk/unknown:** before route-guard or leak-test design, normalize the declarations and inspect each handler's guard and response. Do not infer those fields solely from a route's module.

**Classification.** The HTTP control plane and company-level board/agent authorization are inherited/current. Fork subpath routing is a Crewspan operational addition (`7732ecae3`, recorded in `UPSTREAM.md` Â§4). The proposed Crewspan central route guard and restricted-resource policy retrofit are planned, not present as a completed M0 implementation (`doc/plans/2026-09-24-crewspan-e2e-v3.md:246-263`).

## 2. Queries

**Current read paths.** Route handlers delegate to domain services under `server/src/services/`; the service registry is `server/src/services/index.ts`. Read families cover companies/agents/projects/issues; issue comments, documents, attachments and work products; activity, runs and costs; connection/tool catalogs; routines; decisions/inbox; and environment/workspace state. Representative company-scoped joins and access-aware reads are in `server/src/services/authorization.ts:540` (`authorizationService`) and `server/src/routes/authz.ts:157-211` (`hasCompanyAccess`, `getAccessibleResource`). The schema inventory is exported via `packages/db/src/schema/index.ts`; core work tables include `issues`, `projects`, `agents`, `issue_attachments`, `issue_documents`, and `issue_work_products`.

**Filter status.** Existing tenant reads commonly include `companyId` predicates and compound company/resource joins; access checks also use actor membership. Current company-wide visibility of work objects is the inherited default documented by `doc/SPEC-implementation.md` and the v3 plan. That means a company filter alone is not a Crewspan restricted-folder or per-resource permission check. The `authorizationService` and `principal_permission_grants` tables support permission-oriented decisions in existing Paperclip surfaces, but are not proof that every work-object query is filtered through a universal scoped-query layer.

**Classification and gap.** Company partitioning and existing authorization-aware reads are inherited/current. A complete function-by-function catalog of data-access reads and a systematic â€œcompany-only vs. resource-filteredâ€ disposition is still required before estimating the authorization retrofit (v3 plan Â§3.2 and S1, Â§3.3). No new access model is implemented by this report.

## 3. Realtime events

**Current surface.** `setupLiveEventsWebSocketServer` implements the company live-event WebSocket in `server/src/realtime/live-events-ws.ts:227`; it authenticates the upgrade, resolves a company context, subscribes with `subscribeCompanyLiveEvents`, and sends serialized events (`:127-221,256-265`). Upgrade authorization checks the company/agent context; this is a separate authorization path from Express routes. Other socket surfaces are runner PRP and environment terminal (`server/src/realtime/runner-prp-ws.ts`, `environment-custom-image-terminal-ws.ts`; mounted in `server/src/index.ts`).

**Payload/fan-out.** Live events are fanned out by company subscription, so company membership is the present visibility boundary. The event payload union and publishers are in the shared live-event service/types (`server/src/services/live-events.ts` and callers of `publishLiveEvent`; locate with `git grep -n -E 'publishLiveEvent|subscribeCompanyLiveEvents' -- server/src`). Runner PRP carries run-scoped protocol messages, not general company broadcasts. **Unknown:** no single checked-in catalog currently states every event name, payload field, producer, and subscriber authorization together.

**Classification.** Company-scoped live delivery is inherited/current. Crewspan per-resource event filtering and restricted-conversation fan-out are planned, absent M0 work (`doc/plans/2026-09-24-crewspan-e2e-v3.md:250-253,Â§5.7`).

## 4. Background jobs

**Current schedulers/workers.** The API startup composes and starts job, plugin, email/channel, feedback-export, chat-publication, and import-transfer workers (`server/src/app.ts:810-933,1122-1215`); shutdown stops them (`:1310-1312`). Heartbeat execution and wake/retry logic live in `server/src/services/heartbeat.ts`; routine triggers and dispatch are in `server/src/services/routines.ts` and routine scheduler services. Plugin jobs use `server/src/services/plugin-job-scheduler.ts`. Additional reconciliation/recovery work is started by `server/src/index.ts` (startup recovery imports near `:8-15,86-105`).

**Trigger/origin behavior.** Inherited jobs include scheduled heartbeats, routine triggers, notification and chat delivery, exports, and execution recovery. Run/trigger records are tied to agents, issues, routines, or provider delivery identities in the corresponding services and schema (`heartbeat_runs`, `routines`, `routine_runs`, connection delivery tables). **Unknown:** this census is not yet a complete trigger-by-trigger originator/sponsor/budget table; inspect each scheduler callback before assigning those fields.

**Classification.** Existing schedulers and retries are inherited/current. The v3 plan's unified task-or-interaction trigger matrix, explicit originator/sponsor, signed webhooks and background-run routines are future Crewspan design; signed webhooks/background run routines are explicitly 1.x deferred (`doc/plans/2026-09-24-crewspan-e2e-v3.md:195-200, Â§7.5`).

## 5. Agent-facing surfaces

**HTTP/tool surfaces.** Agents authenticate through `/agents/me` and use issue, comment, attachment, work-product, approval, routine, skill, connection, and tool-gateway APIs. Self-service route declarations are in `server/src/routes/agents.ts` (for example `/agents/me`, `/agents/me/inbox-lite`, `/agents/me/inbox/mine`, `:4136-4239`) and task operations in `server/src/routes/issues.ts`. MCP server tools are defined in `packages/mcp-server/src/tools.ts`; the CLI's agent-facing API wrappers/commands are in `cli/src/commands/client/agent.ts` and `issue.ts`. Agent instructions/skills are delivered from the skills catalog and access routes.

**JWT.** `LocalAgentJwtClaims` is in `server/src/agent-auth-jwt.ts:10-19`; `createLocalAgentJwt` binds the subject to an agent, company, instance and run with issue/run context and expiry (`:122-163`). The token is injected for adapter execution and verified by agent middleware. Keep the exact claim list tied to that interface; a user-facing task token is not a general user session.

**Classification and gap.** Agent bearer auth, task APIs, MCP/CLI surfaces, and run JWTs are inherited/current Paperclip capabilities. Crewspan narrowed grants, policy snapshots bound to each run, scope-narrowing delegation, and an authoritative sponsor model are planned, not evidenced as M0 behavior. The v3 plan calls for inventorying JWT claims and MCP/tool endpoints (Â§3.2, lines 254-255).

## 6. Auth

**Configuration and principals.** Better Auth construction/session resolution is in `server/src/auth/better-auth.ts:241-394`. `PAPERCLIP_DEPLOYMENT_MODE` selects `local_trusted` or `authenticated`; config defaults to `local_trusted` (`server/src/config.ts:170-180`). `actorMiddleware` resolves local Board, authenticated session, cloud tenant, and agent-key principals (`server/src/middleware/auth.ts:220-330,599-774`). Company membership roles and instance-admin status are distinct (`company_memberships`, `instance_user_roles`; `auth.ts:285-299`).

**MFA/OIDC.** Better Auth plugins and provider configuration are the source of truth (`server/src/auth/better-auth.ts:241-356`; search `git grep -n -i 'multiFactor\|oidc' -- server/src/auth server/src`). No Crewspan MFA-for-Board or OIDC organizational identity retrofit is established by the M0 product code. The v3 plan calls these out for feasibility/decision work, not as existing semantics (`doc/plans/2026-09-24-crewspan-e2e-v3.md:254-256,Â§13.11`).

**Classification.** Both deployment modes, Better Auth sessions, Board/agent actor types, company memberships, and instance roles are inherited/current. Board-set mixed human/agent leadership, Crewspan authority limits, and mandatory Board MFA are planned additions. The 2026-09-29 Board decision selects `authenticated` for the local reference instance (`UPSTREAM.md:178-184`); that is an instance decision, not a code default change.

## 7. Runner and adapters

**Adapter inventory.** Built-in adapter packages are under `packages/adapters/` (including Claude, Codex, Cursor, Gemini, Grok, Kimi, OpenCode, Pi, Hermes, OpenClaw and Cursor Cloud); server registration is in `server/src/adapters/registry.ts` and the built-in imports/types in `server/src/adapters/index.ts` and `builtin-adapter-types.ts`. Shared launch contracts and ACP execution live in `packages/adapter-utils/src/`. Adapter availability/config/schema routes are in `server/src/routes/adapters.ts`; HTTP/process CLI adapters are in `cli/src/adapters/http/` and `cli/src/adapters/process/`. Enumerate registered types from the registry, not package directory names.

**Launch/session/model.** Heartbeat orchestration resolves adapter config and execution workspaces in `server/src/services/heartbeat.ts`; native and legacy execution have separate runtime paths and state in `server/src/services/native-runtime/` and the heartbeat service. ACPX launch, session resume, model/effort propagation and per-adapter command behavior are shared in `packages/adapter-utils/src/acpx-engine/execute.ts` (requested model at `:1888`, model/effort options around `:1468-1516,2560-2593`). Provider/session state is persisted in `agent_task_sessions` and run records.

**Isolation.** Adapter configuration documents optional Bubblewrap filesystem/network scopes, off by default (`packages/adapters/claude-local/src/index.ts:73-92`, `packages/adapters/codex-local/src/index.ts:148-165`); shared process confinement code is in `packages/adapter-utils/src/server-utils.ts` (Bubblewrap command construction). The repository census did not identify a Crewspan per-run hostname-allowlist egress proxy; the v3 plan cites that capability as an upstream optional primitive (Â§9.1), which must be rechecked against the pin and deployment. **M0 risk:** a source-level setting does not prove a sandbox or proxy is enabled or effective on the local reference host; host probes remain separate.

**Classification.** Adapter/plugin execution and optional sandbox primitives are inherited/current. The v3 runner supervisor, mandatory rootless per-run sandbox, per-run clones, credential/git brokers, stronger egress capabilities, isolation grades and probes are planned Crewspan additions and absent from M0 (Â§9, Â§3.2). No adapter list or model flag here implies enforceability of provider policy.

## 8. Work behaviour

**Task lifecycle.** Issues are the task object (`packages/db/src/schema/issues.ts`); status validators/constants are shared, transitions and mutations run through `server/src/services/issues.ts` and issue routes. Checkout is an atomic issue operation in `server/src/services/issues.ts` and `server/src/routes/issues-checkout-wakeup.ts`; run lifecycle is separately recorded in `heartbeat_runs`. Approval routes/services persist approval request, resolution, comments, and linked issue context (`server/src/routes/approvals.ts`, `server/src/services/approvals.ts`).

**Assignment/wakeup.** Assignment can enqueue an agent wake; queue/delivery integration is `server/src/services/issue-assignment-wakeup.ts` and is wired in `server/src/index.ts`. Heartbeats select assigned work and record run state in `server/src/services/heartbeat.ts`. Assignment, issue state, heartbeat status, and approval status are separate concepts. **Unknown requiring focused trace:** exact wake behavior for each route and each company setting; do not treat â€œassignedâ€ as â€œrunningâ€ without following the queue and scheduler path.

**Classification.** Single-assignee issues, atomic checkout, heartbeat execution, and existing approval gates are inherited/current and remain control-plane invariants. The v3 task/run/attempt state machines and explicit `assign` versus `start` semantics are proposed Crewspan changes; `Assign does not start` is a design choice contingent on S7 verification (Â§7.8), not a current universal setting.

## 9. Connections and budgets

**Connections/secrets.** AI connection routes and defaults are in `server/src/routes/ai-connections.ts` and `packages/db/src/schema/ai_connection_defaults.ts`; provider, credential and tool access behavior is split across connection services, `server/src/routes/tool-access.ts`, and `server/src/services/tool-gateway.ts`. Secret metadata/value/version/binding ownership is modeled in `packages/db/src/schema/company_secrets.ts`, `company_secret_versions.ts`, `company_secret_bindings.ts`, and user-secret definition/declaration schemas. Credentials may be user- or company-scoped; a visible provider connection is not itself authorization to use every credential.

**Budgets/costs.** Budget policy and incident tables are `packages/db/src/schema/budget_policies.ts` and `budget_incidents.ts`; cost rows are `cost_events.ts`. Routes are `server/src/routes/costs.ts`; enforcement, reservations and spend checks are in budget/cost services (`git grep -n 'budgetPolicy\|budget.*hard\|costEvents' -- server/src/services`). Adapter usage may be reported by a runtime, estimated, or missing; cost evidence is not equivalent to provider-side metering.

**Classification.** Existing AI connections, scoped secrets, cost events and budget enforcement are inherited/current. Crewspan data-handling classes, gateway-enforced model policy, run/task budget reservations and unified spend labels are planned (Â§10), not implied by the existing tables. Connection grant ownership and cost coverage need provider-by-provider verification before claiming a complete M0 control matrix.

## 10. Knowledge and communication

**Work context/storage.** Issue documents/revisions, attachments, and work products have separate schemas (`packages/db/src/schema/issue_documents.ts`, `documents.ts`, `document_revisions.ts`, `issue_attachments.ts`, `issue_work_products.ts`). Routes are split across `server/src/routes/issues.ts`, `file-resources.ts`, and `assets.ts`; storage providers are configured under `server/src/storage/`. The Artifacts view is a UI surface over persisted work products/attachments, not a separate universal filesystem.

**Inbox/chat.** Mine/Inbox and interaction reads are exposed through `server/src/routes/agents.ts`, inbox/attention/decision route modules and services. Experimental chat is issue-backed: chat channel/conversation schema is in `packages/db/src/schema/chat_channels.ts` and related `chat_*` schemas; durable agent chat adds issue/session state (`packages/db/src/migrations/0274_agent_chat.sql`). Provider chat connectors have their own webhook/credential/delivery boundaries.

**Classification.** Issue documents, attachments, Artifacts/work products, Inbox, and experimental chat are inherited/current Paperclip surfaces. Managed company Files with folders/versions/permission-filtered search and context bundles with provenance are planned Crewspan product work; do not claim those planned resource-level controls exist because documents or folders exist (Â§6, Â§11).

## 11. Migrations

**Mechanism.** Drizzle schema source is `packages/db/src/schema/*.ts`, exported by `schema/index.ts`; `packages/db/drizzle.config.ts:3-8` generates into `src/migrations` from compiled `dist/schema/*.js`. Runtime migration discovery/journaling is implemented in `packages/db/src/client.ts:10-12,284-332,449-490`; journal is `packages/db/src/migrations/meta/_journal.json`. There are 284 SQL migration files at this snapshot, with names ranging from `0000_mature_masked_marvel.sql` through `0285_rapid_carlie_cooper.sql`; the numeric range is not the count. The runtime tracks applied migrations in `__drizzle_migrations` (`client.ts:11,378-389`).

**Down/multiple streams.** Migration files are forward SQL; no paired down-migration directory or runner is configured. Plugin-owned database namespaces/migrations are additive runtime records (`packages/db/src/schema/plugin_database.ts:23-50`) and do not make core Drizzle support multiple source migration folders. Backout strategy is backup/restore, not SQL rollback. `doc/DATABASE.md` documents plugin namespace behavior and backup boundary.

**Classification.** Drizzle and plugin namespace migrations are inherited/current. The v3 proposal for a separate Crewspan migration stream, additive side tables, and upstream-first hooks is future work (Â§13.13); it is absent at M0, and no `cs_*` schema is introduced here.

## 12. Plugins and hooks

**Extension points.** Plugin manifest/types and host API are in `packages/plugins/`; plugin discovery, worker management and lifecycle are in `server/src/services/plugin-worker-manager.ts`, `server/src/services/plugin-loader.ts`, and `server/src/services/plugin-job-scheduler.ts`. HTTP management/UI surfaces are `server/src/routes/plugins.ts` and `plugin-ui-static.ts`. Adapter plugins use the adapter registry/bootstrap. Database namespace/migration ownership is represented by `plugin_database_namespaces` and `plugin_migrations` (`packages/db/src/schema/plugin_database.ts:23-50`). Search source for actual stable hook registrations with `git grep -n -E 'register.*Hook|hookRegistry|hooks:' -- packages/plugins server/src`; a plugin API or UI slot is not automatically a server-side authorization hook.

**Classification.** Existing plugin and adapter extension points are inherited/current. The M0 code does not establish the v3 plan's guarantee that every authorization decision can be changed by upstream-first hooks or that Crewspan-specific policy needs no upstream-file edits. Hook coverage and supported lifecycle contracts remain an explicit unknown for the divergence spike (Â§13.13).

## Cross-inventory M0 findings

1. The current inherited visibility boundary is primarily company/tenant scope. The v3 plan itself identifies company-wide visibility with resource-scoped controls deferred; this is the central risk for S1 and the future permission retrofit.
2. Route, query, event, and background-job inventories are separate: an Express route guard does not secure ORM callers, WebSocket fan-out, worker callbacks, or tool-provider calls by itself.
3. The fork contains no implementation of the v3 mixed-seat org, Board governance/authority limit model, mandatory sandbox supervisor, context-bundle Files model, or Crewspan migration stream at the M0 reference SHA. These belong to later milestones and must stay behind the M0 go/no-go (`doc/plans/2026-09-24-crewspan-e2e-v3.md:291-302,1560-1568`; `UPSTREAM.md:178-190`).

## Evidence commands

Run these from the repository root to reproduce the static source checks used for this census:

```sh
git rev-parse 49cac8af8
git diff --stat 49cac8af8..HEAD
git grep -n -E 'router\.(get|post|put|patch|delete)\(' -- server/src/routes ':!server/src/routes/*.test.ts'
git grep -n -E 'publishLiveEvent|subscribeCompanyLiveEvents' -- server/src
git grep -n -i -E 'multiFactor|oidc' -- server/src/auth server/src
git grep -n -E 'register.*Hook|hookRegistry|hooks:' -- packages/plugins server/src
```

This is a static repository inventory. It does not prove runtime enablement, host isolation, provider-side cost metering, or that every endpoint/query has undergone a dedicated leak test. Those are M0 probes or follow-up inventory details, not inferred from source existence.
