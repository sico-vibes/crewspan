# M0 term table — Crewspan terms against the inherited Paperclip UI

Status: M0 evidence artifact (`CREW-10`, deliverable 1). Scope authority:
[`doc/plans/2026-09-24-crewspan-e2e-v3.md`](plans/2026-09-24-crewspan-e2e-v3.md)
§2.6 (terminology) and §3.1.

Baseline cited: fork `main` at `49cac8af8` (Board decision, 2026-09-29 —
reference instance). Upstream provenance pin: `v2026.916.1` (`d554c4789`),
recorded in [`UPSTREAM.md`](../UPSTREAM.md) and [`M0-SETUP.md`](../M0-SETUP.md).

## 1. Why this table exists

§2.6 states the rule: "The UI uses the words of the pinned Paperclip release.
The plan writes 'company', 'Board', 'task' and 'agent' for readability. M0
produces a term table checked against the pinned UI." The plan's own "task"
must become whatever the pinned UI actually shows.

This table is the left-hand column for Crewspan when it later diverges the copy
(§12.4) and for the §3.2 inventories. It is descriptive: it records the words
the inherited build already uses. It does not rename anything, and it does not
introduce a Crewspan term into the UI.

## 2. Method

The pinned UI labels below were read from the reference build's own source in
this checkout (fork `main` at `49cac8af8`), not from memory. Each row cites
`path:line`. Where the plan term and the UI label differ, the difference is the
finding. The route/API identifiers are listed separately because a UI rename
does not rename them.

## 3. Inherited Paperclip terms

| Plan term | UI label (as shown) | Route / API identifier | Evidence | Note |
|---|---|---|---|---|
| company | company name in the switcher; nav sections labelled **Org** / **Organization** | `company/*` routes, `companies` API | `ui/src/components/Sidebar.tsx:134` (`SidebarCompanyMenu`); `:240` section label `Org`; `:260` section label `Organization`; `:263` `label="Org"` | The tenant is "company" in code and "organization"/"org" in the shell. §4 uses "company"; the UI already uses "org" for the same object. |
| Board | **Board** | actor type `user`; `local-board` id | `ui/src/components/ActivityRow.tsx:53`; `ui/src/lib/assignees.ts:95`; `ui/src/lib/company-members.ts:15` | The plan's "Board" is already the UI word for the human/operator actor. |
| task (issue) | **Tasks** (list) / **New Task** (create) | `/issues`, `issues` API, `PAP-###` identifiers; bare `/tasks` redirects to `/issues` | `ui/src/components/Sidebar.tsx:196` (`label="Tasks"`), `:151` (`New Task`); `ui/src/pages/Issues.tsx:140`; `ui/src/components/MobileBottomNav.tsx:47`; `ui/src/App.activity-routing.test.tsx:257-260` (`/tasks` → `/issues`) | The main §3.1 check: the plan's "task" is **Tasks** in the UI while the code/route stays `issues`. |
| agent | **Agents** | `/agents`, `agents` API | `ui/src/components/Sidebar.tsx:243` | — |
| project | **Projects** | `/projects`, `projects` API | `ui/src/components/Sidebar.tsx:199` | — |
| goal | **Goals** | `/goals`, `goals` API | `ui/src/components/Sidebar.tsx:211-212` | Gated behind the `enableGoalsSidebarLink` experimental flag; hidden by default. |
| routine | **Routines** | `/routines`, `routines` API | `ui/src/components/Sidebar.tsx:203` | — |
| work product / artifact | **Artifacts** | `/artifacts`, work products | `ui/src/components/Sidebar.tsx:204` | The plan's "accepted result" (work product, §7.4) surfaces here. |
| connection / application | **Connectors** | `/apps`, `ai-connections` API | `ui/src/components/Sidebar.tsx:245`, `:264` | Plan §6.2 "Applications and connections" maps to **Connectors**. |
| skill | **Skills** | `/skills` | `ui/src/components/Sidebar.tsx:244` | — |
| activity log | **Audit** (streamlined) / **Activity** (legacy) | `/activity` | `ui/src/components/Sidebar.tsx:246`, `:267` | One route, two labels depending on the streamlined-navigation flag. |
| cost / budget | **Costs** | `/costs`, budgets API | `ui/src/components/Sidebar.tsx:266` | Non-streamlined nav; plan §6.3 budgets. |
| Inbox / Mine | **Inbox** | `/inbox`, attention feed | `ui/src/components/Sidebar.tsx:171` | Plan §11.7 "Actionable Inbox (evolved from 'Mine' [M0])" — the pinned UI already shows **Inbox**. |
| dashboard | **Dashboard** | `/dashboard` | `ui/src/components/Sidebar.tsx:168` | — |
| org chart | **Org** | `/org` | `ui/src/components/Sidebar.tsx:263` | The inherited chart is a tree of agents; §4 changes it to a tree of seats. |

## 4. New Crewspan terms (not yet in the UI)

§2.6 lists ten new Crewspan concepts and the UI labels they should carry. They
are commitments for a later milestone (§4–§11), not inherited words: the
reference build has no product surface that implements the concept behind each
planned label. Recorded here so the source of truth for each planned label is
one document. (This is a design intent, not a grep result; the §3.2 inventories
that would confirm surface-by-surface are not yet produced.)

| Concept (plan term) | Planned UI label | First defined | Present in reference build? |
|---|---|---|---|
| Envelope | **Limits** | §2.6, §4.6 | No |
| Allocation | **Allocated to** | §2.6, §5 | No |
| Steward | **Steward** | §2.6 | No |
| Grant | **Access** | §2.6, §5 | No |
| Interaction | **Chat request** | §2.6, §11 | No |
| Delivery team | **Team** | §2.6, §8.2 | No |
| Runtime pool | **Runner pool** | §2.6, §9 | No |
| Isolation grade | **Isolation** | §2.6, §9.12 | No |
| Dispatch preview | **Before you start** | §2.6, §7.6 | No |
| Funding budget | **Charged to** | §2.6, §6.3 | No |

The product contract's own term set (Person, Agent, Worker, Principal, Seat,
Team, Allocation, Accountable person, Board) is fixed in
[`doc/CREWSPAN-PRODUCT-CONTRACT.md`](CREWSPAN-PRODUCT-CONTRACT.md) §3. Where
those terms name things that already exist in the UI, the inherited label in §3
above governs until a milestone deliberately diverges the copy (§12.4).

## 5. Watch-outs for later copy work

1. **`task` vs `issue`.** The UI says **Tasks** but every route, API path,
   identifier prefix (`PAP-###`) and schema table says `issue`. Copy changes in
   §12.4 must not assume a code/route rename follows.
2. **`company` vs `org`.** The tenant is a "company" in code; the shell presents
   it as an organization/org. §4's seat tree will render inside `/org`, which
   today shows the agent tree.
3. **`Board`.** Already a real UI label for the human actor, so §4's "board is a
   role held by people" does not need a new word.
4. **Experimental gating.** Goals, Decisions, Status, Cases, Pipelines,
   Workspaces and Conference Room are flag-gated
   (`ui/src/components/Sidebar.tsx:92-112`, `:178-222`); their labels are not
   guaranteed to be visible in a default install.
