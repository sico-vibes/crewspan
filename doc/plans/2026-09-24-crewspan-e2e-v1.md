# Crewspan: the human and agent workspace built on Paperclip

## 1. Product contract and foundation

**Crewspan is a public, self-hosted fork of Paperclip for knowledge-work organisations.** People and AI agents share an organisation, projects, work, files and conversations. An owner can appoint a human or AI CEO, build mixed reporting lines beneath them, allocate agents to specific people or teams, and govern what those agents may see, use and spend. Every delegated task remains visible from assignment through execution, review and accepted result.

A complete first public release must support the whole core journey: **set up an organisation → invite people → appoint leadership → create projects and shared resources → allocate agents → communicate → delegate work → review results → inspect cost and activity**. Engineering can deliver this in milestones, but the public release gate covers the complete journey.

### Fork baseline and boundaries

- Fork the latest verified stable Paperclip release at implementation start; the current researched stable baseline is `v2026.916.1`. Keep the upstream Git remote and document the pinned commit. Preserve Paperclip’s MIT notice and attribution. [Paperclip releases](https://github.com/paperclipai/paperclip/releases), [license](https://github.com/paperclipai/paperclip/blob/master/LICENSE).
- Retain Paperclip’s React UI, Express API, PostgreSQL/Drizzle data layer, Better Auth, adapters, project workspaces, tasks, approvals, run history, budgets, Connections and artifacts. Its existing monorepo is the implementation home; Crewspan should not become a separate frontend placed over Paperclip. [Architecture](https://github.com/paperclipai/paperclip/blob/master/docs/start/architecture.md).
- Draw product inspiration from Buzz’s DMs, channels and shared human/agent presence, elnagdy’s bounded delegation and review loop, and 9Router/OmniRoute’s quota-aware routing. Implement these as Crewspan features or optional connections; do not merge their applications into the fork. [Buzz](https://github.com/block/buzz), [delegate-skills](https://github.com/amElnagdy/delegate-skills), [9Router](https://github.com/decolua/9router), [OmniRoute](https://github.com/diegosouzapw/OmniRoute).
- Maintain a **Paperclip compatibility map** for every existing surface: inherited unchanged, extended, or deliberately replaced. New work must preserve existing API behaviour and migrate existing Paperclip data unless a documented compatibility test proves that impossible.
- Use **Crewspan** as the project codename. Treat public branding, domain and trademark clearance as a separate release decision; no visual rebrand is required to develop the product.

### Success criteria

A pilot organisation with at least two humans, two agents and two projects must be able to prove that:

1. A human CEO and an AI CEO are both valid appointment choices, and mixed reporting lines work.
2. A project member can operate only allocated agents and see only authorised projects, files, conversations, runs and costs.
3. An agent assigned to Project A cannot read Project B’s repository, files, credentials or API data.
4. A channel mention can create governed agent work; a reviewer can inspect its evidence, request changes and accept the outcome.
5. The owner can see the complete work and spend trail without searching through raw transcripts.
6. The UI remains recognisably Paperclip in its layout, components, terminology, states and density.

## 2. Organisation, authority and access

### Separate four relationships

Crewspan must model these independently throughout the database, API and UI:

| Relationship | Meaning |
|---|---|
| **Reporting** | Who manages whom in the organisation chart. |
| **Work ownership** | Who is accountable for a task and its final decision. |
| **Access and authority** | What a person or agent may view, assign, invoke, approve or configure. |
| **Execution policy** | Where an agent runs and which data, tools, credentials, provider, model, effort and budget it may use. |

A reporting line never grants access by itself. A project membership never grants model or credential access by itself.

### Hybrid organisation

- Extend the existing agent tree with typed **human and agent organisation nodes**. Each node has a title, team, capabilities, status and optional manager. Enforce one direct manager per node, no reporting cycles and one active CEO appointment per organisation. The owner’s Board role sits above this tree as governance authority.
- Let the Board appoint a human or agent CEO and reassign that appointment through an audited transition. Human leaders and AI leaders can manage mixed teams. Preserve existing agent identities, reporting data and task history during migration.
- Keep job position separate from permission role: “CEO” or “Research Lead” describes organisational responsibility; owner, administrator, manager, member and viewer templates describe default powers.
- Add a human project lead alongside Paperclip’s agent project lead. A project can have one accountable lead and additional contributors. Existing human task assignees continue to work.
- Add **agent allocation**: an agent may be assigned to a human steward, team or approved shared pool. Allocation states who may discover, chat with and request work from that agent; explicit action grants determine what they can actually do. An owner can grant additional operators without moving the agent in the chart.

Paperclip has human members and task assignees, but its documented model does not yet make humans full organisation nodes or give a member access only to selected agents. Its existing project/agent membership rows mainly control sidebar visibility. Crewspan must implement actual server-enforced resource access. [Hybrid-human feature request](https://github.com/paperclipai/paperclip/issues/11353), [membership contract](https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md).

### Permission system

- Use one central authorisation service for users and agents. A decision evaluates **principal + action + resource + organisation + current grants** and returns an allow/deny result with an auditable reason.
- Resource scopes are organisation, project, folder, document, asset, task, conversation, agent, run and connection. Grants can target a person, agent or team. New organisations start with **default-deny project access**; owners retain audited administrative authority.
- Project grants may flow to child tasks and folders. Marking a folder, task or channel “restricted” breaks that inheritance and requires explicit membership. Revocation applies to new API reads, downloads, subscriptions, tool calls and runs immediately; active agent runs holding revoked data are cancelled.
- Define separate actions for viewing an agent, messaging it, assigning it work, invoking it, reviewing its work, changing its configuration, granting its credentials and changing its budget. A manager can allocate inside an envelope set by the owner but cannot expand that envelope.
- Apply the same check to list and detail endpoints, search, autocomplete, notification payloads, WebSocket events, file previews/downloads, exports, MCP/tool access and agent context retrieval. Hidden data must not leak through counts, titles or “permission denied” details.
- Keep an immutable audit record for grants, denials on sensitive actions, configuration changes, approvals, credential use, task dispatch and owner override.

### Access requests and approvals

- A person can request access to a project, folder, agent, provider/model, connection or higher budget from the point where they encounter the restriction. The request records the requested scope, reason, duration and approving authority.
- Route requests to the project lead or authorised manager when inside their envelope; route any expansion of organisation policy, credentials or spend ceiling to an owner or designated Board approver.
- Approval creates a scoped grant with optional expiry; rejection includes a reason. Revocation invalidates it without deleting the request history. Agents may propose requests but cannot approve their own expansion.
- Provide one review surface that shows **what will become visible or executable** before approval. Avoid a generic “approve access” button with unclear consequences.

## 3. Shared work, delegation and communication

### Projects, files and knowledge

- Preserve Paperclip projects, tasks, repositories, execution workspaces, issue documents, attachments and the company Artifacts view. A project may be created without a repository; this is essential for research, operations, design and other knowledge work. Repository-backed projects may select multiple repos. [Project workspaces](https://github.com/paperclipai/paperclip/blob/master/skills/paperclip/references/api-reference.md), [issue documents](https://github.com/paperclipai/paperclip/blob/master/docs/api/issues.md), [Artifacts](https://github.com/paperclipai/paperclip/blob/master/releases/v2026.609.0.md).
- Add a **project Files area** using Paperclip’s existing attachment and artifact storage: folders, uploaded assets, editable documents, versions, previews, ownership, links to tasks and project-level search. Keep an “organisation shared” area for templates and approved common knowledge.
- Distinguish three file types visibly: **managed files** stored by Crewspan, **repository files** belonging to a source repo, and **execution files** produced inside a run workspace. A result intended for review must be published as a managed artifact or explicit versioned document; a local path alone does not count as delivery.
- Before any document, file, transcript or search result reaches an agent, enforce the agent’s resource grant and the initiating human’s rights. Assemble context from the task brief, explicitly attached resources and permitted retrieval results; record source links. A folder assignment defines available material, not automatic inclusion of all its contents in a model context window.
- Keep uploads and downloads scoped to the authorising resource. Validate type and size, scan uploaded files, sanitise previews, issue short-lived download access, and exclude revoked material from search results and cached context.

### Agent runtime and delegation

- Use Paperclip’s existing task/run/approval system as the record of work. A **delegation** is a parent task linked to one or more bounded child tasks, each with a brief, permitted inputs, chosen agent or lane, run policy, expected deliverable, reviewer and acceptance criteria.
- The visible lifecycle is **draft → authorised → queued → running → result submitted → review → accepted / changes requested / cancelled**. Each stage has an accountable owner and a durable event. A failed or interrupted run resumes or retries according to an explicit policy; it does not silently create a second task or duplicate a charge.
- Support delegation lanes such as research, writing, coding and review. A lane specifies an eligible agent class and an approved model/effort envelope. A human or coordinating agent may choose a lane, but dispatch resolves to a particular authorised agent and records the effective configuration.
- The parent task receives a concise child result, linked artifact and verification evidence. Reviewers can open the full run history when needed. The originating agent may continue only after the child result or human decision is recorded.
- Measure **total cost per accepted task**, including parent orchestration, delegates, retries and review. Show estimated versus actual spend and time, but never promise that delegation inherently saves tokens.
- Retain Paperclip Connections as the source of provider credentials. Add a model policy resolver that intersects organisation, project, agent, requester and credential grants before dispatch. Provider fallback stays within that intersection; if no route is authorised, the task pauses with an actionable request. Allow an external OpenAI-compatible router such as 9Router or OmniRoute as an optional endpoint, while Crewspan remains the authority for policy and accounting. Paperclip’s current Connections already distinguish credential ownership and grants from model selection. [Connections release](https://github.com/paperclipai/paperclip/releases/tag/v2026.916.0).

### Execution isolation

- Treat a project working directory as a starting location. It is **not** a security boundary. Use Paperclip’s execution-workspace and environment abstractions, but make a verified isolated runner mandatory for ordinary Crewspan agent execution. [Execution workspaces](https://github.com/paperclipai/paperclip/blob/master/docs/guides/board-operator/execution-workspaces-and-runtime-services.md), [filesystem scope](https://github.com/paperclipai/paperclip/blob/master/doc/spec/agent-runs.md).
- On a single VPS, run the control plane separately from agent execution. Provision a per-run or explicitly reusable isolated environment containing only the selected project checkout, approved read-only shared references and scoped credentials. Run as a non-root user, without the host’s home directory, SSH keys, database credentials or container-control socket. Restrict egress to required provider, Crewspan and authorised tool endpoints.
- Use a separate Git worktree for parallel writable work. Treat the worktree as edit isolation and the runner as access isolation. For non-code projects, provision an empty working area plus selected managed files.
- Disable unsandboxed local adapters for normal users. Provide an owner-only, clearly labelled compatibility override with audit logging for installations that cannot support isolation. A sandbox launch failure fails the run closed.
- Validate each supported adapter/environment pair with a real test attempting to read a neighbouring repo, host secret and forbidden network endpoint. Do not mark an agent “isolated” merely because a config field is present; Paperclip’s optional local Bubblewrap scope is off by default and has had reported adapter and host compatibility issues. [Adapter configuration](https://github.com/paperclipai/paperclip/blob/master/packages/adapters/claude-local/src/index.ts), [reported issue](https://github.com/paperclipai/paperclip/issues/11079).

### DMs, channels and inbox

- Add human↔human, human↔agent and authorised agent↔agent DMs; project and team channels; threads; mentions; attachments; and links to tasks, files, decisions and runs. Private channels are visible only to members. Agents join and read channels under the same explicit membership rules as people.
- An `@agent` mention first checks membership, invocation authority, model policy, budget and context scope. If allowed, it creates a task-backed interaction and posts progress/result back to the thread. If denied, show the exact available action, such as “Request access,” without exposing the agent’s private configuration. A normal conversation message never silently authorises deployment, purchase, credential use or another governed action.
- Keep a single **actionable Inbox** built from assignments, mentions, review requests, approvals, access requests, agent questions, run failures and budget incidents. Each item links to its underlying record and has read/archived state; archiving does not resolve the work. Add per-user notification preferences and a daily digest, with in-app live delivery first.
- Preserve Paperclip’s existing task conversations, “Mine” work and experimental agent chat where useful. Unify their navigation and notification presentation rather than creating a second, inconsistent task database. AgentMail and external chat connectors remain optional integrations, not the internal inbox implementation. [Current chat and Connections release](https://github.com/paperclipai/paperclip/releases/tag/v2026.916.0), [Inbox API](https://github.com/paperclipai/paperclip/blob/master/skills/paperclip/references/api-reference.md).

## 4. Interface and technical implementation rules

### UI/UX: a strict Paperclip expansion

Paperclip’s `DESIGN.md` is the source of truth for Crewspan interface work. Its stated screen priority is: **what is happening, does it need me, what do I do about it**. Use its existing React components, layouts, status vocabulary and CSS token root; do not start a parallel design system. [Paperclip design principles](https://github.com/paperclipai/paperclip/blob/master/DESIGN.md).

- Preserve the existing dashboard, project, task, agent, run, approval, cost, settings and Artifacts screens as recognisable surfaces. Extend their existing panels and actions. Add only the missing destinations: **People** within the org area, **Chat**, and **Files** within projects; evolve “Mine” into the unified Inbox.
- Reuse existing Button, Card, Badge, Table, form, drawer, status and empty-state components before adding variants. Put any new visual values in Paperclip’s token source, `ui/src/index.css`. Do not hardcode a new palette, type scale, spacing scheme or motion language.
- Make human and agent identity distinct through a consistent avatar/type marker while keeping them equal participants in the same org chart, assignee picker, message composer and activity trail. A card should expose role, availability and responsibility first; model and raw runtime details belong in a deeper panel.
- Keep the operator view dense and scannable. A task should show its owner, delegated children, latest result, reviewer, blockers and cost before raw logs. Chat should be pleasant for everyday conversation, but task status and approvals remain visible in the same Paperclip visual vocabulary.
- Add an **effective access** panel to each person and agent: projects they can see, agents they can invoke, connections/models they can use, budget limits, and who granted each right. Show the same effective policy in the assignment composer before dispatch.
- Use action-specific copy: “Assign to Research Agent,” “Request model access,” “Approve £20 increase.” Keep *task* as the UI term even where inherited API paths still say `issue`. Errors explain the denied action and next step without leaking hidden data.
- Match Paperclip’s responsive browser experience and existing installable-web capabilities. Do not make native desktop or mobile rewrites a release prerequisite. Support keyboard navigation, reduced motion, screen-reader labels, contrast and all loading/empty/error states.
- Establish a visual regression baseline from the pinned Paperclip release. New screens must pass side-by-side review in light/dark themes and desktop/narrow layouts. Reject a Crewspan feature if its component, spacing, status colour or navigation behaviour feels imported from another product. Paperclip explicitly uses Storybook as a verification surface. [Design principles](https://github.com/paperclipai/paperclip/blob/master/DESIGN.md).

### APIs, data and events

Extend the existing REST API and shared types with:

- Typed organisation nodes/reporting edges; project leads and agent allocations.
- Resource grants, effective-permission checks and access-request decisions.
- Folder/document/asset metadata and version records.
- Delegation links, briefs, results, review decisions and cost attribution.
- Conversations, membership, messages, mentions and per-user Inbox entries.
- Model policy and route-decision records.

Keep existing task and agent endpoints compatible. Add dedicated endpoints for access requests, conversations, folders and delegations under company-scoped paths. Every write uses the same authorisation service, records an activity event and emits an authorised live update. Use transactional outbox delivery for notifications so a saved decision cannot vanish if a live event fails.

### Self-hosted deployment and operations

- Ship a documented single-VPS Compose path with the Crewspan web/API service, PostgreSQL and a separate runner service. Support Paperclip’s local-disk storage for small single-host installations and S3-compatible storage for larger deployments. Never put agent runners in the control-plane container with broad access to its database or secret store. [Paperclip Docker guide](https://github.com/paperclipai/paperclip/blob/master/docs/deploy/docker.md), [storage guide](https://github.com/paperclipai/paperclip/blob/master/docs/deploy/storage.md).
- Default to Paperclip’s **authenticated** deployment mode for Crewspan organisations, with HTTPS behind a reverse proxy. Preserve existing provider sign-in/API-key flows and Connections rather than inventing a central model billing service.
- Provide setup checks for database migration, storage, runner isolation, provider credentials, public URL and backup health. Back up the database, uploaded files and secrets key together; document restore and an upgrade rollback path.
- Ship an import/upgrade path for an existing Paperclip installation. Existing company-wide visibility remains readable during migration, but the administrator must review and activate scoped Crewspan policies before inviting restricted users. New Crewspan organisations use the scoped default from creation.
- Maintain a recurring upstream-sync process: review stable Paperclip releases, security fixes, changed schemas and design tokens; merge into a staging branch; run compatibility and visual checks; document conflicts and release a pinned Crewspan version.

## 5. Delivery sequence and release proof

All milestones are required for the first public release; they are sequenced to keep the fork reviewable.

1. **Fork and baseline.** Pin upstream, build it unchanged, record UI screenshots and tests, map inherited APIs and data, create the compatibility matrix and threat model. Exit when a clean Paperclip organisation runs on the intended VPS configuration.
2. **Identity and scoped access.** Add hybrid org nodes, human leadership, allocation, central authorisation, project/file/agent grants and migration. Exit when unauthorised users and agents are denied through UI, API, search, events and downloads.
3. **Projects and isolated execution.** Add project Files, permission-aware retrieval, safe artifacts and mandatory contained runners. Exit when two simultaneous projects can run agents and cross-project filesystem/API/credential reads fail.
4. **Delegation and model governance.** Add lane configuration, task-backed child runs, review outcomes, Connections-based model policy, approved fallback and complete cost attribution. Exit when a cheaper delegate can be compared against direct execution using **cost per accepted task**, including rework.
5. **Communication and Inbox.** Add DMs, channels, mentions, threads, notifications and access requests; connect them to tasks and runs. Exit when a human can request an agent in a channel, see progress, review the artifact and receive the decision in one coherent flow.
6. **Release hardening.** Run full Paperclip regression coverage, Crewspan permission and isolation tests, migrations both ways where possible, backup/restore, load and accessibility checks, visual comparison and a fresh-VPS installation. Publish documentation, security model, limitations, upgrade guide and a reproducible demo organisation.

**Non-negotiable test scenarios:** human CEO and agent CEO; mixed reporting without cycles; scoped manager delegation; denied project and agent selectors; restricted file search and download; revoked access during an active run; forbidden model fallback; expired credential; duplicate message/run delivery; concurrent worktrees; interrupted delegation and retry; reviewer requests changes; inbox deduplication; restore from backup; and a user completing the complete journey on desktop and narrow browser layouts.

**Assumptions locked for this plan:** Crewspan is an open public fork prioritising self-hosting, not a paid hosted service; any knowledge-work team can create projects without code repositories; the initial client follows Paperclip’s browser app; provider accounts and subscriptions follow Paperclip’s existing Connections model; DMs and channels are required at first public release; and the visual language remains Paperclip’s.
