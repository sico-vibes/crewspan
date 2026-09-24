# Crewspan Version 3: end-to-end product and engineering plan

**Version 3, definitive plan, 24 September 2026**
**Status:** This is a product and engineering plan for work that has not been built. Nothing here says a feature exists today.
**Supersedes:** [Version 1](2026-09-24-crewspan-e2e-v1.md) and [Version 2](2026-09-24-crewspan-e2e-v2.md). Both remain unchanged. Version 2 is still the north star for the product. Version 3 fixes its release scope, removes the ambiguity about triggers, states and authority, restates its security promises in terms that can be enforced, and adds a strategy for staying close to upstream Paperclip. The fixes come from the [Opus 5.5 review and Codex assessment](2026-09-24-crewspan-opus-review.md).

### How claims are labelled

| Label | Meaning |
|---|---|
| **[V 2026-09-24]** | The orchestrator checked this against a primary published source on 24 September 2026. It must still be re-checked against the *pinned* Paperclip commit at Milestone 0, because docs on `master` can differ from a release. |
| **[M0]** | An assertion from earlier plans or from general knowledge. It is unverified and must be confirmed or corrected in Milestone 0 before anything is designed on top of it. |
| **Choice** | A design decision made in this plan. It can be revised with a recorded reason. |
| **Deferred** | Deliberately left out of the first stable release. The entry states the condition for bringing it back. |

---

## 0. What Version 3 changes

| Problem in V1/V2 | Resolution in V3 |
|---|---|
| "All milestones are required for the first public release", with no scope limit (V2 §5). | Four tiers: **Private Alpha 1 → Private Alpha 2 → Public Preview → Stable 1.0**. Stable 1.0 still covers the full core journey, including DMs and channels. Routines, webhooks, skill versioning workflows, personal runners and similar work move to **1.x** (§2.2). |
| One lifecycle mixed task states with run states (V2 §3). | Three separate state machines: **task**, **run** and **attempt** (§7). |
| Mentions both "create a task" and "don't change ownership"; DMs create no task; "Run only" routines had no record of work. | One **trigger matrix** (§7.5). Every agent run belongs to a **task** or to an **interaction**, and every run has an originator, a funding budget and an audit trail. |
| The "initiating human" was undefined for scheduled, webhook and agent-originated work. | Every run has an **originator**, a **sponsor** and an **acting agent**. A child's scope can only be narrower than or equal to its parent's (§5.1–5.3). |
| AI authority was undefined. Earlier review advice proposed a blanket ban on AI approvals. | AI leaders may coordinate and approve **ordinary work inside a limit a human has already approved**. They can never create or enlarge access, credentials, budget or deployment authority (§4.6–4.8). |
| Worktrees were mounted as the "parallel" mode, and git credentials were unspecified. | Each run gets its **own clone**, containing only permitted refs. Results come back as a **validated git bundle**. Push credentials never enter the sandbox. Worktrees are only an editing convenience *inside* a private clone (§9.7). |
| The isolation stack and where host privilege lives were unnamed. | A reference architecture: control plane in Compose; a **runner supervisor** as a non-root host service; rootless sandboxes; a per-run egress proxy; a model gateway. Each run gets a stated isolation grade and must pass a probe suite (§9). |
| Model, effort and budget controls were presented as if always enforceable. | Each control is labelled **gateway-enforced**, **adapter-enforced** or **advisory**. Each cost is labelled **metered**, **reported** or **estimated**. Connections carry data-handling classes that constrain fallback (§10). |
| "Revocation cancels runs holding revoked data" and "no duplicate charge". | Revocation stops runs whose policy snapshot depends on the revoked grant and quarantines their outputs. Disclosed data cannot be recalled. There is no duplicate *dispatch*, and all retry cost is attributed to the same run (§5.8, §7.9). |
| Agent↔agent DMs, prompt injection and DM privacy were unaddressed. | Agent↔agent DMs are deferred. A message written by an agent never triggers another agent. Prompt-injection guards are defined, and a DM privacy policy is disclosed in the product (§11). |
| The personal-runtime drill was required even though personal runners were deferred (V2 §5). | The drill moves to the 1.x personal-runner gate (§9.16). |
| Two different pilot sizes (V2 §1 vs §5). | One pilot definition (§2.3). |
| No upstream divergence strategy; "migrations both ways". | Additive side tables, a separate migration stream, rollback by restoring a backup, upstream-first hooks, and a budget for divergence (§13.13). |
| Continuity of the UI was judged subjectively. | Objective gates: token lint, component allowlist, pixel-stable inherited screens, and a named Paperclip ancestor for every new surface (§12). |

---

## 1. Product thesis

### 1.1 Thesis

Crewspan is a **public, self-hosted fork of Paperclip** for any knowledge-work company. People and AI agents share one company:
- the same organisation chart,
- the same projects, tasks, files and conversations,
- the same operations view.

The Board decides who leads, which can be a human or an AI CEO. It sets the maximum authority any agent may use: data, tools, runtime, provider, model, effort and spend. Managers, human or AI, allocate work and agents only within that limit. Every delegated piece of work can be traced from request through execution, review and accepted result, along with what it cost.

Crewspan does not claim that "humans and agents in one workspace" is new. Other products already offer it (§1.5). Crewspan's differentiators are:

1. **Mixed leadership.** Human or AI CEOs and team leads, with human and agent reports. Authority is bounded by limits the Board sets.
2. **Company-grade scoped access.** Enforced on the server for people *and* agents, across UI, API, search, files, realtime events and agent tool calls.
3. **Verified per-run containment on a single VPS.** Each run gets a stated isolation grade that is tested on the actual deployment, not asserted from a configuration flag.
4. **Governed models and spend.** Every run is honestly labelled as enforced or advisory, and metered or estimated.
5. **Accountable delegation.** Typed child tasks, evidence, independent review, human sign-off, and cost per accepted task.
6. **Any knowledge work.** Projects without repositories, managed documents and assets, and research agents with web access that must be explicitly granted.
7. **Paperclip's operations UI, extended rather than replaced.** Self-hosted, and MIT-licensed like Paperclip.

### 1.2 Target companies and workflows

The primary buyer and user is a company of **3–50 people** that self-hosts on one Linux VPS and uses several AI agents on real company work. Typical examples are a consultancy or agency, a research or analysis team, a product/software team, and an operations or marketing team.

| # | Workflow | What it proves |
|---|---|---|
| W1 | The founder (Board) appoints an AI CEO, which triages incoming requests into projects and routes them to human or agent leads. | AI coordination inside a limit; escalation to humans. |
| W2 | A human research lead owns a document-only project, allocates a research agent and a writing agent, delegates a literature scan with web access, and reviews the draft before publishing it to the project's Files. | A project without a repository; granted web access; managed deliverables; review. |
| W3 | An engineering lead owns a project with two repositories. An agent opens a branch on each; a separate reviewer agent checks the work; the human accepts it. | Multi-repository projects, per-run clones, bundle return, independent review. |
| W4 | A member asks `@Analyst` a quick question in a project channel, then turns the answer into a tracked task. | Interaction versus task; conversion to a task; cost attribution. |
| W5 | A contractor gets access to one restricted folder for 14 days, requests access to an agent, and is offboarded afterwards. | Access requests, expiring grants, offboarding. |
| W6 | The Board reviews monthly spend by team, project, agent and accepted task, and sees which costs are metered and which are estimated. | Cost visibility with honest labels. |

### 1.3 What Crewspan inherits from Paperclip

Every item in this subsection is **[M0]** unless a verified label is shown.

