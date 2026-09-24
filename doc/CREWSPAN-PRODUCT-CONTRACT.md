# Crewspan Product Contract

Status: Product contract (V1 target) — reference for scoping all Crewspan work
Date: 2026-09-24
Owner: Hollis (product lead)
Source inputs: `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/plans/2026-02-21-humans-and-permissions-implementation.md`, `doc/MCP-ACCESS-GOVERNANCE.md`, current monorepo schema

## 1. Document role and precedence

Crewspan is a public, self-hosted fork of Paperclip for knowledge-work
organisations. This document states **what Crewspan promises to its users**. It is
the reference every later Crewspan task is scoped against.

Precedence rules:

1. `doc/SPEC-implementation.md` remains the authoritative V1 build contract for
   behaviour that already exists. Where this document restates existing
   behaviour, that document controls.
2. Where this document defines something Paperclip V1 does **not** provide, it is
   recorded as a numbered **delta** (`CS-n`) in section 9. A delta is a product
   commitment, not yet an implementation contract. No delta may be implemented
   until `doc/SPEC-implementation.md` is amended to cover it in the same pull
   request that lands the behaviour.
3. Nothing in this document relaxes a Paperclip control-plane invariant: company
   scoping, single-assignee tasks, atomic checkout, approval gates, budget hard
   stops, and activity logging for mutating actions all remain in force.

Read `doc/PRODUCT.md` for Paperclip's product identity. Crewspan does not fork
that identity; it widens the workforce model from "every employee is an agent"
to "people and agents share one org".

## 2. The contract in one paragraph

An owner installs Crewspan and gets one company where people and AI agents share
the same org, projects, work, files and conversations. The owner appoints a CEO
who may be a human or an agent, and builds reporting lines beneath them that mix
both kinds freely. Agents are allocated to individual people or to teams, so
every agent has an accountable human. The owner governs what each agent may
**see**, what it may **use**, and what it may **spend**. Every delegated task
stays visible from assignment, through execution, through review, to an accepted
result — with no stage that only the machine can see.

## 3. Terms

These terms are used precisely throughout Crewspan docs, API and UI.

| Term | Meaning |
|---|---|
| **Person** | A human with a Crewspan account and an active company membership (`users` + `company_memberships`). |
| **Agent** | An AI worker with an adapter config and API key (`agents` + `agent_api_keys`). |
| **Worker** | A person or an agent, considered as someone work can be assigned to. |
| **Principal** | A worker considered as an authorization subject: `(principal_type, principal_id)`, per `doc/plans/2026-02-21-humans-and-permissions-implementation.md` §4.3. |
| **Seat** | A position in the org chart. A seat is held by exactly one worker and reports to at most one other seat. |
| **Team** | A named group of seats with one lead seat. Organisational grouping, distinct from a project. |
| **Allocation** | The record that makes a named person or team accountable for an agent. |
| **Accountable person** | The person who answers for an agent's work and spend. Resolves to a single human for every agent. |
| **Board** | The operator context with full control over a company. In Crewspan the board is a role held by people, not a synonym for "the human". |

"Employee" is not a Crewspan term. Use **worker**, or **person** / **agent** when
the kind matters.

## 4. Org model

### 4.1 One org, two kinds of worker

A Crewspan company has a single org chart. Seats in it are held by people or by
agents, and the chart is rendered as one tree regardless of holder kind. There is
no separate "human org" and "agent org", and no second directory of people
hanging off the side of the agent tree.

What exists today: agents carry `reports_to` pointing at another agent
(`packages/db/src/schema/agents.ts`), and `doc/SPEC-implementation.md` §3 fixes
the org graph as a strict tree of agents. People exist as company members with a
role (`owner | admin | operator | viewer`) but hold no position in that tree.

Crewspan commitment: the org chart is a tree of **seats**, and a seat's holder may
be a person or an agent. See delta **CS-1** and **CS-2**.

### 4.2 Reporting lines

Rules, all four kinds of edge permitted:

- agent reports to agent (exists today)
- agent reports to person
- person reports to agent
- person reports to person

Invariants that hold for every edge:

- **One manager.** Each seat has at most one manager seat. Multi-manager
  reporting stays out of scope, consistent with `doc/SPEC-implementation.md` §3.
- **No cycles.** The seat graph is acyclic; the existing cycle check on
  `agents.reports_to` generalises to seats.
- **Company-scoped.** A seat, its holder, and its manager are in the same
  company. No cross-company reporting line exists.
- **One seat per worker per company** in V1. Dual-hatting (one person holding two
  seats) is deferred; see section 11.

