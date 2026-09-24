# Fork Boundary: Crewspan vs upstream Paperclip

Status: M0 fork-boundary inventory as of 2026-09-24. Owner: Thoth (product). Issue: CRE-4.

Baseline: Paperclip `v2026.916.1` at `d554c4789ed3930f8a53ac9fdf6503b3187097da`.
This is a source and local-runtime inventory, not the complete M0 gate in the
[v3 plan](plans/2026-09-24-crewspan-e2e-v3.md#3-milestone-0-current-state-verification-and-go-no-go-spikes).

This document does two things:

1. Catalogues what is still **Paperclip-branded** across user-facing surfaces, grouped by how
   expensive and how safe a rename is.
2. Records where Crewspan **tracks upstream Paperclip** and where it **deliberately diverges**,
   so every future change has a default answer instead of a per-PR argument.

It is a reference document, not a plan. Rebranding work items are listed in
[Follow-up work](#8-follow-up-work); the ones marked **decision needed** are blocked on the owner.

---

## 1. Headline finding

**Crewspan has a pinned Paperclip baseline and an uncommitted M0 change set.** The base commit
is an upstream release; the working tree already contains Crewspan setup, planning documents,
Codex model discovery, OpenCode Go connection support, and Windows runner fixes. Calling the
current fork a straight mirror would conceal real changes awaiting review and commit.

| Measurement | Value |
| --- | --- |
| Tracked files mentioning `paperclip` (case-insensitive) | 4,685 of 7,434 (63%) |
| Total `paperclip` matches, tracked files | ~45,600 |
| Tracked files mentioning `crewspan` at the base commit | **0**; working-tree additions now mention it |
| Fork-local commits on the working branch `m0/paperclip-v2026.916.1` | 0 at this inventory; the current Crewspan changes are uncommitted |
| Working tree at this inventory | 29 modified tracked files and 13 untracked files (`git status --short`); review these before any sync or release |

These grep-derived branding counts describe the pinned commit, not the updated working tree.
They measure search surface, not the number of changes Crewspan should make.

### Fork topology

```
upstream  https://github.com/paperclipai/paperclip.git   (read-only source of truth)
origin    https://github.com/sico-vibes/crewspan.git     (our fork; master mirrors upstream today)
```

Local branches: `master` (tracks `origin/master`), `m0/paperclip-v2026.916.1` (points at release
tag `v2026.916.1`, tracks `origin/m0/paperclip-v2026.916.1`). `upstream` is configured but its
current tip has not been verified in this inventory. See §7.

### Product and UI surface already present in the pinned checkout

| Inherited capability | Evidence in this checkout | M0 boundary |
| --- | --- | --- |
| Company, agent tree, project and task control plane | `ui/src/App.tsx` routes for dashboard, agents, projects and issues; `server/src/routes/agents.ts`, `server/src/routes/projects.ts` | Extend these records and views. The Crewspan human org and scoped authority model are still planned, not inherited. |
| Project workspaces and local repository paths | `server/src/routes/projects.ts` project-workspace CRUD and runtime commands; `packages/adapters/codex-local/src/server/execute.ts` workspace resolution | A path selects an execution location; it is not proof that an agent is confined to that folder. The local `C:\Crewspan` workspace currently grants a working directory, not a tested isolation boundary. |
| Reviews, run history, activity, budgets, Inbox, Artifacts | `ui/src/App.tsx` routes for approvals, activity, costs, budgets, inbox and artifacts | Keep these operational views and add human access controls through the existing UI. Their current existence does not establish per-human resource isolation. |
| Experimental agent chat | `ui/src/App.tsx` route `chats/:agentRef` | Buzz-style human channels, DMs, mentions and access rules are future Crewspan work. |
| Connections and adapter model selectors | `ui/src/App.tsx` apps routes; `server/src/routes/agents.ts` model route; `server/src/routes/ai-connections.ts` | M0 fixes added live Codex catalog fallback and a distinct OpenCode Go connection. A model picker is not an enforced per-person entitlement or usage gateway. |
| Design system and Storybook | `DESIGN.md`, `ui/src/index.css`, `ui/src/components/ui/`, `ui/package.json` Storybook scripts | Preserve the Paperclip layout and component language. Add Crewspan flows with existing tokens, components and navigation patterns. Visual baseline screenshots and Storybook build remain M0 work. |

The UI currently calls the accountable work item an **issue/task** in routes and code (`/issues`,
`/tasks` redirect). The v3 term table and complete screen inventory are still pending.

---

## 2. How to read the tiers

Renaming "Paperclip" is not one job. It is four jobs with very different risk profiles. Every
surface in §3 is tagged with one of these tiers.

| Tier | Meaning | Rename cost | Rename risk |
| --- | --- | --- | --- |
| **A — Cosmetic** | Text and images a user reads. Changing it changes nothing else. | Low | Low |
| **B — Operational** | Identifiers an operator types or a machine persists (env vars, paths, service names). Renaming works but strands existing installs. | Medium | Medium — needs a compat shim |
| **C — Ecosystem** | Identifiers shared with things outside our repo (npm scope, wire headers, protocol schema URLs, third-party OAuth registrations). Renaming breaks interop. | High | **High — do not rename casually** |
| **D — Hosted service** | Points at a server Paperclip operates. We cannot rename these; we can only replace, disable, or keep depending on Paperclip. | N/A | **Product + privacy decision, not a rename** |

---

## 3. Branding inventory by surface

### 3.1 Tier A — cosmetic, user-visible

| Surface | Where | Current state |
| --- | --- | --- |
| Browser tab title, PWA title | `ui/index.html` (`<title>`, `apple-mobile-web-app-title`) | `Paperclip` |
| Web app manifest | `ui/public/site.webmanifest` | `name` / `short_name` = `Paperclip`; description = "AI-powered project management and agent coordination platform" |
| Favicons, touch icons, Android icons | `ui/public/favicon*.{ico,svg,png}`, `apple-touch-icon.png`, `android-chrome-*.png` | Paperclip mark |
| In-app wordmark / logo | `ui/src/components/PaperclipLockup.tsx`, `ui/src/components/AnimatedPaperclipIcon.tsx` | Paperclip lockup + animated paperclip glyph |
| UI copy | `ui/src/**/*.tsx` (non-test) | **182 distinct quoted strings** containing "Paperclip" — error toasts ("Paperclip could not save the routine."), auth copy ("Sign in to Paperclip", "Create your Paperclip account"), labels ("Paperclip host", "Managed by Paperclip", "Paperclip Runner") |
| README and banner | `README.md`, `doc/assets/banner.jpg` | Paperclip banner image and product copy |
| Product docs | `doc/**` — 191 files, ~4,800 matches | Written as Paperclip throughout, incl. `GOAL.md`, `PRODUCT.md`, `SPEC.md`, `SPEC-implementation.md` |
| CLI output copy | `cli/src/**` — 150 files, ~2,000 matches | e.g. "The Paperclip database is not running or reachable…" |

There is **no white-label hook to lean on.** `server/src/ui-branding.ts` looks like one, but its
markers (`PAPERCLIP_RUNTIME_BRANDING_START`, `PAPERCLIP_FAVICON_START`) exist only to tint the
favicon and title bar for *worktree previews* — it is gated on `PAPERCLIP_IN_WORKTREE` and returns
a no-op otherwise. It cannot carry a product rename. Making it a real branding layer would be new
work, and it would be a Tier-B divergence from upstream.

### 3.2 Tier B — operational identifiers

| Surface | Where | Current state | Rename hazard |
| --- | --- | --- | --- |
| Env var namespace | Repo-wide | **~520 distinct `PAPERCLIP_*` identifiers** across `server/`, `packages/`, `cli/`, `scripts/` | Every existing `.env`, systemd unit, and launchd plist breaks. Needs a dual-read shim if renamed. |
| Home / data directory | `cli/src/config/data-dir.ts`, `cli/src/services/service-manager.ts` | `~/.paperclip-home/` and instance subtrees | Existing installs' databases, workspaces, and credentials live here. A rename is a migration, not a find-and-replace. |
| CLI binary name | `cli/package.json` → `bin: { paperclipai }` | `paperclipai` | Also baked into help text, error messages, and the managed shim at `~/.local/bin/paperclipai`. |
| systemd / launchd service ids | `cli/src/services/service-manager.ts` | `paperclipai.service`, `ing.paperclip.paperclipai` | Renaming orphans running services on upgrade. |
| Browser localStorage keys | `ui/index.html` (`paperclip.theme`) and callers | `paperclip.*` | Users silently lose theme/UI prefs on rename. Low stakes, but it is a visible regression. |
| Agent-facing runtime skills | `skills/paperclip/`, `skills/paperclip-board/`, `skills/paperclip-create-agent/`, `skills/paperclip-converting-plans-to-tasks/` | Named and written as Paperclip | Skill names are referenced by agent instructions and materialized session paths. |
| Root workspace package name | `package.json` → `"name": "paperclip"` | `paperclip` | Private package; safe, but `pnpm --filter` targets across scripts assume the scope. |

### 3.3 Tier C — ecosystem identifiers (do **not** rename without a specific reason)

| Surface | Where | Current state | Why renaming is expensive |
| --- | --- | --- | --- |
| npm scope | 13 of 15 workspace packages: `@paperclipai/server`, `/ui`, `/db`, `/shared`, `/adapter-utils`, `/mcp-server`, `/skills-catalog`, `/teams-catalog`, `/paperclip-runner`, `/paperclip-eval-kernel`, `/google-sheets-mcp-server`, `/kv-demo-mcp-server`, `/tailscale-https-broker` | `@paperclipai/*` | Published scope. Renaming means we own publishing, versioning, and the update channel — see §3.4 npm. |
| HTTP wire headers | `server/`, `packages/`, `cli/`, `ui/` | `X-Paperclip-Run-Id`, `X-Paperclip-Signature`, `X-Paperclip-Route`, `X-Paperclip-Publication-Id`, `X-Paperclip-Request-Cache`, `X-Paperclip-Tab-Visible`, `X-Paperclip-Dev-Server-Status-Token` | Renaming breaks any agent, adapter, or webhook consumer built against the documented API. `X-Paperclip-Signature` in particular is a webhook contract with third parties. |
| PRP protocol schema URLs | `packages/adapter-utils/src/**` | `https://paperclip.dev/schemas/prp/v1/*`, `.../v2/*` — ~300 references | These are **protocol identifiers, not links**. They identify the Paperclip Runner Protocol version an adapter speaks. Changing them forks the protocol and breaks every adapter. Treat as frozen. |
| Third-party OAuth app registrations | `packages/*/src` connector definitions, `doc/connections/` | Connectors are registered with providers under Paperclip's identity | Re-registering each connector under a Crewspan identity is per-provider work with its own review queues. |

### 3.4 Tier D — hosted Paperclip services

These are not branding. They are live network dependencies on infrastructure Paperclip operates.
Each needs a **keep / replace / disable** decision, and each one we keep means Crewspan users are
talking to Paperclip's servers.

| Dependency | Endpoint | Default | Notes |
| --- | --- | --- | --- |
| **Telemetry** | `https://telemetry.paperclip.ing/ingest` (+ an AWS API Gateway fallback) | **On by default (opt-out)** | Per `AGENTS.md` §5.7 this is the first-party event path. Opt-out is `PAPERCLIP_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`; endpoint override is `PAPERCLIP_TELEMETRY_ENDPOINT`. **Highest-priority decision in this document** — shipping Crewspan as-is sends Crewspan usage data to Paperclip. |
| **Announcements feed** | `https://pages.paperclip.ing/announcements/v1/current.json` (`DEFAULT_ANNOUNCEMENT_FEED_URL` in `packages/shared/src/announcements.ts`) | On | Paperclip's product announcements render inside the Crewspan board. Visible, off-message, and outside our editorial control. |
| **Paperclip Cloud** | `https://app.paperclip.app`, `https://id.paperclip.app`, `https://my.paperclip.app` | Gated | Sign-in handoff, connector enrollment, tenant/portfolio control. Gated behind `PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN` and related env; inert when unset, but the UI still carries Cloud copy and the `PaperclipCloudOAuthHandoff` page. |
| **npm update channel** | `registry.npmjs.org`, package `paperclipai` + scope `@paperclipai` | On | `cli/src/commands/update.ts` self-updates from Paperclip's published package. As long as this is live, `crewspan update` would pull Paperclip's build over ours. |
| **Docs site** | `https://docs.paperclip.ing/`, `https://paperclip.ing` | Linked from UI | Cosmetic once we have our own docs; until then these are the only docs that exist. |

The **observability** path (OpenTelemetry, `server/src/instrumentation.ts`) is *not* in this table:
it is a no-op until an operator sets an OTLP endpoint, and it never points at Paperclip. The
**run log** (`heartbeat_run_events`) never leaves the instance database. Per `AGENTS.md` §5.7,
do not conflate these three paths.

---

## 4. Track-vs-diverge policy

Default posture: **track upstream aggressively, diverge narrowly.** Upstream Paperclip ships fast
The pinned release already sits behind `origin/master`, so every fork patch must be reviewed at
each upstream sync. The risk is repeated conflicts in shared code, particularly security and
authorization paths. The MIT license in `LICENSE` permits a fork but does not reduce that cost.

| Surface | Posture | Rationale |
| --- | --- | --- |
| Control-plane invariants — task ownership, checkout atomicity, approvals, budget hard-stop, activity log | **Preserve and extend.** | The v3 human and agent flows need new states and guards, but must retain these safety properties. |
| Schema and migrations (`packages/db`) | **Additive divergence is expected.** | Human membership, scoped access, resources and delegation require new data. Avoid renaming inherited columns; rehearse migration conflicts against upstream. |
| Adapters, PRP protocol, wire headers | **Keep protocol compatibility; extend adapters only when needed.** | M0 already changes Codex discovery and Windows runner handling. The future model gateway and isolation hooks require measured extensions. |
| Server routes, services, UI components | **Reuse and extend.** | Crewspan's permissions, human organization, communication and files require changes here. Extract thin hooks upstream where maintainers accept them. |
| Tier A branding — title, manifest, icons, lockup, UI copy | **Later, contained divergence.** | The product will be Crewspan, while the current M0 UI remains Paperclip. Reuse the design system; defer broad rename until its own milestone. |
| Tier D hosted services — telemetry, announcements, npm update channel | **Diverge — and treat as urgent.** | Keeping upstream defaults means Crewspan users send data to and take content from Paperclip. Not a branding preference; a product and privacy position. |
| Tier B operational identifiers — env vars, home dir, binary name, service ids | **Decision needed.** Default: **track** (keep `PAPERCLIP_*`) until a user-facing reason forces a rename. | Renaming buys cosmetics and costs a migration plus permanent merge conflicts in ~520 identifiers. Operators see these; end users mostly do not. |
| Tier C npm scope | **Decision needed.** Default: **track** (`@paperclipai/*`, unpublished) unless Crewspan publishes its own packages. | Renaming only pays off if we take over publishing. See §6. |
| `doc/` product docs | **Diverge selectively.** New Crewspan docs are ours; upstream docs stay upstream-worded until the surface they describe diverges. | Wholesale doc rewrite is 191 files of guaranteed merge pain for zero user-visible gain. Per `AGENTS.md` §5.4, prefer additive updates. |

---

## 5. Containing divergence

Two rules make the Tier-A rebrand survivable across merges.

**Rule 1 — Centralize before you rename.** Do not bulk replace UI strings. First inventory the
visible surfaces, then use a small product-brand configuration where it reduces repeated edits.
`server/src/ui-branding.ts` is currently a worktree tint hook, so reusing it needs a separate
design decision and tests. Branding must leave protocol and persisted identifiers intact.

**Rule 2 — Prefer config over code.** Anything already overridable by env (telemetry endpoint,
announcement feed URL, Cloud tokens) should be diverged by shipping different *defaults or
deployment config*, not by editing the code path. Zero merge conflicts, instant revert.

Corollary: use additive files and narrow extension points when they fit the inherited API and UI.
New files still need compatibility tests and can conflict semantically with future upstream work.

### Merge discipline

- Keep a pinned baseline and record each upstream update in `UPSTREAM.md` when the M0 sync
  rehearsal begins. The working branch carries Crewspan changes; do not assume `origin/master`
  remains a clean mirror without verifying both remotes.
- Rehearse a sync on an isolated branch, measure conflicts and tests, and follow the v3 M0 gate.
- Propose generalizable fixes upstream where appropriate; do not depend on upstream acceptance
  before fixing the local M0 baseline.

---

## 6. Open decisions (owner sign-off needed)

Ranked by cost of delay.

1. **Telemetry.** Disable, self-host, or keep sending to `telemetry.paperclip.ing`? The pinned
   source defaults to enabled; confirm effective local and VPS configuration before claiming any
   data was sent. Disable it for the reference VPS probe unless the Board chooses otherwise.
2. **Announcements feed.** Point at our own feed, or disable? Today Paperclip's product
   announcements appear in the Crewspan UI.
3. **Update channel.** Does Crewspan publish its own CLI, or keep consuming `paperclipai` from
   npm? This answer determines the npm-scope question and the binary-name question — resolve it
   first and the other two follow.
4. **Brand implementation depth.** Crewspan is a product fork per the v3 plan. Decide which
   operational and package identifiers need migration, and when, without treating a cosmetic skin
   as an alternative product goal.
5. **Paperclip Cloud.** Keep the gated integration and its UI copy, or strip it? It is inert
   without the tenant token, but it is visible in the Connections and sign-in surfaces.

These are product decisions, not engineering ones. I have not made them; §4 records my recommended
defaults so work is not blocked, and each is marked "decision needed" where the recommendation is
weak.

---

## 7. Known gaps in this inventory

Stated plainly so nobody treats this as more complete than it is.

- **Live upstream tip and sync cost are unverified.** The remote exists, but this inventory did
  not fetch or rehearse a merge. The v3 S2 gate still needs its own evidence.
- **Counts are grep-derived.** The ~45,600 figure counts every mention, including tests,
  fixtures, and generated files. It measures blast radius, not work items. The 182-string UI
  figure is the better proxy for actual rebrand effort on the primary surface.
- **Connector OAuth registrations are not enumerated per provider.** §3.3 flags the category;
  the per-connector list would follow `doc/connections/CONNECTOR-PLAYBOOK.md` and is its own task.
- **No visual audit.** Paperclip branding baked into images (`doc/assets/banner.jpg`, adapter and
  app brand SVGs under `ui/public/brands/`) was inventoried by filename, not by opening each asset.
- **The local Windows agent run is not an isolation proof.** The project workspace is linked to
  `C:\Crewspan`; Codex CLI starts, loads the Paperclip skill and receives managed MCP config, but
  its `workspace-write` command execution is rejected by local policy before repository reads.
  The agent was paused after this repeatable failure. Do not loosen sandbox or approval settings
  to make this inventory pass. The v3 S3 containment test is explicitly for the reference VPS.
- **The wider M0 inventories and gates remain open.** This document does not claim complete
  route/query/event/job/auth inventories, screenshots, visual regression, VPS deployment, sync
  rehearsal, S1-S8 spikes, model enforcement or go/no-go approval.

---

## 8. Follow-up work

Future work to schedule after the M0 gate. These are not child issues or authorized current work.
Sequence matters: #1 informs #3–#5.

1. **Decide the brand migration sequence** — Crewspan is already a product fork; choose which
   visible and operational identifiers change at each later milestone. *No code in CRE-4.*
2. **Cut the live dependencies on Paperclip infrastructure** — §6 items 1 and 2, telemetry and
   announcements, via deployment config rather than code edits. Independent of #1 and the most
   urgent item here.
3. **Build a real branding layer** — extend `server/src/ui-branding.ts` per §5 Rule 1, so the
   product name, wordmark, icons, and doc links resolve from one config. Depends on #1.
4. **Apply Tier-A rebrand through that layer** — title, manifest, icons, lockup, the 182 UI
   strings. Depends on #3.
5. **Set up upstream sync tooling** — fetch `upstream`, document the sync cadence, add a
   divergence report so the conflict tax stays visible. Depends on nothing; do it early.

---

## 9. Related documents

- `AGENTS.md` — contributor rules; §5.7 defines the telemetry / observability / run-log split
  referenced in §3.4.
- `doc/SPEC-implementation.md` — the V1 build contract Crewspan currently inherits unchanged.
- `doc/GOAL.md`, `doc/PRODUCT.md` — upstream product framing; Crewspan's own contract is CRE-5.
- `doc/connections/CONNECTOR-PLAYBOOK.md` — required reading before touching connector identity.
- `DESIGN.md` — token-only rule; any Tier-A UI work must comply and pass
  `pnpm check:token-gates`.