- The React UI, Express API, PostgreSQL/Drizzle data layer, Better Auth, monorepo layout, and the `DESIGN.md` principles and tokens.
- Companies, the Board operator model, agents and the agent tree, projects, project workspaces and repository links, tasks/issues, issue documents, attachments, the Artifacts view, approvals, run history, budgets, costs, activity, Connections, adapters (including local CLI adapters), skills, routines, heartbeats, the "Mine" and Inbox surfaces, and experimental agent chat.
- **Run- and agent-scoped short-lived JWTs** for heartbeat agents **[V 2026-09-24]** ([authentication docs](https://github.com/paperclipai/paperclip/blob/master/docs/api/authentication.md)). Crewspan audits and extends these rather than inventing a new mechanism.
- **Optional Linux Bubblewrap filesystem scoping** and an **optional hostname-allowlist HTTP(S) egress proxy**, both **off by default** **[V 2026-09-24]** ([agent-run spec](https://github.com/paperclipai/paperclip/blob/master/doc/spec/agent-runs.md)). Crewspan evaluates them as building blocks.
- **Company-wide visibility of work objects by default, with scoped controls deferred** **[V 2026-09-24]** ([implementation spec](https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md)). This is exactly why the Crewspan permission retrofit touches the whole codebase.

### 1.4 What Crewspan adds

- **Organisation:** human and agent org nodes, a defined Board, CEO appointments, mixed teams, agent allocation and stewards, and authority limits.
- **Access:** a central permission service, grants, restricted folders and conversations, access requests, effective-access explanations, presets, and migration from open visibility.
- **Work model:** separate task, run and attempt state machines; interactions; the trigger matrix; a dispatch preview; delegation with typed child tasks, review and sign-off; caps; cost per accepted task.
- **Execution:** a runner supervisor, rootless sandboxes, a git broker, a credential broker, a per-run egress proxy with capability grants, a model gateway, isolation grades, a probe suite, and session partitioning.
- **Models and spend:** a model policy resolver, enforcement and cost labels, data-handling classes, budget reservations and hard stops.
- **Knowledge:** a project Files area (folders, managed documents and assets, versions), permission-filtered full-text search, and context bundles with provenance.
- **Communication:** channels, DMs, one-level reply threads, mentions, conversion to task, and the actionable Inbox.
- **Operations:** a setup and isolation report, encrypted backups with a separate key, a restore drill, an upgrade path from Paperclip, MFA for the Board, and offboarding.

### 1.5 Competitor, inspiration and licence boundaries

- **Paperclip** is MIT-licensed **[M0: confirm licence file at the pinned commit]**.
  - Crewspan keeps the MIT notice and attribution and ships a `NOTICE`/`UPSTREAM.md` naming the pinned upstream commit.
  - MIT grants no trademark rights. Crewspan does not use Paperclip's logo or imply endorsement. Plain factual wording such as "based on Paperclip" is fine.
  - **Choice:** Crewspan's own code is also MIT, to keep syncing and contributing upstream simple.
- **Multica** is a direct comparator.
  - Its security docs state that default runs inherit the daemon's OS user filesystem, network and credentials, with no default filesystem sandbox guarantee **[V 2026-09-24]** ([security model](https://multica.ai/docs/security-model)).
  - Its repository uses a custom licence with conditions beyond Apache 2.0 **[V 2026-09-24]** ([licence](https://github.com/multica-ai/multica/blob/main/LICENSE)).
  - Other Multica behaviours cited in V2 (roles, squads, Autopilots, execution modes, skills) are **[M0]**.
  - **Rules:**
    - Crewspan never copies Multica code, UI, assets or documentation text. It implements independently from Paperclip's codebase.
    - Public docs may be used for product comparison.
    - As a conservative process choice (not a conclusion from the licence text), implementers of the matching subsystems avoid reading Multica source.
    - Crewspan uses its own names for modes and features.
    - Any competitor comparison used in public marketing is dated and re-verified immediately before publication.
- **Buzz** (DMs and channels with humans and agents present), **delegate-skills** (bounded delegation with review) and **9Router/OmniRoute** (quota-aware routing) are inspiration only.
  - Their licences are **[M0]**.
  - No code is merged. External routers may be *configured* as untrusted upstream endpoints (§10.8).
- **Crewspan name.** The name is a codename. A basic trademark screen for "Crewspan" happens in M0, before any public repository or package uses the name. If the screen fails, the public repository uses a neutral name until branding is decided.

---

## 2. Product contract

### 2.1 Core journey (the Stable 1.0 bar)

The whole journey must work end to end in Stable 1.0:

1. **Set up** the company on a VPS.
2. **Invite** people.
3. **Define the Board** and **appoint a human or AI CEO**.
4. **Build mixed teams.**
5. **Create projects** (with or without repositories) and their resources.
6. **Allocate agents** within limits.
7. **Communicate** in channels and DMs, with mentions.
8. **Delegate** work through accountable child tasks.
9. **Review** evidence and sign off.
10. **Inspect** cost and activity per run, task, project, team and company.

### 2.2 Release tiers

| Capability | Private Alpha 1 (internal) | Private Alpha 2 (2–3 design-partner companies) | Public Preview (labelled) | Stable 1.0 | Later (1.x+) |
|---|---|---|---|---|---|
| Human and agent org nodes, Board, CEO appointment | ✓ | ✓ | ✓ | ✓ | |
| Scoped access (first-release scopes, §5.4), presets, effective access | ✓ | ✓ | ✓ | ✓ | Per-task and per-document grants |
| Access requests with expiry | ✓ | ✓ | ✓ | ✓ | |
| Contained company runner pool, isolation grades, probe suite | ✓ | ✓ | ✓ | ✓ | Personal and remote runners |
| Per-run clone and bundle return; isolated-branch mode | ✓ | ✓ | ✓ | ✓ | Shared-checkout mode (personal runners only) |
| Model gateway, enforcement and cost labels | partial | ✓ | ✓ | ✓ | External router certification |
| Task, run and attempt machines; trigger matrix; dispatch preview | inherited flows only | ✓ | ✓ | ✓ | |
| Delegation, delivery teams, review, sign-off, caps | | ✓ | ✓ | ✓ | Adaptive lane routing |
| Budgets with reservations and hard stops | inherited | ✓ | ✓ | ✓ | |
| Project Files, versions, full-text search, context bundles | | ✓ | ✓ | ✓ | Semantic retrieval, office previews, co-editing |
| Channels, DMs, one-level threads, mentions, conversion to task | | | ✓ | ✓ | Agent↔agent DMs, reactions, presence |
| Actionable Inbox, in-app and browser notifications | inherited | partial | ✓ | ✓ | Email digest |
| Inherited Paperclip routines under the Crewspan authority rules | ✓ | ✓ | ✓ | ✓ | Background-run mode, signed webhooks |
| Effective skill version recorded on each run | | ✓ | ✓ | ✓ | Skill review workflow, controlled learning loop |
| Upgrade from an existing Paperclip install | | ✓ | ✓ | ✓ | |
| Encrypted backup, separate key, restore drill | ✓ | ✓ | ✓ | ✓ | |
| MFA for Board members | ✓ | ✓ | ✓ | ✓ | SSO/OIDC, SCIM |
| Independent security review completed | | | scheduled | ✓ | |

**How each tier is labelled:**
- **Private alphas** are invite-only, with no compatibility promise.
- **Public Preview** carries a banner and release notes: "Preview. Security review pending. Not recommended for sensitive data. Upgrades are supported, but may need migration steps."
- **Stable 1.0** carries the security model, a published list of limitations, and an upgrade commitment.

### 2.3 Success criteria and the single pilot definition

**The pilot company** (used for Alpha 2, Preview and Stable):
- **People:** at least 3 humans, namely one Board owner, one human team lead, and one member or contractor.
- **Agents:** at least 3, namely an AI CEO or AI lead, a worker agent and a reviewer agent.
- **Projects:** at least 2, namely one repository-backed project with 2 repositories and one document-only project.
- **Both leadership variants:** human-CEO and AI-CEO runs of the pilot must each pass.

Stable 1.0 requires all of the following, demonstrated on the reference VPS:

1. A human CEO and an AI CEO are both valid appointments, and mixed reporting lines work without cycles.
2. A member can operate only the agents allocated to them. They see only authorised projects, files, conversations, runs and costs, and hidden items do not appear in counts, search or notifications.
3. An agent running for Project A cannot read Project B's clones, files, credentials, API data or earlier session state, **including when the same agent is allocated to both projects**.
4. A channel mention can start a governed interaction or create a task. A reviewer can inspect the evidence, request changes and accept the result.
5. The Board can see the full work and spend trail, with metered, reported and estimated costs labelled, without reading raw transcripts.
6. Every inherited screen is pixel-stable unless the compatibility map lists a change. Every new screen passes the continuity gates in §12.
7. A person can assign ownership without starting a run. Every run-starting action shows its target, originator, context, runtime and isolation grade, model and enforcement label, and budget before it starts, unless it runs inside an approved automation limit (§7.6).
8. A mixed team completes a delegation with child tasks, survives a runner disconnect without duplicate dispatch, and reaches human sign-off.
9. Offboarding a person leaves no live grants, no orphaned running agents and no unowned tasks.
10. A restore onto a clean VPS, using the backup and the separately stored key, reproduces the company.

### 2.4 Non-goals for Stable 1.0

- A SaaS or hosted service, multi-tenant billing, or a central model-billing service.
- A new frontend, a separate design system, or native desktop or mobile clients.
- General chat-platform features: voice, huddles, reactions, presence indicators beyond agent availability, external federation, bots from third-party marketplaces.
- Real-time collaborative document editing.
- Automatic, unreviewed rewriting of prompts or skills.
- Claims that isolation holds against a kernel zero-day, a malicious host administrator, or exfiltration through endpoints the company has granted.
- Guarantees about provider behaviour: data retention, training, or subscription terms.

### 2.5 Deferred choices, stated as choices

| Deferred item | Condition for inclusion |
|---|---|
| Personal and remote runners | The gates in §9.16 pass. |
| Shared-checkout execution | Available only on personal runners, with owner consent. |
| Signed webhooks; "background run" routines | The trigger matrix already covers them. They ship in 1.x once idempotency and pause-on-failure tests pass. |
| Skill review workflow and the controlled learning loop | Built on the effective-skill-version records that ship in 1.0. |
| Agent↔agent DMs | Loop and injection guards proven with real usage data; agents coordinate through tasks until then. |
| Semantic or vector retrieval | Permission pre-filtering proven at the index level. |
| Per-task, per-document and per-asset grants | Demand from pilots, plus authorisation performance headroom. |
| Email digest | Requires SMTP configuration in the setup report. |
| SSO/OIDC and SCIM | After MFA. OIDC depends on Better Auth support **[M0]**. |
| AI-assisted agent setup | A human must review the effective access, runtime and spend limit before the agent is activated. |

### 2.6 Terminology

The UI uses the words of the pinned Paperclip release. The plan writes "company", "Board", "task" and "agent" for readability. M0 produces a term table checked against the pinned UI **[M0]**. For example, the plan's "task" becomes whatever label the pinned UI actually shows for an issue.

New Crewspan terms and how they appear in the UI:

| Concept (plan term) | UI label | Meaning |
|---|---|---|
| Envelope | **Limits** | The maximum authority a principal may use or pass down. |
| Allocation | **Allocated to** | Which person, team or pool an agent works for. |
| Steward | **Steward** | The human responsible for an allocated agent. |
| Grant | **Access** | Permission for a principal to perform actions on a resource. |
| Interaction | **Chat request** | Agent work started from a conversation, with no task. |
| Delivery team | **Team** | A lead plus human and agent members. |
| Runtime pool | **Runner pool** | A set of runners that share a configuration. |
| Isolation grade | **Isolation** | The containment level of a run (§9.12). |
| Dispatch preview | **Before you start** | The panel shown before a run starts. |
| Funding budget | **Charged to** | The budget that pays for a run. |

---

## 3. Milestone 0: current-state verification and go/no-go spikes

M0 exists to turn assumptions into measurements. Nothing after M0 is committed until the M0 gate passes.

### 3.1 Pin and baseline

- Select the latest stable Paperclip release at M0 start. V1 and V2 researched `v2026.916.1` **[M0]**.
- Record the tag, commit SHA and date in `UPSTREAM.md`. Keep `upstream` as a Git remote.
- Build it unchanged. Run upstream's own test suites and record the pass rate.
- Deploy it unchanged on the reference VPS (§13.8) in authenticated mode **[M0: mode name]**.
- Capture the design baseline:
  - screenshots of every top-level screen in light and dark themes at 1440, 1024 and 390 px;
  - an inventory of design tokens (expected in `ui/src/index.css` **[M0]**);
  - an inventory of components;
  - a Storybook build if one exists **[M0]**;
  - the `DESIGN.md` principles **[M0]**.

### 3.2 Inventories (each published as a checked-in document)

| Inventory | Contents | Used by |
|---|---|---|
| Routes | Every HTTP route: method, path, actor types, resource type, current authorisation check, and whether it returns lists or counts. | Route guard, leak tests (§5.7, §5.11). |
| Queries | Every data-access function that reads work objects; whether it filters by company only. | Scoped query layer. |
| Realtime events | Every WebSocket or live event type, its payload fields and its fan-out logic. | Event filtering. |
| Background jobs | Schedulers, heartbeats, routines, notifications, exports. | Originator rules (§5.2). |
| Agent-facing surfaces | The skill or API reference that agents call, MCP and tool endpoints, and the JWT claims **[V 2026-09-24: JWTs exist]**. | Run-token authorisation. |
| Auth | Better Auth configuration; roles; deployment modes; availability of MFA and OIDC **[M0]**. | §4.4, §13.11. |
| Runner and adapters | Adapter list; how each launches (host process or environment); session persistence and resume behaviour; model and effort flags; base-URL override support; how Bubblewrap and the egress proxy are wired **[V 2026-09-24: both optional and off by default]**. | §9, §10. |
| Work behaviour | Whether assigning a task to an agent currently wakes or starts it; how heartbeats pick up work; issue statuses; how approvals are shaped. | §7.8. |
| Connections and budgets | Credential ownership and grant model; budget scopes; how costs are captured. | §10. |
| Knowledge and communication | Issue documents, attachments, Artifacts storage, "Mine" and Inbox, the experimental chat data model. | §6, §11. |
| Migrations | Drizzle configuration, journal, whether down migrations exist, and whether multiple migration folders or tables are supported. | §13.3. |
| Plugins and hooks | Any plugin, adapter or middleware extension points that reduce the need to edit upstream files. | §13.13. |

### 3.3 Spikes and measurable gates

| Spike | Question | Pass condition |
|---|---|---|
| S1: Authorisation retrofit sizing | How much of the codebase must change for scoped access? | Inventory complete. Prototype route guard and scoped query helpers applied to projects, tasks and attachments, with leak tests green on those three. The M2 estimate is recalculated from the counts. |
| S2: Upstream sync rehearsal | How painful is a sync? | Merge the next upstream release (or the previous release in reverse) onto a branch carrying the S1 skeleton. Measure conflict files and hours. Pass if under 2 engineer-days. |
| S3: Sandbox on the reference VPS | Can at least one real adapter run contained? | At least one API-key-capable CLI adapter **[M0: which]** runs inside a rootless sandbox under the runner supervisor, and the full probe suite (§9.14) fails closed. Evaluate Paperclip's Bubblewrap scope, rootless Podman with default runtime, and rootless Podman with gVisor, and record which pass. |
| S4: Git isolation | Is the per-run clone plus bundle design safe and fast? | A per-run clone from a runner-owned mirror with permitted refs only. Bundle return validated. Hook and config injection probes fail. Warm provisioning of a 1 GB repository under 30 s. |
| S5: Model gateway | Can model control be enforced and usage metered? | At least one adapter pointed at a Crewspan gateway through a base-URL override, with model allowlist and token caps enforced, usage metered, and the real key absent from the sandbox. Record for each adapter whether it is gateway-, adapter- or advisory-class. |
| S6: Sessions | Does agent context persist across tasks or projects? | Document how sessions and memory persist. Prototype keying them by (agent, project), and show the cross-scope recall probe fails. |
| S7: Assign semantics | Can assigning stop implying a start? | Determine whether assignment implies a wake-up. Prototype a per-company "assign does not start" setting without breaking inherited API clients. |
| S8: MFA | Can Board members be required to use MFA? | Confirm whether the pinned auth stack supports TOTP or passkeys. |

### 3.4 Explicit unknowns before M0

These are unknown before M0:
- the size of the authorisation retrofit;
- whether the CLI adapters can run in a sandbox and honour a base-URL override;
- whether subscription-login CLIs can work without the host home directory;
- how sessions and memory persist;
- assign-wake behaviour;
- Drizzle's multi-stream support;
- MFA support;
- whether the target VPS provider supports gVisor or nested virtualisation;
- the upstream roadmap for human org nodes and permissions (V1 cited issue #11353 **[M0]**);
- the terms of each provider for sharing subscriptions (external);
- the "Crewspan" trademark screen.

### 3.5 Go/no-go decision

- **Go:** S1–S7 pass. The M2 estimate is at most 18 engineer-weeks, and upstream sync costs under 2 engineer-days.
- **Go with changes:**
  - If the retrofit estimate is 18–28 engineer-weeks, reduce the first-release scopes (drop restricted conversations, or keep only project and restricted folder).
  - If only advisory-class adapters exist for some providers, ship those providers as advisory with clear labels.
  - If gVisor is unavailable, Stable ships the "Contained (namespaces)" grade (§9.12).
- **No-go:**
  - The retrofit estimate exceeds 28 engineer-weeks, **or** no adapter can be contained on the reference VPS, **or** upstream sync exceeds 5 engineer-days per release.
  - Alternatives to evaluate: contribute the permission and runner hooks upstream first and fork only the UI additions; wait for upstream scoped permissions; or narrow Crewspan to a governance layer.

### 3.6 Upstream engagement (runs alongside M0)

- Open or join upstream discussion on human org nodes (**[M0]** #11353), a pluggable authorisation hook, run-policy and sandbox hooks, and scoped visibility.
- Offer to contribute the thin hooks upstream (§13.13).
- Record upstream's response in `UPSTREAM.md`. If upstream plans an equivalent feature, Crewspan adopts upstream's schema and maps its own side tables onto it.

---

## 4. Organisation, roles and authority

### 4.1 Relationships modelled independently

| Relationship | Meaning | It never grants by itself |
|---|---|---|
| Reporting | Who manages whom on the org chart. | Access, credentials, budget. |
| Work ownership | Who is accountable for a task and its acceptance. | Access beyond that task's project. |
| Access and authority | What a principal may view, create, assign, invoke, approve or configure. | Model or credential use. |
| Execution policy | Where an agent runs and which data, tools, egress, credentials, provider, model, effort and budget it may use. | Human access. |
| Agent allocation and stewardship | Which person, team or pool an agent works for, and which human is responsible for it. | The right to invoke it (that needs an explicit grant). |
| Runtime ownership and use | Who owns a runner or pool, and who may run work on it. | Consent to spend personal accounts. |

Two further distinctions shown in the UI:
- **Availability** (online or eligible) and **workload** (queued or running) are separate from **permission**.
- **Position** (CEO, Research Lead) is separate from **permission role** (Owner, Admin, Manager, Member, Guest).

### 4.2 Organisation schema (additive, §13.2)

- **`cs_org_node`**: `id`, `company_id`, `kind` (human | agent), `user_id` or `agent_id`, `title`, `team_id?`, `status` (active | suspended | departed | retired), `capabilities` (text tags).
  - Existing Paperclip agents are mapped one-to-one on migration, and their identities and history are unchanged.
- **`cs_reporting_edge`**: `node_id`, `manager_node_id`.
  - Enforced: one manager per node, no cycles (checked in the database transaction), and the CEO has no manager.
  - The Board is not a node. It sits above the tree.
- **`cs_team`**: `id`, `name`, `lead_node_id` (human or agent), members with role descriptions, a team limit, and a funding budget.
- **`cs_appointment`**: `position` (CEO; later other offices), `node_id`, `appointed_by` (Board member), `effective_from`, `ended_at`, `reason`.
  - Only one active CEO at a time.
- **`cs_board_member`**: `user_id`, `added_by`, `added_at`. Board members must be humans with MFA enabled.
- **`cs_allocation`**: `agent_id`, `target` (user | team | pool), `steward_user_id`, `limit_id`.
- **`cs_envelope`**: a versioned authority limit with the dimensions in §4.6.

### 4.3 Permission role templates

Templates are defaults. Explicit grants refine them. A role never grants anything above the Board limit.

| Template | Default powers |
|---|---|
| **Owner** | A Board member who created the company, or to whom ownership was transferred. Everything a Board member can do, plus transferring ownership. Cannot be removed while they are the last Board member. |
| **Board member** | Company settings, Board limits, CEO appointment, credential grants to company pools, compatibility overrides, the compliance policy, budget ceilings, and approval of expansions. Can grant themselves access to any resource ("break-glass"); this is audited and notifies the resource lead. |
| **Admin** | People and team administration; creating projects; managing Connections *records* (not their use); runner setup. No budget ceilings and no Board-only actions. |
| **Manager** | Scoped grants and allocations within their team's limit; approving access requests within that limit; reallocating the team's budget. |
| **Member** | Participates in granted projects and conversations; invokes agents allocated to them. |
| **Guest** | A time-limited member with no default project access; every grant is explicit and expires. |

Agents hold no role template. Their authority is always a limit plus explicit grants.

### 4.4 The Board

- The Board is the set of human `cs_board_member` records. The company creator is the Owner and the first Board member.
- **Default decision rule:** one Board member's approval suffices.
- **Two-person rule (Choice, optional):** the Board may require two approvals for these sensitive actions:
  - CEO appointment,
  - expanding the Board limit,
  - granting a credential to a company pool,
  - enabling an isolation compatibility override,
  - changing the compliance-access policy,
  - adding or removing Board members.
  - If the Board has only one member, the rule cannot be enabled, and the UI says so.
- Board members must use MFA. If S8 fails, MFA becomes a hard prerequisite added to M1 before any preview.
- Board actions are always audited and never delegated to agents.

### 4.5 The CEO

The CEO is a **position** that the Board appoints and can reassign through an audited transition.

| | Human CEO | AI CEO |
|---|---|---|
| Default permission template | Admin plus Manager over all teams, within the Board limit. The Board may add explicit grants. | None. Authority comes only from the **CEO limit** the Board sets, plus explicit grants. |
| Visibility | As granted. Being CEO does not imply seeing restricted folders or DMs. | As granted. By default, metadata of tasks in projects it holds a grant for. It does not automatically see all projects. |
| Routing | Creates, assigns and delegates work across teams. | Creates, assigns and delegates work within the CEO limit, including assigning to humans (who receive an Inbox item and may decline with a reason). |
| Approvals | Can approve everything a Manager can, company-wide, within the Board limit. | Only ordinary-work approvals inside the limit (§4.7). |
| Proposals | Can propose to the Board. | Can propose hires, budget changes, access, strategy and limit changes as Board approvals. |
| Sponsor of its autonomous runs | Itself. | The Board member who last approved the CEO limit (§5.2). |

**Transition:** reassigning the CEO keeps all tasks and history. An outgoing AI CEO's queued runs are paused until the incoming CEO or a Board member confirms or cancels them. Its active runs finish unless the Board chooses **Stop current runs**.

### 4.6 Authority limits (envelopes)

A limit is a versioned record with these dimensions:

- **Data:** projects, restricted folders and conversations the holder may access or pass down.
- **Agents:** which agents may be invoked, allocated or delegated to.
- **Models:** allowed (connection, model) pairs, the maximum effort level, maximum output per run, and the required data-handling class (§10).
- **Runtime:** allowed runner pools and the minimum isolation grade.
- **Tools and egress:** capability set (§9.9) and MCP or tool servers.
- **Spend:** per period, per task and per run caps, plus a funding budget reference.
- **Concurrency:** maximum concurrent runs.
- **Side-effect authority:** deploy, publish externally, send external messages, purchase. All of these are off by default, and all require human approval at the moment of use in 1.0.

Limits nest in a chain from the Board down to individual runs. Each level can only narrow what the level above allows:

- the **Board limit**
- then team or manager limits
- then agent limits (via allocation)
- then the lane (§8.8)
- then the effective policy of a single run

Validation rejects any child limit that is not a subset of its parent. A manager, human or AI, can narrow, split or allocate within their limit but cannot widen it.

### 4.7 Rules for leaders

| Action | Human leader (Manager) | AI leader (CEO or team lead) |
|---|---|---|
| Create tasks, set acceptance criteria, pick reviewers | ✓ | ✓ |
| Assign work to team members, human or agent | ✓ | ✓ (humans may decline) |
| Start runs and child runs inside the limit, and choose models within it | ✓ | ✓ |
| Split the parent task's budget among child tasks | ✓ | ✓ (never above the parent's cap) |
| Accept a child task where the review policy allows leader acceptance | ✓ | ✓ (only if the policy marks "AI acceptance allowed" for that child) |
| Accept a top-level task that requires sign-off | ✓ if designated | ✗ (always a human) |
| Approve access requests within the limit | ✓ | ✗ (routes to a human approver) |
| Create, enlarge or extend grants, credentials or budgets | Within their limit only | ✗ (can propose) |
| Create or hire agents | Proposes; Admin or Board approves | Proposes only |
| Change its own configuration, limit or instructions | ✗ (its manager or Admin does) | ✗ |
| Deploy, publish externally or purchase | Requires approval by the designated human at use time | Proposes only |

### 4.8 Approval authority matrix

| Request type | Approver |
|---|---|
| Access to a project or folder inside the approver's limit | Project lead (human) or Manager of the owning team. |
| Access that would widen a team limit | Board member. |
| Invoking an agent allocated to someone else | The agent's steward, or a Manager over the steward. |
| A new model or connection for an agent or person | Board member (or a Manager, if within their limit). |
| Budget increase within a team limit | Manager. |
| Budget increase above the team limit | Board member. |
| Credential grant to a pool or agent | Board member. |
| Compatibility override, compliance access, CEO appointment | Board member (the two-person rule may apply). |
| Top-level task sign-off | The designated human reviewer or project lead. |
| Child task acceptance | As set in the delegation review policy (§8.4). |

Nobody approves their own request. Approvals by agents are limited to ordinary work (§4.7) and always record the limit version they relied on.

### 4.9 Transfer and offboarding

**Offboarding a human:**
1. Sign-in is disabled and sessions are revoked immediately.
2. Grants are suspended, not deleted, so the audit record remains.
3. Active runs *originated* by the person continue only if their sponsor is someone else. Otherwise they are stopped, with a grace period for results to upload.
4. Owned tasks are listed for their manager to reassign, and until then they show "Owner departed".
5. Stewarded agents transfer to the manager in a *paused* state until the new steward accepts them.
6. The person's personal connections are detached, and any run or routine relying on them fails closed with an actionable message.
7. Routines they sponsored pause.
8. Their DMs are retained or deleted according to the company's retention policy (§11.4).
9. The offboarding report lists every item above and must reach "no unresolved items" before the offboarding is marked complete.

**Retiring an agent:** it is removed from allocations and teams, queued runs are cancelled, history is kept, and its scoped session state is deleted.

**Transferring ownership:** a Board-only action, audited, requiring MFA re-authentication.

**Removing a Board member:** requires another Board member. Under the two-person rule, it also requires a second approval.

---

## 5. Permissions and access

### 5.1 Principals

| Principal | Description |
|---|---|
| **User** | A human account. |
| **Agent** | A persistent worker identity. It holds grants but only acts through runs. |
| **Run** | An agent acting for one execution, authenticated by a run-scoped JWT **[V 2026-09-24: exists]**. Carries the run id and effective-policy id. |
| **System** | Internal jobs such as migrations and cleanup. Never acts on work content on behalf of people. |

Every run records three named parties:
- the **acting agent**;
- the **originator**, meaning the human (or chain of runs back to a human) whose request caused the run;
- the **sponsor**, the human whose limits and funding back the run. The sponsor is usually the originator. For autonomous or scheduled work it is a named human (§5.2).

### 5.2 Originator and sponsor by trigger

| Work source | Originator | Sponsor | Notes |
|---|---|---|---|
| Human presses Start or Assign-and-start | That human | That human | |
| Human @mentions an agent (task comment, channel, DM) | The author of the message | The author | Only human-authored mentions trigger work (§11.3). |
| Child delegation from a run | The parent run's originator (the chain is preserved) | The parent run's sponsor | Scope narrows (§5.3). |
| Child delegation by a human leader | The leader | The leader | |
| Scheduled routine or heartbeat | The routine's owner, who approved its current configuration | Same | Pauses if the owner loses access or leaves. |
| Webhook trigger (1.x) | The webhook's configured owner | Same | The external payload is untrusted content, never an instruction channel for authority. |
| AI CEO or AI lead autonomous cycle | The AI CEO's current sponsor | The Board member who last approved the CEO limit | Effective scope is at most the CEO limit. |
| Retry | Same as the original run | Same | Re-authorised against current grants. |

### 5.3 Effective scope and the narrowing rule

For any run, the effective scope is the intersection of:
- the acting agent's grants;
- the agent's limit, via allocation;
- the originator's grants (the person cannot extract through an agent anything they could not access themselves);
- the sponsor's limit;
- the task's or conversation's resource scope;
- the lane's limit;
- runtime pool and grade constraints;
- the model policy;
- the available budget.

Child runs are further restricted to the parent run's effective scope intersected with the child's delegation specification.

- **Invariant:** a child's effective scope is a subset of its parent's. It is enforced when the run is created and again when a runner claims it, because the parent's scope may have narrowed through revocation in the meantime.
- **Confused-deputy guard:** because the originator's grants are part of the intersection, a low-privilege person cannot use a high-privilege agent to read what they cannot read.
- **Stored snapshot:** the effective policy is stored as an immutable snapshot on the run, together with the grant ids it used. Tool and API calls are checked against the snapshot **and** against live grants. If either check fails, the call is denied.

### 5.4 Resources, inheritance and first-release scopes

**Grants target:** users, agents and teams.

**First-release grant scopes:**
- company;
- project;
- folder (restricted folders only; ordinary folders inherit from their project);
- conversation (channels and DMs);
- agent;
- connection;
- runner pool.

**Inheritance:**
- company → project → task → task documents, attachments and runs;
- project → folder → documents and assets;
- a project channel's default membership is the project's members;
- a private channel or DM has explicit members only.

**Restricted items:**
- A folder or channel marked **Restricted** breaks inheritance and needs explicit membership.
- Tasks cannot be restricted individually in 1.0. Sensitive work goes into a restricted project or folder.
- Board break-glass access to restricted items is audited and notifies the item's lead.

**Deferred:** grants on individual tasks, documents, assets or runs.

### 5.5 Actions catalogue (excerpt; the full list is kept in code)

| Area | Actions |
|---|---|
| Resources | `view`, `list`, `search`, `create`, `edit`, `delete`, `download`, `export`. |
| Tasks | `assign`, `start`, `stop`, `retry`, `review`, `accept`, `request-changes`. |
| Agents | `view`, `message`, `assign-work`, `invoke`, `review-work`, `configure`, `grant-credential`, `set-budget`. |
| Runners and pools | `register`, `inspect`, `share`, `assign`, `execute`. |
| Access | `grant`, `revoke`, `request-access`, `approve-access`. |
| Governance | `board-*` actions. |

Every route, event and tool declares the action and resource it needs.

### 5.6 Access presets

- **Project-restricted.** This is the default for new Crewspan companies. Members see only projects they are granted.
- **Open team.** This can be chosen when a company is created, and is labelled "Everyone in the company can see all projects except restricted folders and private conversations". It is implemented as a company-wide member grant to projects, so it can later be narrowed without data changes.
- Migrated Paperclip companies start in **Open team** (§5.10).
- The effective-access panel (§12.3) explains the result of any preset, so people never have to reason about the raw grant matrix.

### 5.7 Enforcement architecture

1. **Permission service.** A decision takes a principal, action, resource, company and context (including the run snapshot). It returns allow or deny with a machine-readable reason and the grant ids used. Effective memberships are precomputed into `cs_effective_access` rows, updated in the same transaction as grant changes, so list queries can join against them efficiently.
2. **Route guard.** Every route declares `{action, resourceResolver}`. CI fails if any route has no declaration. At runtime, an undeclared route denies every non-Board principal. **This also makes new upstream routes fail closed after a sync until someone reviews them.**
3. **Scoped query layer.** For Crewspan-protected tables, the scoped query helpers are the only allowed access path, and a lint rule blocks direct table access outside them. Counts and aggregates use the same helpers, so a count never includes a hidden row.
4. **Response semantics.**
   - If the principal cannot see a resource: **404**, with no title or name.
   - If the resource is visible but the action is not permitted: **403**, with an action code and the request-access path.
5. **Realtime.** Events carry ids and types by default. Clients refetch through authorised APIs. Chat message bodies are included only after an authorisation check per recipient when the event is fanned out. On reconnect, clients requery; a WebSocket message is a hint, not the source of truth.
6. **Search and autocomplete.** Permission pre-filtering in SQL, never after ranking.
7. **Files.** Download URLs are short-lived, signed and bound to the principal. Previews are generated from authorised reads only.
8. **Agent and tool calls.** A run's JWT resolves to the run's snapshot. Every Crewspan API or MCP call made by a run goes through the same service. Tokens are short-lived, revoked when the run ends, and stripped from logs, artifacts and child-process environments.
9. **Defence in depth (Choice, M2 stretch):** PostgreSQL row-level security on `cs_*` content tables, keyed by a per-request setting.

### 5.8 Revocation semantics

When a grant is revoked or expires:
- **New operations** are denied immediately for every principal: API reads, downloads, search, subscriptions, tool calls, claims and new runs.
- **Queued runs** whose snapshot uses the grant move to `Revoked` before they can be claimed.
- **Active runs** whose snapshot uses the grant are killed with no grace period for new work. Their sandbox inputs are destroyed with the sandbox, the run becomes `Revoked`, and any outputs are **quarantined** as "produced under revoked access" until a human with current access reviews them.
- **Session state** scoped to the revoked resource is deleted (§6.9).
- **Disclosure record.** Revocation cannot recall information already sent to a provider, written into an output, or read by a person. The run's disclosure record shows what was sent and where. The UI says this plainly.

### 5.9 Access request flow

`Draft → Submitted → (Needs info ↔ Submitted) → Approved → Active grant (→ Expired | Revoked) | Rejected | Withdrawn`

- **Where requests start:** at the point of denial, e.g. "Request access to Research folder" or "Request use of GPT model via Team Connection" **[M0: connection naming]**.
- **What a request records:** the requested scope, action set, reason, duration (a default expiry is offered) and the computed approver (§4.8).
- **Review:** the reviewer sees **what becomes visible or executable**: counts of folders, documents, agents, models and budget. They may narrow the request before approving.
- **Agents** may *propose* requests, which are routed to the steward. No agent approves an access request.
- **History** is retained after revocation.

### 5.10 Migration from Paperclip's open visibility

1. **Import:**
   - each Paperclip company gets the **Open team** preset;
   - existing members get grants equivalent to today's company-wide visibility;
   - existing agents get project grants matching today's reach;
   - org nodes are created for agents (keeping the existing tree) and for human members (unassigned until placed).
2. **Nothing becomes hidden** until an Admin or Board member changes a project or folder to restricted.
3. **Restriction wizard:** proposes per-person and per-agent project grants from activity history. It shows before and after effective access, and applies changes in one audited transaction.
4. **Invitations:** until the company has reviewed its access policy, the UI blocks inviting Guests or restricted members (as V1 required).
5. **Evidence:** migration tests are run on a copy of a real Paperclip install, and the upgrade drill is part of Alpha 2.

### 5.11 Leak-test strategy

- **Fixture company:** projects A and B; restricted folder R in A; private channel P; users (Board, Manager-A, Member-A, Guest-R, Outsider); agents (Agent-A, Agent-AB allocated to both, Agent-B).
- **Canaries:** unique strings are planted in every A, B, R and P resource, and in run environments, host files and connection secrets.
- **Generated negative tests:** for every entry in the route manifest, each denied principal gets 404/403 with no canary. Counts and totals are equal to the empty baseline. Timing differences are logged, though not gated in 1.0.
- **Channel scans:** WebSocket frames, notifications, Inbox payloads, search and autocomplete results, exports, logs, agent context bundles and run transcripts are all scanned for canaries after every scenario.
- **Enumeration:** randomised id-guessing across resources.
- **Run-token tests:** Agent-AB running for A cannot fetch B or R through the API, MCP or search. Expired and cross-run JWTs are rejected.
- **Revocation tests:** covering queued and active runs, with quarantine checks.
- **Upstream sync gate:** new routes arrive undeclared and fail closed. CI lists them for review.

### 5.12 Audit

The audit log is append-only. It records:
- grants, revocations, expiries, break-glass use;
- denials on sensitive actions;
- configuration and limit changes, approvals, credential issuance to runs;
- dispatches, claims, stops, revocations and quarantines;
- compatibility overrides, compliance access, offboarding steps, ownership transfers.

It is stored in the database with a hash chain for tamper evidence (Choice) and exported in backups. It is visible in Activity with filters, and only to principals who can see the underlying resource.

---

## 6. Projects, resources, files and context

### 6.1 Projects

A project has a lead (human or agent), contributors, a funding budget, a sign-off policy and a resource set. Projects may have **no repository**. Repository-backed projects may link several repositories. Paperclip's agent project lead is kept, and a human project lead is added **[M0: current lead model]**.

### 6.2 Resource model (`cs_project_resource`)

Each resource records:
- `kind`: git repository | managed folder | external link | tool/MCP server;
- `owning_project_id`;
- `allowed_runner_pools`;
- `write_mode`: read-only | branch-push via the broker | pull-request via connection;
- `default_base_ref` and `allowed_ref_patterns` (for repositories);
- `credential_connection_id` (git host);
- `retention` for execution files.

A run shows its **input manifest**: repository base commits, managed file versions, skill versions and instruction versions, each with a content hash.

### 6.3 Three kinds of file

| Kind | Stored where | Shown as | Counts as a deliverable? |
|---|---|---|---|
| **Managed files** | Crewspan storage (Paperclip attachment/Artifacts storage **[M0]**), versioned | Files area | ✓ |
| **Repository files** | The git host and per-run clones | A repository link, branch or PR | ✓, as a branch or PR ref with a base commit |
| **Execution files** | The run workspace; deleted when the sandbox ends unless published or retained | Run detail | ✗ until published |

A result submitted for review must reference a managed version or a repository ref. A local path never counts as delivery.

### 6.4 Folders, documents, assets and versions

- **Structure:** a folder tree for each project, plus a **Company shared** area for templates and approved common knowledge, with read-mostly grants.
- **Documents:** Markdown, reusing Paperclip's issue-document editor and storage **[M0]**. Versions are immutable. Editing is protected by a version check (an edit fails if the document changed since it was opened, with a diff offered). There is no real-time co-editing in 1.0.
- **Assets:** binary uploads. Previews in 1.0 cover images, PDF, Markdown and text. Office formats are download-only.
- **Links:** documents and assets link to tasks, runs, conversations and decisions.
- **Publishing:** a run may publish an execution file as a new managed version, which requires `create/edit` on the target folder under the run's effective scope.

### 6.5 Indexing and search

- PostgreSQL full-text search over task titles and bodies, documents, messages and file names, with text extracted from supported formats.
- The permission pre-filter joins `cs_effective_access` (§5.7).
- New searches exclude revoked or deleted material as soon as the access change commits. PostgreSQL index rows are updated in that transaction where possible; derived caches are invalidated before reuse. Agent-visible caches are keyed by snapshot and never reused across snapshots. Historical context-bundle records remain as disclosure evidence and are never silently rewritten.
- Semantic retrieval is deferred (§2.5).

### 6.6 Context assembly and provenance

Each attempt gets a **context bundle** record listing every item that was provided:
- the source id and version;
- a hash;
- the reason it was included: brief, attached, retrieved, skill, agent instructions, conversation excerpt, or parent result;
- a trust label: **instruction**, which is only the task brief, acceptance criteria and approved skills or instructions; or **content**, which is everything else, including messages, documents, web pages and child outputs;
- its size.

Bundles are assembled only from inside the effective scope. Organisation, team and project "background" context is included only from material within that scope; nothing company-wide is injected blindly. Agents can request more material with tool calls such as search and read, and each call is authorised and logged in the bundle.

### 6.7 Why assigning a folder is not a context limit

Assigning a folder defines **what an agent may access**. It does not define **what is placed in the model's context**. A 2 GB folder can be in scope while the run's context holds only the brief, attached items and a few retrieved passages chosen within a size budget per lane. Size is controlled by the lane's context budget and the retrieval ranking. Permission is controlled by grants. The two are never conflated, and nothing is automatically "included because it is in the folder".

### 6.8 Restricted material

- Restricted folders are excluded from bundles, search and project-level summaries for principals without access.
- Summaries and dashboards computed over mixed material are generated only from what the viewer can see, or they state that part of the content is hidden. They never paraphrase restricted content.
- A skill or instruction bound to a restricted project cannot be attached to an agent that lacks access to that project.

### 6.9 Partitioning sessions and memory

- CLI session state and any agent memory are keyed as follows:
  - by **(agent, project)** by default;
  - by **(agent, restricted folder)** when a run touches a restricted folder;
  - by **(agent, conversation)** for DMs and private channels.
- A session is never resumed across keys.
- Session state lives in runner-owned storage per key and is mounted only into sandboxes with the same key. It is deleted when the key's grant is revoked or the agent retires.
- Agent-level instructions must not contain project material. The editor warns when it detects content copied from a scoped resource.
- Inherited agent-memory features **[M0]** are disabled or re-scoped to these keys.

### 6.10 Upload safety

- Type and size limits; content-type sniffing; sanitised previews (no active content); no symlinks or special files accepted into managed storage.
- Optional ClamAV scanning. If scanning is disabled, files show "Not scanned" and the setup report says so.

---

## 7. Work model: task, run and attempt; trigger matrix

### 7.1 Records

| Record | Purpose |
|---|---|
| **Task** | Accountable work with an owner, reviewer, acceptance criteria and sign-off policy. Maps onto Paperclip issues **[M0]**. |
| **Interaction** | Agent work started from a conversation with no task: DMs and channel "Ask" requests. It has a requester, agent, conversation, runs, cost and status (open, answered, converted). |
| **Run** | One requested execution of an agent, for a task or an interaction, with an immutable effective-policy snapshot. |
| **Attempt** | One infrastructure execution of a run on a claimed runner. A run has one or more attempts. |
| **Dispatch** | The authorisation decision that created a run, with its preview payload. |

**Invariant:** every run belongs to exactly one task **or** one interaction. No run exists without one.

### 7.2 Task state machine

The canonical states below are mapped to Paperclip issue statuses **[M0]**. Extra sub-states live in `cs_task_state`.

| State | Meaning | Entered by |
|---|---|---|
| Draft | Created, not ready | The creator |
| Open | Ready, with or without an owner; no active work | Owner, lead, or conversion to task |
| In progress | The owner is working, or at least one task run is active | Start run, or a human owner marks it |
| Awaiting review | A result was submitted and a reviewer is set | A run succeeds with a deliverable, or a human submits |
| Changes requested | The reviewer returned it with feedback | The reviewer |
| Accepted | The result was accepted by an authorised principal | The reviewer or sign-off principal |
| Cancelled | Abandoned | Owner, lead or Board |

Flags that sit alongside the state:
- **Blocked**, with a reason;
- **Paused**, for budget, approval, revocation or waiting for a runtime;
- **Sign-off required**, where the default for top-level tasks is on and set per project.

Rules:
- A successful run never moves a task to Accepted. Only review does.
- Reopening an Accepted task is audited.
- A change of owner is not a change of state.

### 7.3 Run state machine

`Requested → Authorising → {Denied | Awaiting approval | Queued}`

- `Awaiting approval → {Queued | Rejected}`
- `Queued` (including the sub-state *waiting for runtime*) `→ {Claimed | Expired | Revoked | Cancelled}`
- `Claimed → Running`
- `Running ↔ Recovering`: an attempt was lost and a new attempt is pending, per the retry policy.
- `Running → {Succeeded | Failed | Stopped | Revoked | Budget-stopped | Timed-out}`
- `Failed → Queued` only through a manual **Retry**, which re-authorises and adds a new attempt to the same run.

Terminal states are: Succeeded, Failed (with no retry pending), Stopped, Revoked, Budget-stopped, Timed-out, Denied, Rejected, Expired and Cancelled. A reviewer's "Changes requested" creates a **new run** on the task, carrying the feedback. Runs are never rewritten.

### 7.4 Attempt state machine

`Leased → Provisioning → Executing → Finalising → {Completed | Errored | Lost | Killed}`

- Each run has at most one non-terminal attempt, enforced by a unique constraint.
- Leases have a TTL renewed by heartbeat. Writes carrying a stale lease are rejected.
- **Lost** means the lease expired. The supervisor kills any matching sandbox when it reconnects.
- **Automatic retries** happen only for infrastructure failures (a provisioning error or a lost attempt), with a default maximum of 2. Model or tool failures do not retry automatically unless the lane allows it.
- A new attempt may resume the CLI session only under the same session key (§6.9).

### 7.5 Trigger matrix

| # | Trigger | Creates | Changes owner? | Starts a run? | Preview required? | Originator / sponsor | Charged to | Checked authority |
|---|---|---|---|---|---|---|---|---|
| 1 | **Assign** (Crewspan setting "Assign does not start") | Nothing new | Yes | No | No | — | — | `assign` on the task; the assignee must hold project access |
| 2 | **Assign and start** | Run | Yes | Yes | Yes | The assigner | The task's project budget and the agent's cap | `assign` + `invoke` + effective scope |
| 3 | **Start run** on a task | Run | No | Yes | Yes | The starter | Project budget and agent cap | `start` + `invoke` |
| 4 | Human **@agent in a task comment** | Run on the task (consult) | No | Yes | Yes (composer) | The author | Project budget and agent cap | `invoke` + task visibility |
| 5 | Human **@agent in a channel** ("Ask", the default) | Interaction and run | — | Yes | Yes (composer) | The author | The channel's project budget if it is a project channel, otherwise the author's allowance under the agent's allocation | `message` + `invoke` + conversation scope |
| 5b | Human @agent in a channel, **"Create task"** option | Task, and a run if Start is chosen | Owner as chosen | Optional | Yes | The author | Project budget | `create` + optional `invoke` |
| 6 | **DM message** to an agent | An interaction (one per DM thread), plus one run per human message | — | Yes | Banner when the DM opens, showing provider, data class, limit and allowance; per-message preview only when the estimate exceeds the allowance threshold | The author | The author's allowance under the agent's allocation | `message` + `invoke` + DM scope |
| 7 | **Turn into task** (from a message or interaction) | Task; the interaction's runs are linked for cost | Owner as chosen | No, unless Start | Yes if started | The converter | Project budget from then on | `create` in the target project |
| 8 | **Routine occurrence** (inherited, "create task") | Task per occurrence | Assignee as configured | As configured | At creation and each re-approval, not per occurrence | The routine owner | The routine's budget | Re-evaluated every occurrence; the routine pauses on failure or loss of access |
| 9 | **Child delegation by an AI lead** | Child task, plus a run if the member is an agent and auto-start is inside the limit | Child owner = chosen member | Agents: yes, within the limit; humans: no (assignment only) | No human preview inside the pre-approved delegation limit; otherwise an approval | The parent's originator / parent's sponsor | Sub-allocation from the parent task budget | `delegate`, the narrowing check, and caps (§8.6) |
| 10 | **Child delegation by a human lead** | Same | Same | Optional | Yes | The lead | Parent sub-allocation | Same |
| 11 | **Heartbeat or wake** (inherited) | Run on the assigned task, or a heartbeat interaction | No | Yes | No (governed by a schedule the sponsor approved) | The agent's sponsor | Agent budget, then the task's project budget | Current grants, agent limit |
| 12 | **Leader re-wake** when children complete | Run on the parent task | No | Yes (debounced per batch) | No | Parent originator / sponsor | Parent task budget | Re-wake cap (§8.6) |
| 13 | Agent-authored **@agent** in any message | Nothing; rendered as a plain reference | — | **No** | — | — | — | Loop guard; agents must use the delegation API |
| 14 | Agent-authored **@human** | An Inbox item | — | No | — | — | — | The human must be able to see the conversation |
| 15 | **Retry** (manual) | New attempt on the same run | No | Yes | Only if the effective policy changed | The original originator | Same funding | Re-authorisation; can only narrow |
| 16 | **Webhook** (1.x) | Task or interaction, per configuration | As configured | As configured | At configuration | The webhook owner | The routine's budget | Idempotency key, payload limits; the payload is untrusted content |

Every trigger carries an **idempotency key**: message id plus agent id, routine occurrence id, dispatch id, webhook delivery id, or client request id. A unique constraint guarantees one dispatch per key.

### 7.6 When a preview is required

A preview (§12.3) is required whenever a human action starts a run. It is not required for:
- work that runs inside an approved automation limit (routines, heartbeats, AI-lead delegation within limits). That limit was itself previewed and approved, and each run still records its snapshot;
- DMs below the allowance threshold, which show a standing banner instead.

If a dispatch falls outside any applicable limit, the result is **Awaiting approval** with a precise request, never a silent downgrade.

### 7.7 Stop, cancel, revoke and reassign

- **Stop:** a human with `stop` rights; the default grace period is 30 s. Outputs are kept and flagged "incomplete".
- **Cancel:** for queued runs.
- **Revoke:** §5.8; there is no grace period.
- **Budget-stop:** at the cap, the run gets a 10 s grace period to upload what it has. Gateway-enforced runs stop at the gateway (§10.9).
- **Reassigning a task with an active run** opens a dialog:
  - **Stop current run**, the default when the new assignee is a different agent;
  - **Let it finish, with the result going to the new owner for review**, the default when only the human owner changes.
  - The dialog states the cost already spent and the estimated remaining cost.

### 7.8 Compatibility with Paperclip's assignment behaviour

If S7 confirms that Paperclip's assignment wakes agents **[M0]**:
- A per-company setting, **Assign does not start**, is on by default for new Crewspan companies and off for migrated companies until an Admin turns it on.
- The inherited API keeps its semantics when the setting is off.
- The new `assign` and `start` operations (§13.4) are always explicit.

### 7.9 Idempotency and cost honesty

- Duplicate message delivery, retries on reconnect, or double clicks cannot create duplicate runs.
- Retries can cost money. Every attempt's usage is attributed to the same run and shown per attempt.
- A run's total includes failed attempts.

---

## 8. Delegation and teams

### 8.1 Delegation record

A parent task links to child tasks. Each child has:
- a brief and acceptance criteria;
- permitted inputs, which must lie inside the parent's scope;
- a member: an agent, a human, or a lane that resolves to an agent;
- a run policy: auto-start or not; model and effort within the limit;
- the expected deliverable type;
- a reviewer;
- a review policy;
- a budget sub-allocation;
- a deadline hint.

### 8.2 Delivery teams

A team has a lead (human or AI) and a roster of human and agent members with role descriptions. Team membership never grants access. Every member still needs the relevant grants, and child scope still narrows.

### 8.3 Flow

1. A parent task is assigned to the team lead.
2. **The lead plans.** An AI lead's coordination run produces child tasks through the delegation API and then **ends**; it does not wait inside the model. A human lead creates children in the UI.
3. **Children run.** Agent members' runs are dispatched inside the limit. Human members receive Inbox assignments.
4. **Children report.** Each child submits a result record (§8.4) and is reviewed according to its policy.
5. **Re-wake.** When a batch of children reaches review or terminal states, an AI lead is re-woken, debounced to at most once per batch, within the caps. It integrates the results, requests changes, or creates follow-up children.
6. **Sign-off.** The lead submits the parent result. A top-level task that requires sign-off goes to the designated human.

### 8.4 Evidence and independent review

**Result record:**
- a summary;
- deliverables: managed versions and repository refs with base commits;
- verification evidence: tests run with their output, sources cited with links, checks performed;
- known issues;
- the input manifest;
- cost, with its label.

**Review policies:**
- **human review**;
- **AI review permitted**: the reviewer must be a different agent from the author. Optionally, a different model or provider can be required;
- **lead acceptance permitted**.

The author can never accept their own work. An AI reviewer's decision on a child task is recorded as a review. Final acceptance of a top-level task that requires sign-off is always human.

### 8.5 Human sign-off

The sign-off screen shows:
- the parent result;
- the child tree with states and reviewers;
- the evidence;
- any quarantined outputs;
- total cost per accepted task, split into metered and estimated.

The choices are **Accept**, **Request changes** (which creates new runs with the feedback), or **Cancel**.

### 8.6 Loop and concurrency caps (defaults, bounded by limits)

| Cap | Default |
|---|---|
| Delegation depth | 3 |
| Children per parent | 10 |
| Runs per task | 20 |
| Leader re-wakes per parent | 10 |
| Concurrent runs per agent | 2 |
| Concurrent runs per project | Set by the limit |
| Concurrent runs per provider account | Set per connection |
| Repeated child briefs | A near-duplicate brief (hash) under the same parent is blocked after 2 occurrences |

When a cap is reached, the task is **paused**, with an Inbox item to the lead's human manager or sponsor.

### 8.7 Cost per accepted task, and comparison with direct execution

- **Cost per accepted task** is the sum over the parent's runs, all child runs, retries and review runs, plus linked interaction runs. It is shown metered, reported and estimated separately. Human time is excluded, unless people record it themselves (optional).
- **Comparison mode:** for a lane, the lead or Board can mark representative tasks to run directly and through delegation. The report compares cost, wall time, rework rounds and whether the result was accepted.
- Delegation is **never assumed to save tokens**. A lane whose measured outcome is worse is flagged. There is no automatic promotion or demotion in 1.0.

### 8.8 Lanes

A lane (for example research, writing, coding or review) defines:
- eligible agents or classes;
- a model and effort limit;
- a context budget;
- egress capabilities (for example, research includes web access only if granted);
- an optional AI review policy.

A lane always resolves to a specific authorised agent, and the run records it.

### 8.9 Skills and controlled learning

- **1.0:** inherited Paperclip skills **[M0]** are subject to the permission service. Each run records the effective skill versions (content hashes). Binding a restricted-project skill to an agent without access is rejected. Imported scripts run only inside the sandbox.
- **1.x:** a skill review workflow (owner, provenance, approval state), then an opt-in improvement loop. After an accepted result, a proposal is made as a diff with sources, a privacy check, affected agents and prompt-cost estimate, and a human steward approves it. Historical runs never change. Crewspan does not claim this as an existing feature of any competitor.

---

## 9. Runtime and isolation reference architecture (single Linux VPS)

### 9.1 What Paperclip already documents versus new work

| Capability | Paperclip status | Crewspan work |
|---|---|---|
| Run- and agent-scoped short-lived JWTs | Documented **[V 2026-09-24]** | Audit claims, TTL and end-of-run revocation. Bind to the effective-policy snapshot. Re-check on every call. |
| Bubblewrap filesystem scope | Documented, optional, off by default **[V 2026-09-24]** | Evaluate in S3 as the "Contained (namespaces)" mechanism, or replace it with rootless Podman. Make containment mandatory and fail-closed. |
| Hostname-allowlist egress proxy | Documented, optional, off by default **[V 2026-09-24]** | Extend to per-run capability sets, deny private ranges and metadata endpoints, resolve DNS only through the proxy, and log per run. |
| Execution workspaces and worktrees | Claimed in V1/V2 **[M0]** | Replace with per-run clones for any run in a sandbox. Worktrees are allowed only inside the private clone. |
| Adapters, including local CLIs | Claimed **[M0]** | Wrap them so they launch inside sandboxes under the runner supervisor. |
| Remote execution environments | Unknown **[M0]** | The runner protocol (§9.3) is built on whatever abstraction exists. |

### 9.2 Principles

1. The working directory is a starting location, not a security boundary.
2. Worktrees and branches isolate *edits*. The sandbox isolates *access*.
3. No isolation claim is made without a passing probe on the actual host.
4. Every failure fails closed: no silent fallback to uncontained execution, to another machine, or to a lower grade.
5. Long-lived secrets never enter a sandbox, unless the run is explicitly labelled "credential exposed" (subscription logins, §9.8).

### 9.3 Components and privilege boundaries

**Control plane (Docker Compose, network `cs-control`):**
- **web/API**, extended from Paperclip;
- **PostgreSQL**;
- the **model gateway**, a reverse proxy compatible with provider APIs (§10);
- the **secrets store**, Paperclip's secret handling **[M0]**, wrapped by a credential broker;
- optional **ClamAV**;
- a reverse proxy (Caddy or Traefik) with HTTPS.

**Runner host side (a systemd service running as the unprivileged user `crewspan-runner`):**
- The **runner supervisor**. It is not in Compose, has no access to the Docker socket, has no database credentials, and has no read access to control-plane volumes. It authenticates to the API with a runner token (rotatable, issued in setup by the Board).
- It launches sandboxes using **rootless Podman** (user namespaces, seccomp, cgroups v2 limits), optionally with the **gVisor** runtime where the host supports it, or using hardened Paperclip Bubblewrap if S3 shows equivalence.
- It owns a runner-local directory for repository mirrors and per-key session storage. Neither is ever mounted into sandboxes wholesale.
- It includes the **git broker** (§9.7) and a **per-run egress proxy** (§9.9).

**Per-run sandbox:**
- runs as a non-root user inside the sandbox; the root filesystem is a read-only pinned image with a digest;
- has a writable scratch workspace and the per-run clone(s);
- has read-only managed inputs;
- has only the session store matching its key;
- has no host home directory, no SSH keys, no sockets, and no `/proc` access to other runs;
- its only network route is to its egress proxy.

**Resulting boundary:** a compromised sandbox reaches only its own inputs and whatever its egress capabilities allow. A compromised supervisor reaches runner storage and short-lived per-run credentials, but not the database or long-lived provider keys. A compromised control plane can do everything. It is the trust root and is kept free of agent execution.

### 9.4 Runner protocol (company pool in 1.0; the same protocol later serves remote runners)

1. **Register:** the runner submits its token and a capability report (adapters and versions, sandbox mechanism, grade achieved by the self-probe, capacity).
2. **Heartbeat.**
3. **Claim:** a transactional `UPDATE … WHERE state='Queued' AND eligible` that returns a lease with a TTL.
4. **Fetch run spec:** the snapshot, input manifest, capability set, session key and a per-run JWT.
5. **Progress stream.**
6. **Upload outputs:** execution files and the bundle.
7. **Complete** or **fail**.

The server re-checks authorisation at claim time. Stale-lease writes are rejected. If the control plane restarts, active attempts continue, the supervisor buffers its uploads, and it reconciles by requerying.

### 9.5 Run provisioning sequence

1. Claim a lease.
2. Re-authorise the snapshot against live grants.
3. Create a scratch directory owned by a per-run subordinate UID.
4. Git broker: create per-run clones (§9.7).
5. Fetch managed inputs with the run JWT, verifying versions and hashes.
6. Mount the session store for the key, if any.
7. Start the egress proxy with the run's capability set.
8. Start the sandbox with cgroup limits (CPU, memory, pids, disk quota, wall time) and inject the run JWT and the gateway token as environment variables that are scrubbed from logs.
9. Run the adapter.
10. Finalise: collect outputs and the bundle, upload, destroy the sandbox, delete the scratch directory (or retain it if the run failed; see below), and revoke the tokens.

Retained failed workspaces are kept for at most 7 days (Choice) and at most 20 GB per pool. They are visible to principals with run access, and host paths are never shown in the UI.

### 9.6 Filesystem

**Mounts:** only the scratch directory, the clones, the read-only inputs and the matching session store. Symlinks in inputs are resolved and refused if they point outside the input root.

**Probes cover:**
- `/home`, `/root`, `/etc/shadow`;
- runner storage, the mirrors and neighbouring scratch directories;
- control-plane volumes;
- container sockets;
- `/proc` entries of other runs.

### 9.7 Git state

- **Mirrors:** the supervisor keeps a bare mirror per repository in runner storage. It is never mounted.
- **Per-run clone:** `git clone --no-local --single-branch --branch <base>` from the mirror, so only objects reachable from permitted refs are transferred, never hardlinked object stores. The clone is created in the run's scratch directory with neutral config, and hooks are disabled for host-side operations.
- **Several repositories:** each gets its own clone in the same sandbox, and each passes its own access check. Two projects that link the same repository share only the host-side mirror, never clones.
- **Linked worktrees are never shared across sandboxes**, because they share a common git directory **[V 2026-09-24]** ([git-worktree](https://git-scm.com/docs/git-worktree)). Agents may create worktrees inside their own private clone.
- **Returning results:** the agent commits on a run branch. At finalise, the supervisor asks the sandbox for a **git bundle** of the run branch relative to the base, then:
  - verifies the bundle in a fresh scratch repository on the host with `core.hooksPath` set to an empty directory, `protocol.file.allow=never` and no inherited config;
  - checks ref names against `allowed_ref_patterns` and refuses any change to protected branches;
  - fetches into the mirror under `refs/crewspan/runs/<run-id>`;
  - pushes to the remote only if the write mode allows, using a **short-lived, repository-scoped token** that the control plane mints per run (for example a git-host app installation token **[M0 per git host]**).
  - **Push credentials never enter the sandbox.**
- **Pull requests:** optionally opened through the git-host connection, as the Crewspan app identity, with the run link in the description.
- **Spike alternative:** S4 may choose an equivalently isolated design (for example a per-run bare repository served over a local protocol), provided sandboxes never share git directories, objects, config or refs, and host-side git never executes content controlled by a sandbox.
- **Shared-checkout mode** (editing an existing directory in place) is not available on company VPS pools. It is deferred to personal runners (§9.16).

### 9.8 Credentials

| Credential | Where it lives | Enters the sandbox? | Run label |
|---|---|---|---|
| Provider API keys | Secrets store, used by the model gateway | No; the sandbox gets a gateway token for that run | Gateway-enforced |
| Subscription logins (CLI OAuth) | Encrypted in the credential broker; belongs to a person, or explicitly shared (§10.6) | Yes, injected as a file for that run and deleted at the end | **Credential exposed to sandbox**; Advisory |
| Git host tokens | Minted per run by the control plane | No; the supervisor uses them host-side | — |
| Tool or MCP tokens | Per-run, scoped where the tool supports it; otherwise the connection token | Only if the tool runs in the sandbox; this is labelled | Listed in the preview |
| Crewspan API access | A per-run JWT | Yes, short-lived and bound to the snapshot | — |

Tokens are removed from logs, transcripts and artifacts by a redaction filter that knows the token values issued to each run. The redaction test is part of the probe suite.

### 9.9 Network egress and capabilities

- The sandbox's network namespace reaches only its egress proxy (for example via pasta/slirp4netns bound to the proxy). DNS is resolved by the proxy. There is no raw UDP.
- Always denied: private and link-local ranges, cloud metadata addresses, the host itself, and control-plane ports other than the gateway and API endpoints the proxy exposes.

**Capabilities that can be granted** (shown in the preview and recorded on the run):

| Capability | Scope | Default |
|---|---|---|
| `crewspan-api` | The Crewspan API through the proxy | Always |
| `model-gateway` | The Crewspan model gateway | Always |
| `package-registries` | A named allowlist (npm, PyPI, crates, etc.) | Coding lanes |
| `git-host-read` | Read-only fetches beyond the provisioned clone | Off |
| `web-research` | Public internet on HTTP(S) ports, excluding the denied ranges | **Off; must be explicitly granted.** Shown as a warning: "Can send data to any public website" |
| `custom:<name>` | An Admin-defined host list (MCP or tool endpoints) | Off |

Egress logs record hostname, bytes and time per run, without request bodies. Limitation: the proxy cannot restrict HTTP methods or payloads inside TLS without intercepting traffic, which Crewspan does not do in 1.0.

### 9.10 Short-lived API tokens

Reuse Paperclip's run JWT **[V 2026-09-24]**:
- Its claims include company, agent, run and snapshot id **[M0: current claim set]**.
- Its TTL is at most the run's wall-time limit plus 5 minutes.
- It is revoked on a terminal state through a denylist of JWT ids.
- Every use is authorised against the snapshot and live grants.

### 9.11 Failure and recovery

| Event | Behaviour |
|---|---|
| Runner offline | Runs stay Queued in *waiting for runtime*, with an Inbox notice to the sponsor after N minutes. Runs never move to another pool unless an eligible runner with the same or higher grade claims them. They never fall back to uncontained execution. |
| Lost lease | The attempt becomes Lost. An automatic retry happens if the policy allows. The supervisor kills the matching sandbox on reconnect. |
| Supervisor restart | Reconciles by listing its sandboxes, killing any without a live lease, and reporting. |
| Sandbox launch failure | The attempt Errors, fail-closed, with a setup-report link. |
| Isolation self-probe regression | The pool is marked Degraded and stops claiming. The Board is notified. |

### 9.12 Isolation grades

| Grade | Mechanism | Allowed for |
|---|---|---|
| **Contained (strong)** | A user-space kernel (gVisor) or micro-VM, plus all of §9.3–9.9 | Everything |
| **Contained (namespaces)** | Rootless user namespaces, seccomp and cgroups (Podman or hardened Bubblewrap), plus all of §9.3–9.9; shares the host kernel | Everything by default. Board limits may require "strong" for restricted projects. |
| **Uncontained** | Compatibility override | Owner-only, per pool, audited, shown on every run and in the header of every affected project, and excluded from criteria 2–3 |

Stable 1.0 requires at least **Contained (namespaces)** passing the full probe suite on the reference VPS.

### 9.13 Compatibility override

- It exists for installations that cannot run sandboxes.
- It requires the Owner, the two-person rule if enabled, and a typed acknowledgement.
- It applies to one named pool, is re-confirmed every 30 days, and is audited.
- The setup report stays red while it is active.

### 9.14 Probe suite

The probe suite runs:
- at setup;
- after every upgrade;
- nightly;
- on demand;
- in CI, on a VM matching the reference VPS.

It covers:
- **Filesystem:** the targets in §9.6.
- **Network:** Postgres port, host, metadata IP, RFC 1918 addresses, an ungranted internet host, DNS exfiltration via the proxy.
- **Credentials:** environment and filesystem scan for canary provider keys; reuse of another run's JWT or an expired JWT.
- **Git:** hook injection, malicious refs in a bundle, config injection.
- **API:** reading project B or folder R with the run JWT.
- **Session:** cross-scope recall of a canary.
- **Resources:** fork bomb, memory and disk fill contained without affecting the control plane.

The report is shown in Settings → Runners. Any failing probe blocks agent execution on that pool.

### 9.15 Remaining risks (published in the security model)

- A shared kernel, for the namespaces grade.
- Exfiltration through granted endpoints (web research, providers, registries).
- Prompt injection causing misuse of granted tools (§11.9).
- Subscription credentials exposed to sandboxes.
- The supply chain of agent CLIs and sandbox images, mitigated by pinned digests and weekly rebuilds.
- Full access by the host administrator or database administrator.
- Provider-side retention.
- Resource-exhaustion denial of service, limited by cgroups and caps.

### 9.16 Personal and remote runners (1.x, gated)

Personal and remote runners are enabled only after all of these pass:
- authenticated registration over the §9.4 protocol;
- owner consent for each machine;
- private by default, with sharing only by the owner;
- a capability and grade report, where a lower grade is labelled and cannot run restricted work;
- the revocation-of-share drill;
- offline and lost handling;
- directory linking with canonicalised paths, refusal of symlinks, system, home and root locations, and binding to an approved machine;
- the optional shared-checkout mode with owner consent;
- the probe suite adapted for the platform.

A run is pinned to its runtime unless a visible rescheduling decision shows equivalent policy, context and cost.

---

## 10. Provider, model, effort and budget policy

### 10.1 Connections

Connections stay the source of provider credentials, with ownership and grants **[M0: current model]**. Crewspan adds:
- `data_class`;
- `enforcement_class`;
- `cost_class`;
- a price table reference;
- a concurrency limit;
- `shareable`, for subscriptions.

### 10.2 Policy resolution

The allowed (connection, model, effort) options for a run are the intersection of:
- the Board limit;
- the team limit;
- the agent limit;
- the lane;
- the originator's model grants;
- the connection grants;
- the data-class requirement of the resources in scope.

Fallback happens only within this intersection. If the intersection is empty, the run is **Awaiting approval**, with a "Request model access" action.

### 10.3 Enforcement classes

| Class | How it works | What is enforced | Cost label |
|---|---|---|---|
| **Gateway-enforced** | The adapter's base URL points at the Crewspan model gateway (S5). The gateway holds the key, checks the model allowlist, applies output and token caps, applies the per-run spend cap, and meters usage. | Model, token caps, spend stop mid-run | **Metered** (token counts × the admin-maintained, dated price table) |
| **Adapter-enforced** | A CLI flag or config sets the model and effort. | The model requested by the main process. Sub-calls may escape. | **Reported** (by the CLI), otherwise estimated |
| **Advisory** | Subscription logins, or adapters without controllable settings. | Nothing technically. The request is logged, and usage is checked between attempts. | **Estimated** |

The preview and run detail always show the class. Board limits can require the gateway-enforced class for restricted projects.

### 10.4 Effort mapping

Crewspan uses four effort levels: **Low / Standard / High / Max**. M0 fills in a per-adapter mapping table to the concrete parameter (reasoning-effort setting, thinking budget, CLI flag) **[M0]**. Where an adapter has no equivalent, the level is marked "not controllable" and the run is advisory for effort.

### 10.5 Metered versus estimated

- Dashboards always separate **metered**, **reported** and **estimated** amounts.
- Budgets count all three. Hard stops can only be guaranteed for metered usage.
- Prices are admin-maintained, with an effective date. Crewspan never claims provider invoices will match its figures exactly.

### 10.6 Subscriptions

- A subscription login belongs to its human owner, who can use it for agents they steward.
- Sharing it with a pool or other people requires the owner to attest that the provider's terms allow it. Crewspan records the attestation and does not interpret the terms (external verification).
- Runs using a subscription show "Uses Alice's subscription · Credential exposed to sandbox · Advisory".

### 10.7 Data-handling classes

Each connection is tagged by an Admin. For example:
- `standard`;
- `no-training`;
- `zero-retention`;
- `region:<x>`;
- `self-hosted-model`.

These tags are self-declared records, not verified by Crewspan. Projects and folders can require a minimum class. Fallback and routing may move only to a connection of the **same or stricter** class. Conversation headers disclose the class (§11.5).

### 10.8 Fallback, routing and external routers

- Fallback follows an ordered list inside the intersection, with every hop recorded on the attempt.
- **9Router, OmniRoute and similar routers** may be configured as a connection, or as the upstream of the gateway. They are treated as **untrusted data processors**:
  - their data class must be declared;
  - model routing inside them is invisible, so a router connection is **advisory for routing** unless it is pinned to one model;
  - Crewspan records the model the response actually reports;
  - Crewspan remains the authority for policy and accounting.

### 10.9 Budgets

- **Hierarchy:** company (Board) → teams → projects; agent caps; task caps; run caps.
- A run charges one **funding budget** (§7.5) and also counts against the agent's cap. Both need headroom.
- **Reservation:** at dispatch, the run cap is reserved from the funding budget and the agent cap, and released as usage is recorded.
- **Hard stop:** gateway-enforced runs are stopped by the gateway at the cap. Other runs are checked at heartbeats and between attempts. Overruns are possible and shown.
- **Budget incidents** create Inbox items for budget owners. Increases go through approval (§4.8) and are never automatic.
- **Visibility:** people see costs for resources they can see. Budget holders see totals that include restricted work as a single "Restricted work" line with no names.

---

## 11. Communication, Inbox, privacy and notifications

### 11.1 Conversation types (1.0)

- **Project channels.** Membership defaults to project members. A channel can be marked restricted.
- **Team channels.**
- **Private channels.** Explicit members.
- **DMs:**
  - human↔human;
  - human↔agent, where the agent must be allocated to the human, or granted `message` to them.
- **Task threads.** Paperclip's existing task comments **[M0]**, unified into the same message component where practical, without creating a second task database.
- **One-level reply threads** on channel messages.
- **Attachments and links** to tasks, files, runs and decisions, each rendered only if the viewer can see the target.

Agent↔agent DMs are deferred. Agents coordinate through tasks and delegation.

### 11.2 How agents participate

- Agents join channels by membership, following the same rules as people.
- Agents **do not read channels continuously**. They read only when invoked. The context is the invoking message, plus the thread, plus the last N messages (defined by the lane) that are within scope.
- Agent posts are labelled with the agent marker and link to the run that produced them.

### 11.3 Mentions

- The composer previews mentions: "@Analyst will run on *Q3 pricing* (chat request) · Uses Team OpenAI · Standard effort · est. £0.20–£0.60 · Charged to Growth project". It offers **Ask** or **Create task**.
- Only **human-authored** mentions trigger runs. Agent-authored agent mentions render as references (trigger #13).
- If the mention is denied, the composer shows the available action ("Request access to @Analyst") without revealing the agent's configuration.
- Message text never authorises governed actions (deployment, purchase, credential use, grants, budget). These always need a structured approval.

### 11.4 DMs and privacy

- **Default: DMs are private.** Only participants can read them in the product.
- **Compliance access** is an optional company policy set by the Board (two-person rule if enabled):
  - it is displayed to every user in each DM header;
  - it applies only to messages sent after it is enabled;
  - each access is audited;
  - access happens through a Board-only export, never browsing.
- **Retention:** company-configurable, including a delete-after period.
- **Deleting a message** removes it from the UI, search and future context. If the message was already sent to a provider in a run, the run's disclosure record says so.
- **Honesty statement** in Settings and the security model: "Administrators with server or database access can read all data. In-product privacy controls do not protect against the host administrator."
- **Human↔agent DM runs:** run *metadata* (status, cost) is visible to the agent's steward. Run *content* is visible to the participants, plus compliance access if enabled.

### 11.5 Provider disclosure

Any conversation with an agent member shows: "Messages sent to @Agent are processed by <connection> (<data class>)". This updates when a policy change affects it.

### 11.6 Converting to a task

**Turn into task** captures the message or interaction, the project, attachments, owner, reviewer and acceptance criteria. The interaction's runs and their cost are linked to the new task, and a link is posted back into the thread.

### 11.7 Actionable Inbox (evolved from "Mine" [M0])

**Sources:**
- assignments;
- mentions;
- review requests;
- approvals;
- access requests;
- agent questions (a run blocked on human input);
- run failures, revocations and quarantines;
- budget incidents;
- offboarding items;
- setup and isolation alerts (for Board members).

**Item model:** `(user, source_record, event_family)` is the deduplication key. The item has a **notification state** (unread, read, archived) and a **work state** derived live from the source record (unresolved, resolved).

- Archiving never resolves the work. Unresolved items still appear under "Needs action", even after they are archived.
- Filters: Needs action, Mentions, Reviews, Approvals, Runs, Budget.
- Every payload is authorised per recipient.

### 11.8 Notifications and loop guards

- **1.0 delivery:** in-app realtime plus browser notifications (installable web **[M0]**), with per-user preferences. Email and digest are deferred.
- **Outbox:** a transactional outbox guarantees that a saved decision always produces its notification.
- **Loop guards:**
  - agent messages never trigger agents;
  - per-conversation rate limits on agent posts (for example at most 5 per minute);
  - notification deduplication by event family;
  - delegation caps (§8.6).

### 11.9 Prompt-injection guards

These reduce the risk, but do not eliminate it:
- Context bundles label content as trusted instruction or untrusted content (§6.6). Adapters receive them in separate sections, with a standard preamble saying content cannot change authority.
- Authority is never taken from text. Every tool call, grant, spend or side effect is checked against the snapshot. Governed actions need structured human approval.
- The narrowing rule and the intersection with the originator's grants cap the damage an injected instruction can do.
- Web access is off by default. Egress is logged.
- Human mentions are the only chat trigger. Webhook payloads are untrusted content.
- Outputs from runs that ingested web or external content are flagged in review ("Processed external content").
- Red-team scenarios run in the M6 and M7 test matrices.

---

## 12. Paperclip-native UI/UX plan

### 12.1 Rules

- `DESIGN.md` **[M0]** is the source of truth. The screen priority it states ("what is happening, does it need me, what do I do about it" **[M0]**) orders every new screen.
- Crewspan reuses Paperclip's existing components (Button, Card, Badge, Table, forms, drawers, dialogs, status and empty states **[M0: names]**) before adding variants. It has no independent design system.
- New visual values go only into Paperclip's token source (`ui/src/index.css` **[M0]**).
- New UI code lives under `ui/src/crewspan/`, importing shared components. Edits to upstream screens are limited to mount points (§13.13).

### 12.2 Where each surface goes, and its Paperclip ancestor

Surface names are **[M0]**. Each ancestor is the screen whose layout, density and components the new surface must match.

| New or extended surface | Placement | Paperclip ancestor |
|---|---|---|
| **People** (humans and agents) | Company/org area, next to Agents | Agents list plus agent detail |
| **Org chart**, mixed and with a CEO badge | Extend the existing org view | Existing agent org chart |
| **Board & governance** (members, limits, two-person rule, compliance, overrides) | Company settings | Company settings |
| **Teams** | Org area tab | Agents list, projects list |
| **Effective access** tab | Person, agent and runner detail pages | Agent detail configuration panel |
| **Access requests** | Approvals area, as a request type | Approval detail |
| **Before you start** (dispatch preview) | A drawer or dialog from Start, Assign-and-start, the mention composer, and delegation | Approval card, new-task dialog |
| **Delegation tree** | Task detail, sub-task section | Sub-issue list |
| **Result and evidence card**, **Sign-off** | Task detail, above activity | Approval card, run summary |
| **Runs and attempts** with grade, model and cost labels | Task and run detail | Run history |
| **Chat** (channels, DMs, threads) | Top-level sidebar item near Inbox | Task comment thread plus Inbox list |
| **Inbox** | Evolve "Mine" | "Mine"/Inbox |
| **Files** | Project tab, plus Company shared | Artifacts view, issue documents |
| **Runners & isolation report** | Settings | Adapter/environment settings **[M0]** |
| **Model policy and data classes** | Connections settings | Connections |
| **Cost per accepted task**, metered and estimated split | Costs | Costs/budgets |
| **Offboarding report** | People detail | Approval detail |

### 12.3 Key screens

- **Task detail (the end-to-end operations view), in this order:**
  1. Header: title, state, owner (person or agent marker), reviewer, sign-off badge, cost total (with label split).
  2. Action bar: **Assign**, **Start run**, **Request review**, **Accept**, **Request changes**, **Stop current run**.
  3. Brief and acceptance criteria.
  4. Delegation tree: children with owner marker, state, reviewer, cost.
  5. Latest result and evidence card.
  6. Runs: state, attempts, isolation grade badge, model and enforcement badge, cost label.
  7. Activity and comments.

  Raw logs sit one click deeper, in run detail.
- **Before you start:** accountable owner; agent or team; originator and sponsor; inputs with versions; runner pool and grade; egress capabilities, with warnings for web access and exposed credentials; model and effort with enforcement class; estimate range, cap and "Charged to"; reviewer and sign-off.
  - Primary actions: **Start run**, **Assign only**, or, when outside limits, **Request approval**.
- **Effective access:** grouped by projects, folders, conversations, agents, models and connections, runner pools, budgets. Each row shows who granted it, when it expires, and a **Revoke** or **Request** action.
- **Access request review:** "Approving gives Dana: 1 folder (42 documents), invoke @Researcher, up to £30 per month on Team Anthropic, for 14 days". The reviewer can narrow it before approving.
- **Chat:** the Paperclip list/detail layout. A channel list in a secondary column, messages in the main area, the thread in a drawer. Task and approval links render as inline cards using Paperclip status badges. The composer shows the mention preview.
- **Runner report:** a probe table (pass or fail per probe with the last run time), pool grade and capacity.

### 12.4 Copy

- Use action-specific verbs:
  - "Assign to Research Agent"
  - "Start run"
  - "Request model access"
  - "Approve £20 increase"
  - "Stop current run"
  - "Turn into task"
- Say availability separately from permission: *Authorised*, *Online*, *Busy (2 queued)*, each with its own indicator, never a single green dot.
- Denials name the action and the next step without revealing hidden data. For example: "You can't start runs with this agent. Request access."

### 12.5 States

Every new surface implements these states using inherited patterns:
- loading;
- empty;
- error;
- denied (no leak);
- waiting for runtime;
- awaiting approval;
- paused (budget, cap, revocation);
- quarantined output;
- isolation degraded;
- advisory control.

### 12.6 Responsive design and accessibility

- Match Paperclip's responsive behaviour at 1440, 1024 and 390 px. Chat and Inbox must be fully usable at 390 px.
- Keyboard paths exist for assign, start, review, approve and compose.
- Screen-reader labels include person or agent type.
- Reduced motion; WCAG AA contrast using existing tokens.
- Gate: zero serious or critical axe violations on new screens.

### 12.7 Objective continuity gates (CI and release)

1. **Token lint:** no raw colours, spacing, font sizes or durations outside the token file.
2. **Component allowlist:** any new primitive component needs a Storybook story and design sign-off.
3. **Pixel stability:** Playwright screenshot diffs of inherited screens against the M0 baseline. Any difference fails unless the compatibility map lists it.
4. **Ancestor review:** each new screen has a recorded side-by-side check against its ancestor in light and dark themes at three widths. The checklist covers spacing scale, type ramp, status colours, table density (rows per viewport at least the ancestor's) and navigation behaviour.
5. **Terminology check** against the M0 term table.

---

## 13. Architecture, data, API, events, storage and operations

### 13.1 Repository boundaries

- The upstream monorepo stays the implementation home.
- Crewspan code lives in new packages:
  - `packages/crewspan-authz`
  - `crewspan-org`
  - `crewspan-work` (task, run and attempt machines; triggers; delegation)
  - `crewspan-policy` (models, budgets, limits)
  - `crewspan-files`
  - `crewspan-chat`
  - `crewspan-gateway`
  - `runner/` (supervisor and git broker, packaged as a separate binary and a systemd unit)
  - `ui/src/crewspan/`
- Upstream files are touched only for **thin hooks**: route-guard registration, query-helper substitution, event-emit wrappers, UI mount points and adapter launch indirection.
- The **upstream touch list** (files modified outside Crewspan directories) is tracked automatically and reported at every sync.

### 13.2 Data (additive)

- New tables are prefixed `cs_`:
  - organisation: `org_node`, `reporting_edge`, `team`, `team_member`, `appointment`, `board_member`;
  - authority: `allocation`, `envelope`, `grant`, `effective_access`, `access_request`;
  - work: `task_state`, `interaction`, `run_snapshot`, `attempt`, `dispatch`, `delegation`, `result`, `review`;
  - knowledge and runtime: `context_bundle`, `project_resource`, `folder`, `file_version`, `runner`, `runner_pool`, `lease`, `probe_result`;
  - models: `connection_policy`, `price_table`, `budget_reservation`;
  - communication: `conversation`, `conversation_member`, `message`, `mention`, `inbox_item`, `outbox`, `session_key`, `disclosure`;
  - records: `audit`.
- Upstream tables are never dropped, renamed or retyped. Crewspan data about an upstream row goes into a 1:1 side table keyed by the upstream id.

### 13.3 Migrations

- A **separate Crewspan migration stream** (its own folder and journal table) runs after upstream's migrations **[M0: Drizzle configuration supports this]**.
- Migrations are forward-only. **Rollback means restoring the automatic pre-upgrade backup.**
- Every migration has a test against a snapshot of the previous release, and against a real upgraded Paperclip database.

### 13.4 API

- Existing endpoints stay compatible; §7.8 describes the setting that changes assignment behaviour.
- New endpoints live under company-scoped paths, following the existing convention **[M0]**. Examples:

| Endpoint | Purpose |
|---|---|
| `…/org-nodes`, `…/teams`, `…/appointments`, `…/board` | Organisation and governance |
| `…/limits`, `…/grants`, `…/effective-access?principal=`, `…/access-requests` | Access and authority |
| `POST …/tasks/:id/assign`, `/start`, `/accept`, `/request-changes` | Explicit task operations |
| `POST …/runs/:id/stop`, `/retry` | Explicit run operations |
| `POST …/dispatch/preview` | Dry run that returns the effective policy and estimate |
| `…/delegations`, `…/interactions` | Delegation and chat requests |
| `…/projects/:id/resources`, `…/folders`, `…/files/:id/versions` | Project resources and files |
| `…/conversations`, `…/messages`, `…/inbox` | Communication |
| `…/runners`, `…/runner-pools`, `…/probe-results` | Runners and isolation |
| `…/connections/:id/policy`, `…/budgets` | Models and spend |

- Every operation has its own authorisation action and idempotency key (header).
- Error model: 404 for resources the caller cannot see; 403 with `action`, `reason_code` and `request_access` for visible but forbidden actions.

### 13.5 Events and realtime

- Every write records an activity or audit event and an outbox row in the same transaction.
- The outbox worker fans out authorised live events (ids and types; message bodies only after a per-recipient check).
- Clients requery on reconnect.
- Runners are woken by events, and polling closes any gaps.

### 13.6 Storage

- Paperclip local-disk storage for single hosts, and S3-compatible storage for larger ones **[M0]**.
- Managed files are content-addressed per version.
- Execution-file retention is configurable (default 7 days unless published).
- Session stores and mirrors live on runner storage, not in object storage.

### 13.7 Single-VPS deployment topology

- A Compose file for the control plane: web/API, PostgreSQL, gateway, optional ClamAV, reverse proxy.
- A systemd unit and installer for the runner supervisor, including rootless Podman setup and subordinate UID ranges.
- A **setup report** covering: migrations, storage, public URL, HTTPS, MFA for the Board, backup health, runner registration, sandbox grade, probe results, provider connections, and SMTP when email is added in 1.x.
- Authenticated deployment mode only **[M0: mode names]**. Single-user trusted modes are unsupported for multi-user companies.

### 13.8 Sizing and concurrency targets (to be validated in M3 and M7)

| Profile | VPS | Target load |
|---|---|---|
| Small | 4 vCPU, 16 GB RAM, 160 GB NVMe | 10 active users, 3 concurrent contained runs |
| Reference | 8 vCPU, 32 GB RAM, 320 GB NVMe, Linux with cgroups v2 and user namespaces | 25 active users, 8 concurrent contained runs, 2 GB of repositories, 20 GB of managed files |

Performance targets on the reference profile:
- Authorisation overhead: list endpoints at most 1.25× baseline latency at p95.
- A single permission check: 10 ms or less at p95.
- Chat fan-out to a 50-member channel: 1 s or less at p95.
- Warm run provisioning: 30 s or less, including clone and inputs.
- Probe suite: 10 minutes or less.
- Control plane stays responsive (API p95 under 500 ms) while 8 runs execute and one sandbox hits its memory limit.

### 13.9 Backups and key separation

- Nightly encrypted backups (for example restic or age) cover the database dump, managed files and runner metadata (not CLI session stores), and are sent off-host. A restore preserves chat transcripts and run records but ends active CLI sessions and visibly marks affected runs for recovery; the next message begins a new model session unless the operator separately restored an encrypted session-store backup.
- The **secrets master key and the backup encryption key are stored separately** from the backups. Setup produces a printed or offline recovery kit, and the Board confirms that it has been stored.
- The setup report warns if both keys are kept together.
- A monthly automated **restore drill** onto a scratch VM, and CI restore tests.
- An automatic pre-upgrade backup.

### 13.10 Upgrades and rollback

- Upgrade steps: pre-upgrade backup, migration dry run on a copy, apply, probe suite, smoke tests.
- Rollback means restoring the pre-upgrade backup and redeploying the previous images. This is documented and exercised.

### 13.11 Authentication

- MFA is required for Board members, and optional for other users (S8 **[M0]**).
- Re-authentication is required for Board-only actions.
- Session revocation on offboarding.
- SSO/OIDC and SCIM are deferred.

### 13.12 Observability

- Structured logs with secret redaction.
- Metrics: queue depth, claim latency, attempt outcomes, probe status, gateway usage, authorisation denials, outbox lag.
- Run timelines are shown in the UI.

### 13.13 Staying close to upstream

- **Upstream first.** Propose these hooks upstream:
  - the authorisation hook and route-declaration pattern;
  - the scoped query layer;
  - the adapter launch indirection (for sandboxes);
  - the run-policy snapshot hook;
  - the event fan-out filter.

  Where upstream accepts them, Crewspan drops its local patches.
- **If upstream ships an equivalent feature** (for example human org nodes or scoped visibility), Crewspan adopts upstream's schema and migrates its side tables within one release cycle.
- **Cadence:**
  - security fixes are assessed within 2 business days and released within 7 days;
  - stable releases are synced every 2–4 weeks on a staging branch, with an automated conflict report, compatibility tests, the leak suite, the probe suite and visual diffs.
- **Divergence budget:** track the number of files in the upstream touch list and the engineer-days per sync. If two consecutive syncs exceed 3 engineer-days, the next milestone includes refactoring hooks and reopening upstream proposals before new features.
- `UPSTREAM.md` records the pinned commit, the delta summary, open proposals and conflicts for each sync.

---

## 14. Milestones, gates, pilots and tests

Effort bands are in **engineer-weeks**, excluding design (about 0.5 FTE of design throughout) and external security review. They are for planning discussion only, and are re-estimated at the M0 gate. **Uncertainty:** L = ±25%, M = ±50%, H = could double.

**Dependencies:**
- M0 → M1.
- M1 → M2 and M3 (these run in parallel).
- M2 and M3 → **Private Alpha 1**.
- M2 → M5.
- M2 and M3 → M4.
- M4 and M5 → **Private Alpha 2**.
- M4 and M5 → M6 → **Public Preview**.
- M6 → M7 → **Stable 1.0**.

### M0: Verification and go/no-go (4–8, H)

- **Deliverables:** §3 inventories, spikes S1–S8, design baseline, term table, `UPSTREAM.md`, upstream proposals, trademark screen, threat model v1.
- **Exit:** the §3.5 decision is recorded, and the M1–M7 estimates are re-baselined.

### M1: Fork foundation and organisation (6–10, M)

- **Deliverables:** Crewspan package skeleton and migration stream; route-guard *report* mode (declarations collected, not yet enforced); org nodes, reporting edges, teams; Board members; CEO appointment and transition; limits (schema and validation); allocation and stewards; MFA for the Board; People and org chart UI; audit log.
- **Exit:**
  - 100% of routes declared (report mode);
  - reporting-cycle and single-CEO constraints enforced in the database;
  - human-CEO and AI-CEO appointment tests pass;
  - an upgraded Paperclip database keeps all agents and history;
  - pixel diffs of inherited screens are clean.

### M2: Scoped access (10–18, H)

- **Deliverables:** permission service and `effective_access`; route guard in *enforce* mode; scoped query layer; filtering of events, search, files and tokens; presets; effective-access UI; access requests with expiry; revocation semantics (§5.8) for API and data; migration and restriction wizard; leak-test suite (§5.11).
- **Exit:**
  - the leak suite finds zero canaries across all channels;
  - undeclared routes fail closed;
  - authorisation performance targets met (§13.8);
  - migration drill on a copy of a real Paperclip database passes.

### M3: Contained runner and model gateway (12–20, H)

- **Deliverables:** runner supervisor and protocol; rootless sandboxes; isolation grades; git broker with per-run clones and bundle return; credential broker; per-run egress proxy and capabilities; JWT audit and extension; session partitioning; model gateway for at least one provider; probe suite and setup report; failure and recovery handling.
- **Exit:**
  - the full probe suite passes on the reference VPS at the "namespaces" grade or better;
  - two projects, including one with two repositories, run concurrently with zero cross-project reads through filesystem, API, credentials or sessions;
  - Agent-AB cannot recall project A canaries while working in B;
  - the lost-runner drill produces no duplicate dispatch;
  - warm provisioning is 30 s or less.

**Private Alpha 1 gate** (internal team, after M2 and M3):
- the leak and probe suites are green;
- no open Critical security findings;
- backup and restore drill passes;
- inherited Paperclip task flows run inside contained runners.

### M4: Work model, delegation and governance (10–16, M)

- **Deliverables:** task, run and attempt machines; the trigger matrix for triggers 1–4 and 8–15; the "Assign does not start" setting; dispatch preview; delegation and teams; review policies and sign-off; caps; model policy resolver; enforcement and cost labels; effort mapping; data classes; budget reservations and hard stops; cost per accepted task; comparison mode; effective skill-version recording.
- **Exit:**
  - human-led and AI-led delegations each reach human sign-off, including one changes-requested round;
  - a forbidden fallback is blocked;
  - a data-class downgrade is blocked;
  - a gateway budget stop happens mid-run;
  - revoking a grant mid-run kills the run and quarantines its outputs;
  - duplicate-trigger tests produce exactly one run;
  - an AI lead cannot approve access or budget expansions (negative tests).

### M5: Files and knowledge (6–10, M)

- **Deliverables:** project and shared Files; folders and restricted folders; documents and assets with versions; previews; upload safety; permission-filtered full-text search; context bundles and provenance; publishing from runs; retention.
- **Exit:**
  - a document-only project completes W2 (§1.2) with a managed deliverable;
  - searches of restricted folders are leak-free;
  - every bundle lists sources and trust labels;
  - new searches and newly assembled context bundles exclude revoked material immediately; historical bundles remain as disclosure records, and active runs that used the grant are stopped and their outputs quarantined.

**Private Alpha 2 gate** (2–3 design-partner companies, after M4 and M5):
- the pilot (§2.3) completes W1–W3, W5 and W6 without chat;
- upgrade from Paperclip is tested at a partner or on a partner-shaped dataset;
- partner feedback is logged and triaged.

### M6: Communication and Inbox (10–16, M)

- **Deliverables:** channels (project, team, private); DMs (human↔human, human↔agent); one-level threads; mention preview and triggers 5–7; interactions; conversion to task; provider disclosure; DM privacy and the compliance policy; retention; Inbox deduplication and work state; browser notifications; outbox; loop guards; prompt-injection guards; chat search.
- **Exit:**
  - W4 completes;
  - loop tests (agent posts mentioning agents; notification storms) generate no runs and bounded notifications;
  - injection red-team scenarios cause no action outside the snapshot;
  - chat fan-out targets met;
  - Inbox deduplication tests pass.

**Public Preview gate:**
- the full core journey (§2.1) in both CEO variants on the reference VPS;
- all Critical and High tests green;
- limitations document and security model draft published;
- preview labelling in place;
- external security review scheduled.

### M7: Hardening → Stable 1.0 (8–14, M)

- **Deliverables:** independent security review of the permission service, runner and gateway, with fixes; performance and load at the sizing targets; accessibility and visual gates; restore drill; upgrade from Preview; offboarding flows complete; documentation (install, security model, limitations, upgrade, operations); reproducible demo company.
- **Stable 1.0 gate:**
  - no open Critical or High security findings;
  - all success criteria (§2.3) pass on the reference VPS;
  - someone outside the team installs Crewspan on a fresh VPS from the docs alone;
  - restore from backup with the separately stored key;
  - pixel-stable inherited screens;
  - accessibility gate;
  - leak and probe suites green for 14 consecutive nightly runs.

**Total indicative effort:** about 66–112 engineer-weeks plus design and review, to be re-baselined after M0.

### Pilot scenarios

| Id | Scenario |
|---|---|
| P1 | Full journey with a human CEO. |
| P2 | Full journey with an AI CEO routing to a human lead and an agent lead. |
| P3 | A multi-repository project with branch bundles and an independent AI reviewer, plus a human sign-off. |
| P4 | A document-only research project with web access granted. |
| P5 | A contractor with an expiring restricted-folder grant, followed by offboarding. |
| P6 | Upgrade of a real Paperclip install in the Open team preset, then restriction. |
| P7 | Security drills: disconnected runner, cancelled run, grant revoked mid-run, worktree or clone failure, restore from backup, subscription credential run labelled. |

### Test matrix

| Area | Key tests | First required at |
|---|---|---|
| Authorisation and leaks | Route manifest, canaries in every channel, enumeration, counts, run tokens | M2 / Alpha 1 |
| Isolation | Full probe suite, grade reporting, fail-closed launch, degraded pool | M3 / Alpha 1 |
| Git | Per-run clone refs, bundle validation, hook and config injection, protected branches | M3 |
| Sessions | Cross-scope recall, deletion on revocation | M3 |
| Credentials | No provider key in the sandbox (gateway class), redaction, JWT expiry and denylist | M3 |
| Egress | Denied ranges, capability grants, web-research warning, DNS | M3 |
| State machines | Every allowed and forbidden transition, stale lease, one active attempt | M4 |
| Triggers | Every matrix row, idempotency, "Assign does not start" setting | M4 / M6 |
| Authority | Narrowing, the AI-leader forbidden list, two-person rule, break-glass audit | M1 / M4 |
| Delegation | Caps, re-wake debounce, review independence, sign-off | M4 |
| Models and budget | Enforcement classes, fallback within class, reservations, hard stop, labels | M4 |
| Files | Versions, restricted search, publishing, upload safety, retention | M5 |
| Chat and Inbox | Membership, mentions, DM privacy, compliance disclosure, loop guards, injection red team, deduplication | M6 |
| Migration and upgrade | Paperclip import, restriction wizard, Preview→1.0 upgrade | M2 / M7 |
| Operations | Backup and restore with a separate key, pre-upgrade backup, setup report | Alpha 1 / M7 |
| UX | Token lint, pixel diffs, ancestor checklist, axe, keyboard, 390 px | Every milestone |
| Performance | §13.8 targets | M2 (authorisation), M3 (runs), M6 (chat), M7 (all) |
| Upstream sync | Rehearsal per sync, new routes fail closed, touch-list report | M0, then every sync |

---

## 15. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Trigger for action |
|---|---|---|---|---|---|
| R1 | The authorisation retrofit is larger than estimated | High | Critical | M0 inventory; route guard; scoped query layer; narrower first-release scopes | M2 re-estimate above 18 engineer-weeks |
| R2 | Upstream churn makes syncs expensive | High | High | Thin hooks; side tables; upstream-first; divergence budget | Two syncs over 3 engineer-days |
| R3 | Upstream ships conflicting org or permission features | Medium | High | Adopt upstream's schema; mapping migration | An upstream roadmap announcement |
| R4 | Required adapters cannot run in sandboxes on the target VPS | Medium | Critical | Grades; restrict supported adapters; stable needs at least one contained API-key adapter | S3 failure |
| R5 | Subscription CLIs cannot use the gateway | High | Medium | Advisory and credential-exposed labels; owner-only by default | S5 result |
| R6 | Kernel escape at the namespaces grade | Low | Critical | gVisor where available; kernel patch cadence; "strong" grade required for restricted projects | Host kernel CVE |
| R7 | Exfiltration via granted egress or web | Medium | High | Web access off by default; capability grants; egress logs; preview warnings | Egress anomaly |
| R8 | Prompt injection causes misuse of tools | Medium | High | §11.9 guards; snapshot enforcement; human approval for governed actions | Red-team finding |
| R9 | Chat scope grows | High | Medium | Fixed 1.0 chat specification (§11.1); non-goals (§2.4) | Scope requests during M6 |
| R10 | The permission UX overwhelms small teams | Medium | Medium | Presets; effective-access explanations; request-at-denial | Pilot confusion reports |
| R11 | Authorisation slows lists and search | Medium | Medium | Precomputed `effective_access`; performance gates | p95 above target |
| R12 | Cost figures are misread as invoices | Medium | Medium | Metered, reported and estimated labels; dated price tables | Partner confusion |
| R13 | VPS resources run out | Medium | Medium | cgroups; caps; sizing profiles; retention limits | Control-plane p95 degradation |
| R14 | Licence or trademark issues (Crewspan, Paperclip use, Multica) | Low | High | M0 screen; nominative wording; independent implementation | Screen result |
| R15 | Competitor claims go stale | High | Low | Dated comparisons; re-verify before publishing | Any public comparison |
| R16 | Leakage through sessions or memory | Medium | High | §6.9 partitioning; recall tests | Probe failure |
| R17 | Backup or secrets key lost | Low | Critical | Recovery kit; Board confirmation; restore drills | Drill failure |
| R18 | Upgrading a Paperclip install breaks existing use | Medium | High | Open team preset; setting for assignment behaviour; migration drills | P6 failure |
| R19 | Team capacity is below the estimate | High | High | Tiered gates; re-baseline at M0 and each alpha | Milestone overrun above 50% |
| R20 | DM privacy or compliance expectations differ by jurisdiction | Medium | Medium | Private by default; disclosed compliance mode; admin-access honesty statement; retention settings | Partner legal feedback |

---

## 16. Decisions and claims requiring verification

**Re-checked at M0 against the pinned commit** (sources as of 24 September 2026):

| Claim | Status | Source |
|---|---|---|
| Heartbeat agents receive run- and agent-scoped short-lived JWTs | [V 2026-09-24] | [Paperclip authentication](https://github.com/paperclipai/paperclip/blob/master/docs/api/authentication.md) |
| Bubblewrap filesystem scope and hostname-allowlist egress proxy exist, optional and off by default | [V 2026-09-24] | [Paperclip agent-run spec](https://github.com/paperclipai/paperclip/blob/master/doc/spec/agent-runs.md) |
| Company-wide visibility of work objects by default; scoped controls deferred | [V 2026-09-24] | [Paperclip implementation spec](https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md) |
| Linked worktrees share a common git directory | [V 2026-09-24] | [git-worktree](https://git-scm.com/docs/git-worktree) |
| Multica default runs inherit the daemon OS user's access; no default filesystem sandbox guarantee | [V 2026-09-24]; re-verify before marketing | [Multica security model](https://multica.ai/docs/security-model) |
| Multica uses a custom licence with additional conditions | [V 2026-09-24] | [Multica licence](https://github.com/multica-ai/multica/blob/main/LICENSE) |
| Latest stable Paperclip release is `v2026.916.1` | [M0] | [Paperclip releases](https://github.com/paperclipai/paperclip/releases) |
| Paperclip MIT licence text and attribution requirements at the pinned commit | [M0] | [Paperclip licence](https://github.com/paperclipai/paperclip/blob/master/LICENSE) |
| Connections separate credential ownership and grants from model selection | [M0] | [v2026.916.0 release](https://github.com/paperclipai/paperclip/releases/tag/v2026.916.0) |
| `DESIGN.md` priorities; tokens in `ui/src/index.css`; Storybook in use | [M0] | [Paperclip DESIGN.md](https://github.com/paperclipai/paperclip/blob/master/DESIGN.md) |
| "Mine"/Inbox, experimental chat, skills, routines, budgets, Artifacts, issue documents | [M0] | Pinned source and docs |
| Assignment wakes agents; heartbeats; session resumption; agent memory | [M0] | S6, S7 |
| Drizzle supports multiple migration streams; whether down migrations exist | [M0] | §3.2 |
| Plugin or hook extension points | [M0] | §3.2 |
| Better Auth MFA and OIDC availability in the pinned version | [M0] | S8 |
| Adapter base-URL override and model/effort flags | [M0] | S5, §10.4 |
| Upstream issue #11353 (hybrid humans) and roadmap | [M0] | Upstream discussion |
| Multica roles, squads, Autopilots, execution modes, skills and issue #4433 | [M0]; comparison only | Multica docs |
| Buzz, delegate-skills, 9Router and OmniRoute licences | [M0]; only relevant if code were ever borrowed | Repositories |

**External decisions:**
- provider terms on sharing subscription logins;
- VPS provider support for gVisor or nested virtualisation;
- the "Crewspan" trademark screen;
- the privacy and legal posture for compliance access in target jurisdictions.

**Decisions this plan makes and records as Choices:**

| Topic | Decision | Section |
|---|---|---|
| Access preset for new companies | Project-restricted | §5.6 |
| Chat mention default | "Ask" | §7.5 |
| DM privacy | Private by default; compliance access optional and disclosed | §11.4 |
| Returning git results | Bundle, with push credentials outside the sandbox | §9.7 |
| Model gateway | For API-key connections | §10.3 |
| Minimum isolation grade for Stable | "Namespaces" | §9.12 |
| Threads in 1.0 | One level of replies | §11.1 |
| Default caps | As listed | §8.6 |
| Retention defaults | As listed | §9.5, §13.6 |
| Two-person rule | Optional | §4.4 |
| Audit log tamper evidence | Hash chain | §5.12 |
| Crewspan's own licence | MIT | §1.5 |

Each can be revised with a recorded reason.