"Person reports to agent" is a deliberate product position, not an accident of
the data model. A human contributor may report to an AI manager that assigns
their work, reviews their output and escalates on their behalf. Crewspan does not
give that AI manager authority it would not have over an agent report: it cannot
approve its own escalations, cannot change permission grants, and cannot act
outside the governance limits in section 6.

### 4.3 The CEO seat

Every company has exactly one root seat, labelled CEO by default. It may be held
by a person or by an agent, chosen at company creation and changeable later by
the owner.

- **Human CEO.** The root seat holder is a person. Strategy proposals from the
  org route to them. They are not automatically the board: board authority
  follows company membership role, and the owner remains the final approver.
- **AI CEO.** The root seat holder is an agent. It proposes strategy through the
  existing `approve_ceo_strategy` approval (`doc/SPEC-implementation.md` §12.2)
  and cannot transition delegated work to active execution before first strategy
  approval.

The approval gate does not disappear when a human holds the seat. A human CEO's
strategy proposal is still recorded as an approval decision so the chain stays
auditable, and **no principal approves its own proposal** — the decision belongs
to an owner-role member other than the proposer. If the owner is also the CEO,
the proposal is recorded and auto-decided with the actor noted explicitly, so the
audit trail never shows a missing decision. See delta **CS-3**.

### 4.4 Teams

A team is a named group of seats with one lead seat. Teams exist so that
allocation, governance and reporting can address a group without addressing a
project.

- A team belongs to exactly one company.
- A team has one lead seat; the lead may be a person or an agent.
- A seat may belong to several teams. Team membership does not change reporting
  lines.
- A team may own agents (section 5) and may carry budget and tool policy
  (section 6).

Teams are not projects. A project is a container for work with repositories,
workspaces and an optional lead agent (`doc/SPEC-implementation.md` §7.5). A team
is a container for workers. Deferred today: there is no `teams` table. See delta
**CS-4**.

## 5. Allocating agents to people and teams

Every agent in a Crewspan company has an **accountable person**. This is the
central governance claim of the fork: no agent runs in a company without a named
human who answers for it.

### 5.1 What an allocation is

An allocation binds an agent to either a person or a team:

- **Allocated to a person** — that person is the accountable person.
- **Allocated to a team** — the team lead's holder is the accountable person; if
  the lead seat is held by an agent, accountability resolves up the seat tree to
  the nearest person-held seat, and finally to the company owner.

Accountability always resolves to exactly one human. A company may not have an
agent whose accountable person resolves to nobody; creation or reallocation that
would produce that state is rejected.

The nearest existing primitive is the responsible-user chain:
`companies.default_responsible_user_id`, `agent_api_keys.responsible_user_id`,
and the `responsible_user_id` carried on issues, runs, routines and activity. An
allocation record is the product-level name for what that chain already implies,
made explicit and editable. See delta **CS-5**.

### 5.2 What allocation grants

Allocation is an accountability and defaulting mechanism. It:

- sets the agent's default responsible user for runs and writes
- determines whose authority the agent's work is attributed to in audit
- supplies the default recipient for escalations, approvals and questions the
  agent raises
- supplies default budget and tool policy inheritance (section 6)

Allocation does **not**:

- grant the accountable person permissions they do not otherwise hold
- restrict who may assign work to the agent (that is `tasks:assign` /
  `tasks:assign_scope`)
- make the agent's work private to that person — visibility is governed in
  section 6.1
- change the agent's reporting line; allocation and reporting are separate axes

An agent may be allocated to a person who is not its manager. A manager seat
directs the work; the accountable person answers for it. In the common case they
are the same human, and the UI should make that the easy default.

## 6. Governance: see, use, spend

Governance answers three questions for every agent, and each has a different
enforcement mechanism. Crewspan keeps them separate and never conflates them.

### 6.1 What an agent may **see**

Crewspan V1 keeps Paperclip's company-scoped visibility model unchanged:
the board and all in-company agents can see all work objects in that company by
default (`doc/SPEC-implementation.md` §9.4, §9.5). Per-project and per-issue ACLs
remain deferred.

Binding consequences, restated because they are easy to get wrong:

- A private marker on an agent profile does not make company-visible work
  private.
- Allocation to a person or team does not narrow work-object visibility.
- Team-scoped visibility is **not** a V1 promise. If the owner needs an agent to
  be unable to read some work, the correct V1 answer today is a separate company.

The hard boundary is `company_id`, enforced in routes and services. Crewspan does
not weaken it anywhere, including for shared people who are members of several
companies.

