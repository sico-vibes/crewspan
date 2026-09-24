# Crewspan plan review: Opus 5.5 and Codex assessment

**Date:** 24 September 2026
**Reviewed:** [Version 1](Crewspan-E2E-Plan.md) and [Version 2](Crewspan-E2E-Plan-v2-Multica.md)
**Run:** Claude Code 2.1.281, model `claude-opus-5-5`, read-only plan mode. The two plan files were unchanged before and after the review.

## My assessment of Opus's feedback

**Verdict.** Opus's review is valuable. Version 2 is a much better engineering specification, especially its separate agent/runtime/run records, explicit assign versus start actions, runtime capability checks and competitive honesty. Its most important critique is that the plan promises too many cross-cutting systems in one first-public-release gate. A fork can be a defensible foundation because Paperclip provides the UI and much of the work engine, but a scoped-permissions retrofit and enforceable execution isolation should be proven before committing to the full roadmap.

**Changes I would prioritise before implementation:**

1. Add a Milestone 0 audit of the pinned Paperclip source: list every route, query, WebSocket event and tool surface affected by project-level access; map the existing run identity, sandbox, connection, skill and migration mechanisms. Build a real two-project isolation probe on the intended VPS.
2. Specify a trigger matrix and two separate state machines. Each assignment, mention, DM, schedule and delegated child run needs a known originating principal, budget owner, context scope and durable run record. A task-free chat or routine run still needs usage and audit records.
3. Define delegated authority. A child can never widen the parent's resource/model/tool envelope. A human or AI CEO may coordinate within a Board-approved envelope; expansion of spend, credentials or grants needs an authorised human decision.
4. Define the reference execution stack and its privilege boundary. Treat worktrees as edit isolation only. Do not mount a shared repository's Git metadata into a supposedly isolated run; use a per-run clone or an equivalently isolated repository layout, and test the actual provider/adapter pairs.
5. Label model policy as enforced or advisory per adapter and label usage as metered or estimated. Specify provider data-handling rules for fallback. Replace absolute promises to cancel already disclosed information or avoid retry charges with enforceable run-cancellation and cost-attribution contracts.

**Where I qualify Opus's recommendations:**