### 6.2 What an agent may **use**

Tool and credential access is default-deny at the connection boundary and is
governed by the existing MCP access-governance stack
(`doc/MCP-ACCESS-GOVERNANCE.md`):

- **Applications and connections** define what external systems exist.
- **Catalog entries** carry risk levels; unexpected write tools are quarantined
  on refresh rather than silently enabled.
- **Profiles** allow or deny catalog entries, and **bind** to a target. Binding
  targets today are `company | agent | project | routine | issue | gateway`.
- **Ask-first actions** produce a server-owned tool-action confirmation linked to
  the authoritative action request; the human decision is recorded separately
  from provider success (`doc/SPEC-implementation.md` §12.4).
- **Trust rules** ("always allow") remember the same agent, connection and
  action, restricted to the current project when present.
- **Secrets** are referenced, never inlined: `company_secrets` +
  `company_secret_versions` + bindings, with read-path redaction and
  `secret_access_events` for audit.
- **Company skills** are open by default to authenticated company agents;
  restriction is opt-in policy (`doc/PRODUCT.md`, `doc/SPEC-implementation.md`
  §9.10). Crewspan does not change that default.

Crewspan commitment: an owner can express "this team may use these tools" without
editing each agent. Profile binding gains person and team targets. See delta
**CS-6**.

Precedence when several profiles apply is defined by the existing resolver; a
person/team binding sits between company and agent in specificity and must never
widen a narrower binding.

### 6.3 What an agent may **spend**

Spend is governed by budget policies with a hard stop, not by advisory alerts:

- Scope types today: `company | agent | project`. Metric: `billed_cents`. Window:
  `calendar_month_utc | lifetime`.
- Default soft alert at 80 percent (`warn_percent`), hard stop at 100 percent
  when `hard_stop_enabled`.
- At the hard limit the agent is paused, new checkout/invocation for that agent
  is blocked, and a high-priority activity event is emitted
  (`doc/SPEC-implementation.md` §13.2).
- A board member may override only by raising the budget or explicitly resuming
  the agent. Silent continuation is never correct.

Crewspan commitment: budget scope extends to person and team, so an owner can cap
"everything my head of research is accountable for" in one place. An agent's
effective cap is the tightest applicable policy across company, team, person,
project and agent. See delta **CS-7**.

Hidden token burn is a product bug, not a tuning problem. Any Crewspan surface
that starts work must show what it is expected to cost against which cap.

### 6.4 Who may change governance

Governance edits are permission-gated through the shared authorization system for
humans and agents — one evaluator, one grants table
(`principal_permission_grants`), no separate agent permission engine.

- Company membership roles: `owner | admin | operator | viewer`.
- Relevant permission keys already defined in
  `packages/shared/src/constants.ts` include `agents:create`,
  `agents:configure`, `agents:suggest-changes`, `tools:admin`,
  `tools:manage_connections`, `tools:manage_profiles`, `tools:view_audit`,
  `users:invite`, `users:manage_permissions`, `tasks:assign`,
  `tasks:assign_scope`, `joins:approve`.
- Agents cannot mutate auth or keys, cannot set company budgets, and cannot
  bypass approval gates (`doc/SPEC-implementation.md` §9.2). An AI CEO is not an
  exception to this.
- Every governance mutation writes an `activity_log` entry with actor,
  responsible user and before/after detail.

Crewspan adds no new role tier. Org seniority is not authority: holding a manager
seat grants no permission that a grant does not already give.

## 7. The work chain: assignment → execution → review → accepted result

The chain is the product. A task that is assigned but whose execution is
invisible, or whose result is claimed but never accepted, is a broken promise.
Each stage below names what must be inspectable while it is happening, not only
afterwards.

### 7.1 Assignment

- One task, one assignee. The assignee is a worker: `assignee_agent_id` or
  `assignee_user_id`, never both.
- Every task traces to the company goal through its parent chain, so any worker
  can answer "why am I doing this?" (`doc/PRODUCT.md`).
- Assignment authority comes from `tasks:assign` or a scoped
  `tasks:assign_scope` grant (project, target-agent allowlist, or managed
  subtree). A protected-agent block denies assignment outright and needs an
  administrator to clear it (`doc/SPEC-implementation.md` §9.8).
- Assigning to a person and assigning to an agent use the same task object, the
  same statuses and the same thread. Crewspan does not fork the task model by
  worker kind.
- Visible at this stage: who assigned it, to whom, under which parent goal, at
  what priority, with what work mode (`standard | ask | planning`).

### 7.2 Execution

- Entering `in_progress` requires atomic checkout; a lost race returns a conflict
  rather than a silent second owner (`doc/SPEC-implementation.md` §10.4.1).
- Status transitions follow the fixed machine in §8.2:
  `backlog → todo → in_progress → in_review | done`, with `blocked` and
  `cancelled` available from the states that allow them.
- An agent-owned non-terminal task must have a live execution path, an explicit
  waiting path, or an explicit recovery path. Comments, logs, detached processes
  and background watchers are evidence, not liveness (§8.2).
- Blocked work names an unblock owner and action. A blocked chain with no named
  owner is a defect.
- Progress is reported as human-readable intent first, with steps and artifacts
  beneath, and raw transcript underneath that (`doc/PRODUCT.md`, progressive
  disclosure). Crewspan does not lead with bash logs.
- Visible at this stage: current status, the run that owns it, elapsed time,
  spend so far against cap, and the next action with its owner.

### 7.3 Review

- `review_policy` on the task selects who may accept: `anyone` (default),
  `not_creator`, or `human_only`.
- For ordinary low-risk work, the assignee's structured `done` claim is accepted
  under explicit workflow constraints; missing independent evidence alone does
  not manufacture a human approval (`doc/SPEC-implementation.md`, Native task
  completion).
- A new review request requires a concrete reviewer decision. `in_review` is
  healthy only while a typed participant, pending interaction, approval, user
  owner, active run, queued wake or recovery action owns the next action (§8.2).
- Review by a person and review by an agent produce the same record shape. A
  human reviewer is required when the policy says `human_only`, and Crewspan
  expects governed or irreversible work to carry that policy.
- Crewspan commitment: a task may require review by the **accountable person** of
  its assignee, expressed as a review policy rather than by hardcoding a
  reviewer. See delta **CS-8**.
- Visible at this stage: who owes the decision, what they are being asked to
  accept, and what changes if they decline.

### 7.4 Accepted result

A task is not done because a worker says so. It is done when there is a result a
human can open.

- The deliverable is a **work product** (`issue_work_products`) with a type,
  provider, title, optional URL, `review_state` and an `is_primary` flag —
  or an uploaded artifact reachable through the API, not only a local path
  (`doc/AGENT-ARTIFACTS.md`, AGENTS.md rule 6).
- Acceptance is a recorded decision, not an inference. The existing completion
  path persists contracts, results and assessments
  (`completion_contracts`, `native_run_results`, `work_assessments`) alongside
  the status transition, and approvals link through `issue_approvals`.
- Crewspan commitment: every task that reaches `done` exposes, in one view, the
  accepted result, who accepted it, when, under which policy, and what it cost.
  See delta **CS-9**.
- Visible at this stage: the artifact itself, the acceptance decision, the actor,
  and the total spend for the task.

### 7.5 Chain invariants

These hold across all four stages and are the acceptance test for any Crewspan
feature that touches work:

1. **No dark stage.** At every moment a task is non-terminal, a person can see
   which stage it is in and who owns the next action.
2. **Same chain for both kinds of worker.** Nothing in the chain branches on
   whether the assignee is a person or an agent, except where a policy explicitly
   requires a human.
3. **Audit is complete.** Every mutating action in the chain writes an activity
   entry carrying actor, responsible user, run and field-level change.
4. **Result before done.** A `done` task without an inspectable result or a
   recorded acceptance is a defect, not a style preference.
5. **Cost is attributable.** Every stage's spend attributes to a task, an agent
   and an accountable person.

## 8. Non-goals

Crewspan inherits Paperclip's boundaries and adds none of the following in V1:

- Not a general chat app. Conversation stays attached to work objects.
- Not a Jira or GitHub replacement. Crewspan orchestrates the organisation; it
  does not own pull-request review.
- Not enterprise RBAC. Project/issue ACLs, reviewer-only channels and custom
  org-wide policy overlays remain Pro/Enterprise territory
  (`doc/SPEC-implementation.md` §9.6).
- Not multi-manager reporting. One manager per seat.
- Not HR. Crewspan tracks org structure, accountability and spend — not payroll,
  performance ratings or employment records for people.
- Not a fork of Paperclip's identity. Where Crewspan has no reason to differ, it
  tracks upstream. Divergence is decided deliberately and recorded (CRE-4, fork
  boundary inventory).

## 9. Deltas from `doc/SPEC-implementation.md`

Each delta is a commitment in this document that current V1 behaviour does not
satisfy. None may be implemented before `doc/SPEC-implementation.md` is amended
in the same pull request.