- Opus was asked not to browse, so its competitor and Paperclip statements are deliberately marked unverified. We did verify Multica's [licence](https://github.com/multica-ai/multica/blob/main/LICENSE) and [default runtime access](https://multica.ai/docs/security-model) against their published primary sources. Those findings are sound as of this review date.
- Paperclip already documents [run-scoped JWTs](https://github.com/paperclipai/paperclip/blob/master/docs/api/authentication.md) and an optional [Bubblewrap filesystem scope with a network allowlist proxy](https://github.com/paperclipai/paperclip/blob/master/doc/spec/agent-runs.md). These need implementation validation and fail-closed defaults, but should be extended before inventing replacement mechanisms. Its [implementation specification](https://github.com/paperclipai/paperclip/blob/master/doc/SPEC-implementation.md) also confirms company-wide default visibility and defers scoped work-object controls.
- Opus's warning about a linked worktree's shared Git metadata is real; [Git documents the common directory](https://git-scm.com/docs/git-worktree). A per-run clone is a simple safe default, though it is not the only possible isolated Git design. The plan should state the required boundary and let an implementation spike choose the mechanism.
- I agree with a staged release, but the user asked for a complete end-to-end product vision. I would preserve the full target and use private pilots or a clearly labelled preview to validate parts early. The first broadly advertised release can still cover the full core journey if that remains the desired product bar.
- A blanket ban on every AI approval is too blunt. AI leaders should be able to route and authorise work *inside* a human-approved envelope. They should not create or enlarge access, spend, credential or deployment authority on their own.
- A strict rule that implementers never read Multica source is a conservative legal-process suggestion, not a conclusion from the licence itself. The concrete rule is to implement independently and avoid copying restricted code or UI into the Paperclip fork without rights review.

**My overall judgment:** keep Version 2 as the north-star specification. Before building, produce a smaller implementation contract for the first release with a measured Paperclip retrofit surface, a reference VPS/runner design, a trigger-and-authority table and explicit acceptance tests. The greatest product risk is not whether the vision is compelling; it is whether the proposed permission and execution guarantees can be made true on a fork without consuming the whole team in upstream merge work.

## Claude Opus 5.5 report (verbatim)

# Crewspan plan review: Version 1 vs Version 2 (Multica edition)

I read both files in full and modified nothing. Where I say something about Paperclip or Multica that the plans only assert, I mark it **(unverified)**. Anything labelled "architectural concern" is my own inference from general knowledge, not a checked fact about either codebase.

---

## 1. Verdict

**Is V2 a meaningful improvement?** It's a much better specification but a worse release plan.

V2 adds the execution semantics V1 was missing:
- Agent, runtime and run are separate records (V2:107).
- Assign and Start run are separate decisions (V2:17, 115, 157, 175).
- Runner claims are transactional, stale leases are rejected, and permissions are re-checked on every call using per-run tokens (V2:85, 110).
- Each run records its inputs (V2:102).
- Private chat is separated from accountable task work (V2:136).
- The Inbox deduplicates notifications (V2:137).
- There's a licence boundary with Multica (V2:22), an honest competitive framing (V2:8–10), and a list of deferred choices (V2:206–211).

But V2 keeps V1's rule that "All milestones are required for the first public release" (V1:141 → V2:188). It then adds work to those required milestones: runtime/lease infrastructure, delivery teams that wake their lead again, skill versioning, routines and webhooks (V2:194), and about 10 more required test scenarios (V2:197). It also introduces contradictions V1 didn't have (findings 7 and 12). V1 was already too large to ship, and V2 is larger.

**Is Paperclip still a defensible foundation?** Yes, but only conditionally. Your hard constraints (keep Paperclip's working UI/UX, no new frontend, inherit org/agent/task/budget/approval features) make a Paperclip fork the only option that fits. The problem is that Crewspan's differentiators are exactly the things Paperclip lacks:
- permissions on individual resources,
- enforced isolation,
- chat.

Each of these cuts across nearly every inherited endpoint, query and live event. Neither plan has a strategy for how far the fork will diverge from upstream (finding 9). Without one, merging each upstream release becomes the main ongoing cost and the fork falls behind. The foundation is defensible only if a Milestone 0 technical spike measures how many inherited routes and queries the permission retrofit touches, and there is a real attempt to get the hooks into Paperclip upstream first.

---

## 2. Highest-priority findings

### 1. The release gate has no scope limit, and V2 widens it
**Severity: Critical**

**What the plans say:**
- "The public release gate covers the complete journey" (V1:7, V2:28).
- "All milestones are required for the first public release" (V1:141, V2:188).
- V2 puts skill versioning, runbooks and guarded schedules/webhooks into required Milestone 5 (V2:194).
- V2 makes skill version pinning, webhook deduplication and failure-pause tests "non-negotiable" (V2:197).
- Both plans lock DMs and channels as release requirements (V1:152, V2:213).
- Neither plan has estimates, staffing, a timeline, or a preview/1.0 split.

**Why it matters (inference):** The release bundles five products into one gate: a permissions retrofit, a sandboxed runner, a delegation engine, a chat system, and a file/document manager. Every one of them has to be finished before anyone outside the team uses anything. There's no point where outside feedback can reach the team early.

**Fix:**
- Replace V2:188 with two gates: a **Public Preview** (the core journey, with documented limitations) and a **1.0**.
- Move routines/webhooks, skill versioning, delivery-team re-wake, personal runners, Direct mode, digests and agent↔agent DMs to after the preview.
- Keep DMs, channels and mentions, but only a minimal version (Section 4).

### 2. The permissions retrofit is the largest engineering item, but the plans write it as policy
**Severity: Critical**

**What the plans say:**
- There will be one central permission service covering 10 resource scopes, with inheritance, "restricted" breaks in inheritance, expiring grants, and no leaks through "counts, titles", search, autocomplete, WebSocket events or exports (V1:55–60, V2:79–85).
- V1:51 and V2:75 state that Paperclip's current membership rows "mainly control sidebar visibility" **(unverified)**.

**Why it matters (architectural concern):** If that claim is true, inherited queries are probably filtered by company only. Every inherited route, query, count, event and background job then has to be retrofitted. Missing a single one is a data leak, and the plans' main selling point is "company-grade resource permissions". The breadth of scopes and inheritance rules multiplies the testing burden.

**Fix:**
- **M0 inventory:** count routes, queries and event emitters, and publish the number.
- **Default-deny guard:** every route must declare its permission action; an undeclared route fails CI.
- **Query helpers:** scoped query helpers become the only permitted data access path for protected tables.
- **Automated leak tests:** for each endpoint and event type, check that the denied principal gets nothing and that counts are unchanged.
- **Optional defence in depth:** Postgres row-level security on the new Crewspan tables.
- **Narrower scopes for the preview:** organisation, project, restricted folder, conversation, agent and connection. Tasks, documents and assets inherit from their project. Grants on individual documents, assets, runs or tasks are deferred.

### 3. Single-VPS isolation is under-specified and partly contradicts itself
**Severity: Critical**

**What the plans say:**
- "Provision a per-run... isolated environment... without the host's... container-control socket. Restrict egress to required provider, Crewspan and authorised tool endpoints" (V1:91, V2:125).
- A "separate runner service" runs in Compose (V1:133, V2:179).
- Isolation is mandatory and fails closed (V1:93, V2:128).

**Why it matters (architectural concern):**
- **Where the privilege lives:** something has to create the per-run sandboxes. If the runner service creates them through the Docker socket, the runner is effectively root on the host. Neither plan says where that privilege sits.
- **Egress mechanism:** restricting outbound traffic to named domains needs an egress proxy and control over DNS. No mechanism is named.
- **Shared kernel:** all sandboxes on one VPS share the host kernel, so a container escape exposes everything. Stronger options such as Firecracker need nested virtualisation, which many VPS hosts don't offer **(unverified per provider)**.
- **Non-code work:** "any knowledge-work team" means research agents need web access, which the egress allowlist blocks. Web access isn't modelled as a grantable capability anywhere.

**Fix:**
- Name a reference stack. For example: rootless Podman or gVisor. The runner runs as a host daemon under a separate Unix user, outside the control-plane Compose network. Each run gets an egress proxy with its own allowlist.
- Add **web access**, **package registry** and **git host** as explicit egress capabilities that can be granted and appear in the dispatch preview.
- Write the remaining risks (shared kernel, exfiltration through allowed endpoints) into the threat model at V2:129.
- Make the isolation probe report (V2:179) block setup: until it passes, agents cannot be enabled.

### 4. Mounting git worktrees into sandboxes is a leak and escape path
**Severity: High**

**What the plans say:**
- "Use a separate Git worktree for parallel writable work. Treat the worktree as edit isolation and the runner as access isolation" (V1:92, V2:127).
- V2 adds Direct/Parallel modes, copying of uncommitted input, and "retain failed worktrees" (V2:126).
- Neither plan says how agents push code without host SSH keys (V1:91 removes the keys).

**Why it matters (architectural concern):**
- A worktree's `.git` is a pointer to the main repository's git directory. To use the worktree inside a sandbox, you have to mount that directory, which exposes all branches and objects and lets the agent write hooks and config.
- Any later git command run on the host in that repository can then execute code the agent planted.
- Copying uncommitted input is a pattern from Multica's local daemon. It doesn't fit a company-owned VPS pool of managed clones.

**Fix:**
- On the VPS, use a **per-run clone** inside the sandbox, made from a mirror that contains only the permitted refs. Don't mount host worktrees.
- Run every host-side git operation with hooks and config disabled (e.g. `core.hooksPath=/dev/null`).
- Issue short-lived push tokens scoped to one repository, per run.
- The preview supports Parallel mode only. Direct mode and uncommitted-input snapshots are deferred to personal runners.
- Add a retention and size limit for retained worktrees.

### 5. Persistent agent sessions and memory undermine "Project A cannot read Project B"
**Severity: High**

**What the plans say:**
- Success criterion 3 (V1:23, V2:44).
- An agent is a "persistent worker identity: role, instructions, skills, allocation... history" (V2:107).
- Agents can be shared across teams and pools (V1:49, V2:73).
- Neither plan mentions session resumption or agent memory.

**Why it matters (architectural concern):** If Paperclip resumes an agent's CLI session across heartbeats or tasks **(unverified)**, then one agent working on both A and B carries A's context into B's runs. Same if agent memory or instruction files are shared across projects. Filesystem isolation doesn't help, because the leak happens inside the model's context.

**Fix:**
- Key sessions and memory by (agent, project), or by (agent, task) for restricted work.
- Forbid resuming a session across scopes.
- Add "multi-project agent cross-scope recall" to the tests that must pass.

### 6. Authority through delegation chains, and for AI principals, is undefined
**Severity: High**

**What the plans say:**
- Managers can't expand their envelope (V1:58, V2:82).
- "Agents may propose requests but cannot approve their own expansion" (V1:66, V2:91). This only bans approving your *own* expansion.
- Context is limited to what both the agent and the "initiating human" may see (V1:76, V2:101).
- Job position is separate from permission role (V1:47, V2:71).

**What's missing:**
- Who the "initiating human" is for scheduled, webhook or agent-originated child runs.
- Whether an AI CEO or AI manager can approve *another* principal's access, credential or budget request, assign work to humans, or create agents.
- What "CEO" actually grants, given that position is separate from permission role.
- Who sits on the "Board" (V1:45, V2:69), and whether it has quorum rules or more than one member.

**Why it matters:** This is a confused-deputy risk: a low-privilege requester could work through a high-privilege agent, and an AI lead could approve other agents' expansions.

**Fix:** Add an authority table to V2 §2:
- **Scope only narrows:** a child run's effective scope is at most its parent run's effective scope.
- **Every run has a named originating principal:** the routine owner for schedules, the webhook's configured owner for webhooks, the parent run's principal for child work.
- **AI principals cannot approve** grants, credential use, budget increases, CEO appointments or agent creation.
- **The CEO role is defined:** specific default powers for a human CEO and for an AI CEO, with the Board able to override.
- **Board is defined:** its membership and approval rules.

### 7. The model for what triggers tasks and runs contradicts itself
**Severity: High**

**What V2 says, which doesn't fit together:**
- The task/run system is "the record of work" (V2:114).
- A mention "can invoke an agent without changing task ownership" (V2:115).
- A mention "creates a task-backed interaction" (V2:135).
- A DM "does not... create a task" (V2:136).
- Routines have a "Run only" mode (V2:143).
- "Task status and run status remain distinct" (V2:115), yet the same line gives one combined lifecycle mixing task and run states ("assigned → authorised → queued → running → result submitted → review → accepted").

**Also:** making Assign stop triggering a run may break Paperclip's current behaviour, which probably wakes an agent when you assign it work **(unverified)**. That would conflict with "Keep existing task and agent endpoints compatible" (V2:175).

**Why it matters:**
- DM-triggered and routine runs without tasks sit outside the cost-per-accepted-task measure (V2:119).
- They also sit outside review.
- They may sit outside the audit trail.

**Fix:**
- Publish a **trigger matrix**. Rows are trigger sources: assign, Start run, task comment mention, channel mention, DM, routine "Create task", routine "Run only", webhook, and child dispatch. Columns: creates a task? changes owner? starts a run? preview required? which budget is charged? who is the principal?
- Replace the single lifecycle with two separate state machines, one for tasks and one for runs. A run contains retry attempts.
- Every run without a task gets a lightweight "interaction" record for cost and audit.
- Put assign-without-wake behind a per-organisation compatibility setting.

### 8. Control over model, effort and budget can't be enforced for CLI and subscription adapters
**Severity: High**

**What the plans say:**
- A model policy resolver, fallback within the permitted set, and "complete cost attribution" (V1:86, V2:120, V2:193).
- Lanes carry a "model/effort envelope" (V1:83).
- Company runners use "organisation credentials and quotas" (V2:183).

**Why it matters (architectural concern):**
- **Enforcement:** CLI coding agents call providers directly and can choose their own sub-models. A policy is only as strong as the adapter flags, unless traffic goes through a metering proxy.
- **Cost:** subscription logins don't produce real per-dollar cost data, so "complete cost attribution" is really estimation.
- **Provider terms:** pooling one person's subscription across a team may breach the provider's terms **(unverified, external)**.
- **Data handling:** falling back to a different provider can change where data is processed and how long it's retained. That's a permissions question, not just a model-name question.
- **Effort:** effort means different things per provider and CLI.

**Fix:**
- Label every policy as **enforced (proxy)**, **enforced (adapter flag)** or **advisory**, and show that label on the dispatch preview.
- Label cost as **metered** or **estimated**.
- Add a data-handling class to each connection, and allow fallback only between connections in the same class.
- Add a table mapping each effort level to the actual setting per adapter.
- Require a documented check of provider terms before a subscription connection can be shared.

### 9. No strategy for staying mergeable with upstream, and migration risks
**Severity: High**

**What the plans say:**
- Sync is a process: "merge into a staging branch; run compatibility and visual checks" (V1:137, V2:184).
- "Migrations both ways where possible" (V1:148, V2:195).
- Preserve existing API behaviour (V1:14, V2:35).
- V1:51 cites an upstream request for hybrid humans (#11353), which means upstream may build the same features in its own way.

**Why it matters (architectural concern):**
- Paperclip's date-based release cadence looks frequent. The plans cite v2026.609 and v2026.916.x.
- Crewspan's changes touch auth, the org tree, the task lifecycle and execution.
- Drizzle's migration journal is sequential, so two migration histories developed in parallel will collide.
- If upstream ships its own human org nodes or permissions, the schemas will conflict.
- Drizzle doesn't normally generate down migrations **(unverified for this repo)**, so "both ways" is unrealistic. In practice, rollback means restoring a backup.

**Fix:**
- Add a **divergence strategy** section:
  - New Crewspan tables (e.g. with a `crewspan_` prefix) instead of changing upstream tables.
  - A separate migration stream, applied after upstream's migrations.
  - Crewspan logic in its own packages, with edits to upstream files limited to thin hooks, and a tracked count of changed upstream files.
  - A service-level target for applying upstream security fixes.
- Before forking, propose the permission and runner hooks upstream and comment on #11353.
- Rollback is defined as restoring a verified backup.

### 10. The revocation and "no duplicate charge" promises can't be kept as written
**Severity: Medium-High**

**What the plans say:**
- "Active agent runs holding revoked data are cancelled" (V1:57, V2:81).
- Retries do not "duplicate a charge" (V1:82, V2:115).

**Why it matters:** The system can't know what data a run is "holding". Data already sent to a provider or written to disk can't be recalled. And a retry always incurs real provider cost.

**Fix:**
- Revocation rule: cancel runs whose recorded policy snapshot includes the revoked grant, unmount or remove the affected inputs, and mark the outputs of those runs "produced under revoked access" so they get reviewed.
- Change "duplicate a charge" to "no duplicate dispatch; all retry cost is attributed to the same run".

### 11. Communication: agent-to-agent DMs, prompt injection and message privacy
**Severity: Medium**

**What the plans say:**
- Agent↔agent DMs (V1:98, V2:134) sit alongside loop guards that only apply to delegation (V2:117).
- Neither threat model mentions prompt injection (V1:90–94, V2:129), even though agents read channels, uploaded files and web content.
- Owners keep "audited administrative authority" (V1:80), but nobody says whether the owner can read private DMs.
- The daily digest (V1:100) implies email, which means SMTP setup for self-hosters.

**Fix:**
- Agents talk to each other only through tasks and child dispatch; defer agent↔agent DMs.
- Add prompt injection to the threat model, noting that the "scope only narrows" rule is the main mitigation.
- State the DM privacy policy, and show which provider will receive the content when an agent is in a conversation.
- Defer the digest.

### 12. V2 contradicts itself in places
**Severity: Medium**

- **Personal runners:** V2:203 requires a drill of "a revoked personal-runtime share", but V2:108, 192 and 209 defer personal runners.
- **Pilot size:** V2:40 says "at least two humans, two agents"; V2:201 says a three-person, three-agent pilot.
- **Duplicated guidance:** worktree guidance is repeated (V2:126 vs 127), and there are two overlapping runtime sections (V2:105 and V2:112).
- **Terminology:** success criterion 6 requires Paperclip's terminology (V1:26, V2:47), but the plans use "organisation" and "Board" and change "issue" to "task" (V1:114). It's unverified which terms Paperclip's UI actually uses.

**Fix:** Merge the two runtime sections, pick one pilot definition, move the personal-runtime drill to the post-release gate, and add a terminology table checked against the pinned UI.

### 13. The UX-continuity gate is subjective, and the permission model has no simple mode
**Severity: Medium**

**What the plans say:**
- New screens must pass "side-by-side review" and be rejected if they feel imported from another product (V1:116, V2:159).
- New screens are reviewed "beside its nearest Paperclip ancestor" (V2:204). Chat, People and Files have no ancestor.
- New organisations start with default-deny project access (V1:80), and V2:65 and V2:109 add seven factors that must all allow an action.

**Why it matters:** A three-person team would face setup work and confusing refusals.

**Fix:**
- **Objective checks:**
  - A lint rule allowing only tokens from `ui/src/index.css` **(path unverified)**.
  - No new UI building blocks without a Storybook story and design sign-off.
  - Screenshot diffs showing inherited screens are pixel-stable unless the compatibility map lists a change.
  - A named ancestor for each new screen (e.g. task comment thread → channel; agents list → People).
- **Presets:** an "Open team" preset (project-wide access by default) and a "Restricted" preset. The detailed permission matrix only appears when you open the effective-access panel.

### 14. Single-VPS operations are missing sizing and several lifecycle pieces
**Severity: Medium**

- There's no minimum VPS spec or concurrency target, yet the VPS runs:
  - PostgreSQL,
  - the app,
  - the runner,
  - per-run sandboxes,
  - upload scanning (V1:77),
  - search (V1:74).
- Retained failed worktrees grow the disk without limit (V2:126).
- "Back up the database, uploaded files and secrets key together" (V1:135, V2:181): if the key is stored with the backup, stealing the backup exposes everything.
- There's no plan for offboarding, i.e. what happens to a departing person's allocated agents, grants, tasks and personal connections.
- There's no 2FA or SSO/OIDC for owners, despite the "company-grade" claim.

**Fix:**
- Publish a reference VPS size with N concurrent runs.
- Make upload scanning optional.
- Encrypt backups with a key stored separately.
- Add offboarding and ownership-transfer flows.
- Make 2FA mandatory for owners before the preview; defer SSO.

### 15. Licensing and competitive-positioning risks
**Severity: Medium**

- V2's positioning depends on claims about Multica's documentation: its roles and access model, and that "default runs inherit the daemon user's filesystem" (V2:10, 20, 129). All of these are **unverified** and will go stale.
- V2 adopts Multica's vocabulary nearly verbatim: Direct/Parallel, "Create task" / "Run only", squad-style teams (V2:18, 126, 143).
- The Multica licence description (V2:22) is **unverified**.
- "Built on Paperclip" appears in the title, but MIT doesn't grant trademark rights.
- Branding clearance is deferred (V1:15), yet the repository will be public from day one.

**Fix:**
- Date-stamp and cite any competitor comparison, and keep them out of public marketing until they're re-verified.
- Adopt an explicit **clean-room rule**: implementers don't read Multica source.
- Use your own names for modes.
- Get a quick trademark check on "Crewspan" and on how "Paperclip" is used before the repository goes public.

---

## 3. What V2 got right and should keep

- **Assign and Start are separate everywhere.** This covers success criterion 7 (V2:48), the dispatch preview (V2:157), separate `assign/start/stop/retry/accept` operations each with its own permission and idempotency rules (V2:175), and the "Stop current run" choice on reassignment (V2:157).
- **Agent, runtime and run are separate records**, and moving an agent doesn't rewrite history (V2:107).
- **Permissions are checked at every stage:** when a task is drafted, queued and claimed, and on every tool call. Per-run tokens are short-lived and scoped, and are stripped from logs and child processes (V2:85). This is the single most important security addition.
- **Transactional claims, rejection of stale leases, and treating WebSocket messages as hints** with a database re-query after reconnect (V2:110, 175).
- **Offline runners show a waiting state**; there's no silent move to another machine or to an unsandboxed mode (V2:109).
- **Runs record their exact inputs:** repository revision, file versions and skill versions (V2:102, 142).
- **Local directory paths are canonicalised and checked, and symlinks and system locations are refused** (V2:102). Keep this for when personal runners arrive.
- **Private chat is separate from task work**, with "Turn into task" (V2:136).
- **The Inbox keeps read state separate from unresolved work** ("a run failure must still be visible after someone archives its notice") (V2:137).
- **A company runner pool comes first, and personal runners are gated** on consent, capability and isolation matching the company pool (V2:108, 192, 209).
- **Availability, busyness and permission are shown as separate states** (V2:65, 154).
- **Honest competitive framing and a licence boundary** (V2:8–10, 22). Keep them, but verify the claims first.
- **Delegation stays optional** if the measurements don't show it's better (V2:202), and the skill-improvement loop is opt-in and human-approved (V2:144, 211).
- **Release drills for failure states** (V2:203). Keep all of them except the personal-runtime drill.

---

## 4. The smallest credible release path

### M0: Baseline and decision spikes (go/no-go)
- Pin, build and screenshot the chosen Paperclip version.
- Publish the route/query/event inventory (finding 2).
- Run a sandbox spike on the reference VPS, using at least one CLI adapter with API-key auth and one with subscription auth, behind an egress proxy.
- Confirm whether assignment currently triggers a run, and whether agent sessions resume across tasks.
- Contact upstream about adding hooks.

**Exit gate:**
- The retrofit surface is measured and estimated.
- The isolation probes (neighbouring repository, host secret, forbidden endpoint) can be made to fail closed on the reference VPS.
- The divergence strategy is written down.
- **If either spike fails, stop and redesign before committing to the fork.**

### M1: Identity and scoped access
- Human and agent org nodes.
- CEO appointment, with the authority table from finding 6.
- Agent allocation.
- The central permission service with the route guard, over the reduced set of scopes.
- The Open/Restricted presets.
- Effective-access panel and access requests.
- Migration from an existing Paperclip install.

**Exit gate:** 100% of routes declare a permission action; generated leak tests pass for every endpoint and event type; an upgraded Paperclip install stays readable.

### M2: Contained company runner
- Per-run sandboxes, per-run clones (Parallel mode only), and scoped push tokens.
- An egress proxy with capability grants (including web access).
- Sessions scoped by agent and project.
- Transactional claims and stale-lease rejection.
- Fail-closed behaviour and a setup probe report.

**Exit gate:**
- Two projects run at the same time, and every cross-project read by filesystem, API, credential or recalled session fails.
- A lost runner recovers without duplicate dispatch.
- The reference VPS sustains the stated concurrency.

### M3: Triggers, delegation and model policy
- The trigger matrix and the two separate state machines.
- Child tasks where scope only narrows, with reviewer, acceptance criteria and caps on depth and number of runs.
- Model and effort allowlists, labelled enforced or advisory.
- Cost attribution, labelled metered or estimated.

**Exit gate:**
- A human-led and an agent-led delegation each reach human sign-off, including a "changes requested" round.
- A forbidden model fallback is blocked.
- Revoking a grant mid-run cancels the run and flags its outputs.

### M4: Minimum communication and files
- Project channels, human↔human and human↔agent DMs.
- Mentions with a preview that create a task.
- The Inbox built from "Mine".
- Project Files: folders, uploads, and versioned documents on existing storage.
- Full-text search that filters by permission.

**Exit gate:** the V2:201 pilot journey completes on desktop and narrow browser layouts.

### M5: Hardening → Public Preview
- Backup and restore (key stored separately), an upgrade from Paperclip, screenshot diffs, and an accessibility pass.
- Security model and limitations documents.
- An independent security review of the runner and permission service.

**Exit gate:** zero findings above Medium, and a fresh-VPS install completed by someone outside the team using only the docs.

### 1.0 and later (deferred)
- Threads, and agent↔agent messaging.
- Digest and email.
- Routines/webhooks beyond what Paperclip already has.
- Skill versioning and the improvement loop.
- Delivery-team re-wake.
- Personal and remote runners, Direct mode and uncommitted snapshots.
- An external router (9Router/OmniRoute).
- Semantic retrieval.
- Grants on individual documents, assets, tasks or runs.
- SSO/SCIM.
- AI-assisted agent setup.
- Native clients.

The cost comparison between delegated and direct work becomes instrumentation that ships in M3 and is measured after release, not a release gate.

---

## 5. Claims that need repository or external verification

**Paperclip:**
- `v2026.916.1` is the latest stable release (V1:11).
- Membership rows only control sidebar visibility (V1:51).
- Connections already separate who owns a credential and its grants from model selection (V1:86).
- Bubblewrap scope is off by default, and issue #11079 exists (V1:94).
- DESIGN.md contains the quoted priority, the tokens live in `ui/src/index.css`, and Storybook is used (V1:107–116).
- The existing "Mine" view, experimental chat and Inbox API (V1:101).
- The skill and routine facilities (V2:142–143).
- Whether assignment currently triggers a run.
- Whether sessions resume across tasks.
- Whether down migrations exist.
- Whether a plugin/hook system exists that could reduce the fork's footprint.

**Multica:** all of the following V2 claims.
- The licence terms (V2:22).
- The roles/access model (V2:10).
- The security model statement (V2:129).
- Direct/Parallel modes (V2:126).
- Squads (V2:117).
- Autopilots (V2:143).
- Issue #4433 (V2:144).

**External:**
- Provider terms for sharing a subscription login inside a team.
- Whether the target VPS hosts support nested virtualisation or gVisor.
- Licences for Buzz, 9Router and OmniRoute, in case any code is borrowed later.
- Trademark clearance for "Crewspan" and permitted use of "Paperclip".

---

## 6. Top five edits to V2 now

1. **Replace V2:188 with two gates.** Define a Public Preview gate and a 1.0 gate using Section 4. Move the routines/skills/webhooks items in V2:194 and V2:197, and the personal-runtime drill in V2:203, to the deferred list.
2. **Add an "Authority and triggers" section after V2:92**, containing:
   - the trigger matrix,
   - separate task and run state machines (replacing the combined lifecycle in V2:115),
   - the rule that scope only narrows down a delegation chain,
   - a named originating principal for every run,
   - the list of things AI principals can't approve,
   - definitions of the CEO role and the Board.
3. **Rewrite the isolation section (V2:124–130).** Name the reference sandbox and egress stack and where the runner's privilege lives. Replace host worktrees with per-run clones and scoped push tokens, and make VPS execution Parallel-only. Add sessions scoped by agent and project, egress capabilities (including web access), prompt injection, and the remaining risks.
4. **Add an M0 decision gate and a divergence strategy to V2:184 and V2:190.** Cover the route/query inventory, the permission guard enforced in CI, separate Crewspan tables and migration stream, contributing hooks upstream, and rollback by restoring a backup. Mark every Paperclip claim in the plan as "verify at M0".
5. **Add enforcement and cost labels to the model policy (V2:120, 193).** Label policies enforced or advisory and costs metered or estimated, add data-handling classes for fallback and the effort mapping table, and require a check of provider terms for shared subscriptions. Also correct the revocation and "no duplicate charge" wording in V2:81 and V2:115.