| ID | Commitment | Current state | Spec sections to amend |
|---|---|---|---|
| **CS-1** | A person can hold an org position and be a first-class worker in the chart | People are company members with roles; `assignee_user_id` exists on issues, but no org position | §3 (org graph), §7.2, §14 |
| **CS-2** | Org chart is a tree of seats; holder may be person or agent | `agents.reports_to` → `agents.id` only | §3, §7.2, §7.14 indexes |
| **CS-3** | CEO seat may be held by a human; strategy approval survives with no self-approval | §12.2 assumes an agent CEO | §12.2, §8.3 |
| **CS-4** | Teams as named groups of seats with a lead | No `teams` table; `goals.level = team` is the only trace | §7 (new table), §10, §14 |
| **CS-5** | Explicit allocation of an agent to a person or team; accountability always resolves to one human | Implicit via responsible-user chain and `companies.default_responsible_user_id` | §7.2, §9, §10.3 |
| **CS-6** | Tool profile bindings target a person or a team | Binding targets: `company, agent, project, routine, issue, gateway` | §9.6, `doc/MCP-ACCESS-GOVERNANCE.md` |
| **CS-7** | Budget scope extends to person and team; effective cap is the tightest applicable | Scopes: `company, agent, project` | §13.1, §13.2 |
| **CS-8** | Review policy can require the assignee's accountable person | Policies: `anyone, not_creator, human_only` | §7.6, §9.3 |
| **CS-9** | One view per done task: accepted result, acceptor, time, policy, cost | Data exists across work products, approvals, assessments and cost events; not unified | §14, §10.4 |

Delta hygiene rules:

- A delta lands as one vertical slice across `packages/db`, `packages/shared`,
  `server` and `ui`, with contracts synced (AGENTS.md rule 2).
- CS-1 and CS-2 are prerequisites for CS-3 through CS-8. Sequence accordingly.
- Any delta that widens who can read work must be reviewed against §9.4/§9.5
  before it ships. None of CS-1…CS-9 is intended to widen visibility.
- Deltas do not change telemetry. If one appears to, it is misdesigned — see
  AGENTS.md rule 7 for the three data paths.

## 10. Acceptance criteria for this contract

An implementation satisfies this contract when all are true:

1. An owner can create a company, choose a human or AI CEO, and see one org chart
   containing both people and agents.
2. Every one of the four reporting-edge kinds in §4.2 can be created, and cycles
   and cross-company edges are rejected.
3. Every agent resolves to exactly one accountable person, visible on the agent
   page, and an allocation change is audited.
4. An owner can set a tool profile and a budget on a team and observe both take
   effect on an agent allocated to that team, without editing the agent.
5. A budget hard stop pauses the agent and blocks new checkout, with the incident
   visible to the accountable person.
6. A task assigned to a person and a task assigned to an agent are the same
   object with the same statuses, thread and review path.
7. For any `done` task, one view shows the accepted result, the acceptor, the
   acceptance time, the governing review policy and the total cost.
8. No non-terminal task exists without a visible owner of its next action.

## 11. Open questions for the owner

These are product decisions, not implementation details. Each is deferred, not
forgotten; the current default is stated so work is not blocked.

1. **Dual-hatting.** May one person hold two seats (for example CEO and head of
   engineering)? *Default: no, one seat per worker per company.*
2. **Work assignment to people.** Should Crewspan notify assigned people outside
   the app, and through which channel? *Default: in-app only.*
3. **Team-scoped visibility.** Is "this team cannot see that project" a Crewspan
   V1 requirement, or does the separate-company answer hold? *Default: separate
   company; visibility stays company-scoped.*
4. **Human spend.** Do people carry budgets of their own (seat cost, tool cost),
   or is spend only ever agent-attributed? *Default: agent-attributed; person and
   team budgets in CS-7 are caps over allocated agents, not salaries.*
5. **CEO handover.** When the CEO seat changes holder, do open strategy approvals
   transfer or close? *Default: transfer to the new holder, audited.*

## 12. Related documents

- `doc/GOAL.md` — why the control plane exists
- `doc/PRODUCT.md` — Paperclip product identity and boundaries
- `doc/SPEC-implementation.md` — authoritative V1 build contract
- `doc/plans/2026-02-21-humans-and-permissions-implementation.md` — actor model,
  grants, invites, join requests
- `doc/MCP-ACCESS-GOVERNANCE.md` — connections, profiles, approvals, audit
- `doc/execution-semantics.md` — ownership, liveness, recovery
- `doc/AGENT-ARTIFACTS.md` — work products and inspectable deliverables
