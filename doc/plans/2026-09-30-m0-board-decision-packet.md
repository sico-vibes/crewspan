# Crewspan M0 Board decision packet

Status: prepared for the Board, 2026-09-30 (UTC). Author and owner: Crewspan QA &
Release (agent), issue `CREW-6`.
Scope authority: [`doc/plans/2026-09-24-crewspan-e2e-v3.md`](2026-09-24-crewspan-e2e-v3.md)
§3.1, §3.4, §13.7, §13.9, §13.11, §6.3.

**No decision in this packet has been made by the agent.** This document lists the
options, the recommendation-neutral tradeoffs, the evidence, and the required
approver. It records what the Board has *already* decided (section 1) so those
items are not re-opened, and the decisions still *open* (section 2). It contains
no credentials, secrets, keys, tokens, or private environment-file contents.

## How to read this packet

- **Required approver** is the lowest authority that can make the call. For every
  item below that is the **Board** (the human owner context, `doc/CREWSPAN-PRODUCT-CONTRACT.md`
  §3, §6.4). Two items additionally need a privacy review before a default ships
  (`AGENTS.md` rule 7).
- **Tradeoffs are stated flat**, not ranked. No option is recommended here.
- Every open decision names the repository section or the verified instance/VPS
  observation that grounds it.

### Evidence basis

| Evidence | Where |
|---|---|
| Fork boundary and hosted-dependency inventory (tiers A–D, open decisions) | `doc/FORK-BOUNDARY.md` §2–§6 |
| Upstream pin, disposition record, re-pin recommendation | `UPSTREAM.md` §2, §6, §9 |
| Product contract, governance, and owner open questions | `doc/CREWSPAN-PRODUCT-CONTRACT.md` §6.4, §11 |
| Deployment/auth/exposure runbook | `docs/deployment/CREWSPAN-VPS-MIGRATION.md` §1, §4, §5, §6, §10 |
| Deployment-mode definitions in the pinned source | `docs/deploy/deployment-modes.md` |
| Local reference service-mode disposition (verified) | `CREW-11` final operator comment, 2026-09-30 |
| Backup + restore rehearsal and D3 placement (verified) | `CREW-9` report, 2026-09-30 |
| M0 evidence corpus (inventories, design baseline, term table, threat model, trademark screen, §3.4 unknowns) | `CREW-2`, `CREW-8`, `CREW-10` artifacts |

## 1. Already recorded by the Board (do not re-open)

These were decided on 2026-09-29/2026-09-30 and are cited here only so the open
items in section 2 do not duplicate them. Authority: `UPSTREAM.md` §9.

| # | Item | Recorded decision | Evidence |
|---|---|---|---|
| D1 | Reference instance definition | Fork `main` at SHA `49cac8af8` is the M0 reference build. The upstream **provenance** pin stays `v2026.916.1` (`d554c4789`); §3.1's "unchanged baseline" clause applies to the upstream build/test evidence, not the deployment. | `UPSTREAM.md` §9.1 |
| D4a | Auth mode | `authenticated` (supersedes the `local_trusted` default). | `UPSTREAM.md` §9.2 |
| D2 | Service mode target | Production start (`server start` on the built workspace); dev is an explicitly recorded temporary deviation until the workspace builds on the reference host. | `UPSTREAM.md` §9.3 |
| D3 | Off-host backup | Encrypted off-host copy, 7 daily + 4 weekly retained, Board-owned, plus a documented restore rehearsal. Destination and custody named in D3 (2026-09-30): `/var/backups/crewspan/` on `zero1-contabo` (root-only), AES-256-GCM, key kept Board-side and separate. | `UPSTREAM.md` §9.4; `CREW-9` report §7 |
| — | M0 gate | M0 closes before M1; no M1–M7 implementation until the §3.5 go/no-go is recorded. | `UPSTREAM.md` §9.5 |

Related, not in this packet: the **M0 go/no-go** itself is `CREW-5`
(§3.5 / §14), not `CREW-6`.

## 2. Open Board decisions

### B1. Telemetry

- **Question.** Ship Crewspan's first-party telemetry to Paperclip's endpoint, disable
  it, or point it at a Crewspan-controlled endpoint?
- **What runs today.** Telemetry is **on by default** (opt-out). The default ingest
  endpoint is `https://telemetry.paperclip.ing/ingest` (`packages/shared/src/telemetry/client.ts:15`),
  overridable by `PAPERCLIP_TELEMETRY_ENDPOINT` (`packages/shared/src/telemetry/config.ts:84`)
  and disabled by `PAPERCLIP_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`. A second
  hosted dependency, the feedback/share path, also defaults to
  `https://telemetry.paperclip.ing` (`server/src/services/feedback-share-client.ts:5`).
- **Options and tradeoffs.**
  - *Keep (ship as-is):* no work; but Crewspan usage data leaves for a Paperclip
    endpoint by default. Flagged in `doc/FORK-BOUNDARY.md` §3.4 as the
    highest-priority privacy decision.
  - *Disable (deployment default):* achieved by shipping a different default /
    deployment config, not by editing the code path (`doc/FORK-BOUNDARY.md` §5 Rule 2);
    zero merge conflicts, instant revert. Loses product-usage data entirely.
  - *Self-host / Crewspan endpoint:* keeps telemetry, but Crewspan must run an
    ingest service and own its privacy policy.
- **Required approver.** Board; **privacy review required** before a new default
  ships (`AGENTS.md` rule 7 — a Telemetry default sends data immediately).
- **Grounding.** `doc/FORK-BOUNDARY.md` §3.4, §5, §6.1; `AGENTS.md` rule 7;
  `packages/shared/src/telemetry/`; `server/src/services/feedback-share-client.ts`.
- **Status.** Open. The agent did not read or change the effective local/VPS
  configuration.

### B2. Announcements feed

- **Question.** Keep rendering Paperclip's product announcements inside Crewspan,
  point the feed at a Crewspan feed, or disable it?
- **What runs today.** The announcements feed defaults to
  `https://pages.paperclip.ing/announcements/v1/current.json`
  (`packages/shared/src/announcements.ts:3`, consumed at
  `server/src/services/announcement-feed.ts:72`). On by default.
- **Options and tradeoffs.**
  - *Keep:* zero work; Paperclip product announcements render in the Crewspan UI,
    outside Crewspan's editorial control (`doc/FORK-BOUNDARY.md` §3.4).
  - *Own feed:* Crewspan controls content; requires hosting and maintaining a feed.
  - *Disable:* cleanest for an unlaunched product; removes an in-product surface
    some operators may want.
- **Required approver.** Board.
- **Grounding.** `doc/FORK-BOUNDARY.md` §3.4, §6.2; `packages/shared/src/announcements.ts:3`.
- **Status.** Open.

### B3. npm / update channel and CLI scope

- **Question.** Does Crewspan publish its own CLI, or keep consuming Paperclip's
  `paperclipai` package from npm? (The npm scope and binary-name questions follow
  from this answer — resolve the update channel first.)
- **What runs today.** The CLI package is `paperclipai` with `bin.paperclipai`
  (`cli/package.json`), and `cli/src/commands/update.ts` self-updates from npm.
  Workspace packages use the `@paperclipai/*` scope (13 of 15 packages,
  `doc/FORK-BOUNDARY.md` §3.3). As long as the npm channel is live, a
  `paperclipai update` would pull Paperclip's build over Crewspan's.
- **Options and tradeoffs.**
  - *Keep consuming `paperclipai`:* no publishing work; the update path can
    overwrite the Crewspan build, and the CLI identity stays Paperclip's.
  - *Publish a Crewspan CLI / scope:* owns the update channel and identity;
    requires publishing, versioning, and an update pipeline, plus a migration for
    an existing `@paperclipai/*` scope and `paperclipai` binary. Renaming the npm
    scope is **Tier C** (ecosystem) — high cost, breaks interop
    (`doc/FORK-BOUNDARY.md` §2, §3.3).
  - *Interim:* disable/neutralise `update` and keep the current scope unpublished.
- **Required approver.** Board.
- **Grounding.** `doc/FORK-BOUNDARY.md` §3.3, §3.4, §6.3; `cli/package.json`; `cli/src/commands/update.ts`.
- **Status.** Open.

### B4. Brand implementation depth

- **Question.** How deep does the Crewspan rename go, and when?
- **Tiering** (`doc/FORK-BOUNDARY.md` §2):
  - **A — Cosmetic** (title, manifest, icons, lockup, 182 distinct UI strings,
    docs, CLI copy): low cost, low risk; deferred, contained divergence.
  - **B — Operational** (env-var namespace `PAPERCLIP_*`, home/data dir, CLI
    binary, systemd/launchd ids, localStorage keys): ~520 identifiers; each rename
    strands existing installs and needs a compat shim; permanent merge conflicts.
  - **C — Ecosystem** (npm scope, wire headers `X-Paperclip-*`, PRP protocol
    schema URLs, third-party OAuth registrations): **do not rename casually**;
    breaks interop.
- **Options and tradeoffs.**
  - *Default posture — track (`doc/FORK-BOUNDARY.md` §4):* keep `PAPERCLIP_*` and
    the npm scope until a user-facing reason forces a rename. Lowest sync cost;
    operators keep seeing Paperclip identifiers.
  - *Cosmetic-only rebrand through a real branding layer:* reusable, but building
    the layer (`server/src/ui-branding.ts` is currently only a worktree tint hook)
    needs its own design decision and tests (`doc/FORK-BOUNDARY.md` §5 Rule 1).
  - *Deep rename (B/C):* full identity; high migration and merge cost.
- **Required approver.** Board. The brand migration *sequence* is engineering
  follow-up once depth is chosen.
- **Grounding.** `doc/FORK-BOUNDARY.md` §2–§5, §6.4, §8; `doc/CREWSPAN-PRODUCT-CONTRACT.md` §8.
- **Status.** Open. (The product direction "Crewspan is a product fork" is set;
  this is about *which* identifiers change and *when*.)

### B5. Paperclip Cloud

- **Question.** Keep the gated Paperclip Cloud integration and its UI copy, strip
  it, or replace it?
- **What runs today.** Sign-in handoff / connector enrollment / tenant control
  against `https://app.paperclip.app`, `https://id.paperclip.app`,
  `https://my.paperclip.app`. Gated behind `PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN`
  and related env, inert when unset, but the UI still carries Cloud copy and the
  `PaperclipCloudOAuthHandoff` page
  (`ui/src/pages/apps/PaperclipCloudOAuthHandoff.tsx`; route in `ui/src/App.tsx:748`).
- **Options and tradeoffs.**
  - *Keep gated:* no work; visible off-message Cloud surfaces; a latent dependency
    on Paperclip-operated infrastructure.
  - *Strip:* removes Paperclip branding/dependency; touches UI routes and copy,
    contained divergence.
  - *Replace:* Crewspan-hosted equivalent — new service to run and secure; out of
    M0/current milestone scope.
- **Required approver.** Board.
- **Grounding.** `doc/FORK-BOUNDARY.md` §3.4, §6.5; `ui/src/App.tsx:748`;
  `server/src/routes/cloud.ts:41`.
- **Status.** Open.

### B6. Auth / hostname / exposure (and administrator bootstrap)

- **Question.** What is the access route, hostname, and exposure for the reference
  and next deployments, and how is the first administrator bootstrapped?
- **What is decided vs open.** Auth **mode** is decided: `authenticated`
  (section 1, D4a). Open: the **route/hostname/exposure** and the **bootstrap
  plan**.
- **What the reference instance actually runs (verified).** The local reference
  instance reports `deploymentMode: local_trusted`, `exposure: private`, listener
  `127.0.0.1:3100` (`CREW-11` operator evidence, 2026-09-30). The read-only VPS
  observation on 2026-09-28 reported `authenticated` + `private` on loopback. So
  the recorded `authenticated` decision is **not yet reflected in the local
  reference instance** — a gap to close, not a new choice.
- **Options and tradeoffs** (runbook §1, §6):
  - *Loopback-only (`authenticated`+`private`, `HOST=127.0.0.1`):* simplest, no
    DNS/TLS; only usable on the host.
  - *Private route (Tailscale/VPN/LAN, `authenticated`+`private`):* remote access
    without public exposure; needs tailnet ACLs / private proxy and host trust
    config (remaining host capability unverified — `doc/M0-EXPLICIT-UNKNOWNS.md` §3).
  - *Public HTTPS (`authenticated`+`public`):* broadest access; requires a DNS
    hostname, TLS issuance/renewal, reverse proxy, exact `PAPERCLIP_PUBLIC_URL`,
    `TRUST_PROXY=loopback`, public-mode rate limiting, and a public bootstrap
    (`paperclipai auth bootstrap-ceo`). Port 3100 must stay loopback-only
    (`docs/deployment/CREWSPAN-VPS-MIGRATION.md` §6).
  - *Administrator bootstrap:* browser claim for private, one-time invite for
    public; must be delivered privately (`docs/deploy/deployment-modes.md`; runbook §6).
- **Required approver.** Board (hostname, route, who may sign in, bootstrap owner).
- **Grounding.** `docs/deployment/CREWSPAN-VPS-MIGRATION.md` §1, §4, §6, §10;
  `docs/deploy/deployment-modes.md`; `CREW-11` operator evidence;
  `doc/M0-EXPLICIT-UNKNOWNS.md` §2–§3.
- **Status.** Open (route/hostname/exposure/bootstrap). The local instance's
  `local_trusted` state is an engineering follow-up (section 4).

### B7. Backup destination and retention owner

- **Question.** Where do encrypted backups go, under whose custody, with what
  retention — for the **local** reference instance as well as any future host?
- **Already decided (D3).** Destination `/var/backups/crewspan/` on
  `zero1-contabo` (root-only), AES-256-GCM, key Board-side and separate,
  retention 7 daily + 4 weekly, owner Board. A copy was placed and hash-verified
  2026-09-30 (`CREW-9` report §7).
- **What remains open.**
  - *Local-instance backups:* automatic backups currently live only under the
    instance home (`%USERPROFILE%\.paperclip\instances\default\data\backups`) —
    local-only, and there is no scheduled off-host copy from the local instance.
  - *Retention mismatch:* the running server reads retention from Instance
    Settings (DB), and configured retention does not match the Board's 7d+4w
    policy (`CREW-9` report §2).
  - *Key custody:* the rehearsal key rests on the Board-side host, not yet
    independently escrowed/off-host; the ciphertext alone is not restorable
    (`CREW-9` report §8.2).
  - *Coverage:* a logical SQL dump does not cover `data/storage/**`,
    `secrets/master.key`, `secrets/decision-signing.key`, or
    `agent-jwt-secret.txt` (`CREW-9` report §6).
- **Options and tradeoffs.**
  - *Reuse the D3 VPS sink for the local instance too:* one destination, one
    policy; conflates the M0 reference instance with a host that is otherwise out
    of M0 scope.
  - *Designate a separate local/off-host sink:* keeps scopes clean; needs a new
    destination under Board custody.
  - *Tighten retention + add a startup backup + a full DR set (dump + storage +
    keys):* matches the stated policy and closes the restore gap; more moving parts.
- **Required approver.** Board (destination, key custody, retention owner).
- **Grounding.** `UPSTREAM.md` §9.4; `CREW-9` report §2, §6, §7, §8;
  `docs/deployment/CREWSPAN-VPS-MIGRATION.md` §1, §5.1; plan §13.9.
- **Status.** Destination/custody **decided (D3)**; local-sink choice, retention
  enforcement, key escrow and full-DR coverage **open**.

### B8. Migration vs fresh

- **Question.** For the next deployment target, copy an existing database and
  instance files (migrate), or start a fresh instance?
- **Context.** The VPS is out of M0 scope as a reference instance and is used only
  as a backup sink (D3). This decision concerns whatever the next deployment is,
  and whether the local M0 data is carried forward.
- **Options and tradeoffs** (`docs/deployment/CREWSPAN-VPS-MIGRATION.md` §1, §5):
  - *Migrate (restore a supported `.sql.gz` into a new empty data root):* preserves
    companies, agents, issues and history; must pair the dump with
    `data/storage/**` and the key files, preserve or deliberately rotate the agent
    JWT signer, and keep the app stopped during restore (§5.1–§5.4). Carries any
    existing schema/migration state forward.
  - *Fresh:* reproducible and clean (a new bootstrap/administrator flow); loses
    all existing history and local uploads.
  - *Defer:* M0 can close without this if the Board names no next deployment yet;
    it blocks the first real deployment once one is named.
- **Required approver.** Board.
- **Grounding.** `docs/deployment/CREWSPAN-VPS-MIGRATION.md` §1 ("Migration
  decision"), §5; plan §5.10, §13.3.
- **Status.** Open.

### B9. Baseline re-pin

- **Question.** Does the M0 baseline move from the pinned upstream release, and
  from the recorded reference SHA?
- **Context.** Two different baselines exist on purpose:
  - *Upstream provenance pin:* `v2026.916.1` (`d554c4789`) — the newest upstream
    **stable** tag; `UPSTREAM.md` §6 recommends **retaining** it because upstream
    `master` is a moving, rewritten line that does not contain the prior stable
    tags (`UPSTREAM.md` §4.1).
  - *Reference instance definition:* fork `main` at `49cac8af8` (Board D1, 2026-09-29).
- **What changed since.** Fork `main` has advanced past `49cac8af8` (current tip
  `f26490a44`, 2026-09-30) with build/CI portability fixes and the service-mode
  work. So the **reference instance definition** now trails `main`.
- **Options and tradeoffs.**
  - *Keep both as recorded:* stable, auditable; the reference SHA no longer equals
    `main`, so later evidence must state which revision it cites.
  - *Advance the reference instance definition to current `main` (`f26490a44`):*
    matches current code; changes the revision every later artifact must cite, and
    the earlier `49cac8af8` evidence would need re-stating.
  - *Re-pin the upstream provenance:* no newer **stable** tag exists (only
    canaries), so this is not available today and would pin unreleased code.
- **Required approver.** Board (this is D5 in the packet numbering; `UPSTREAM.md`
  §9.1 pins the current disposition).
- **Grounding.** `UPSTREAM.md` §2, §4.1, §6, §9.1; `git rev-parse main` → `f26490a44`.
- **Status.** Open as an explicit re-pin question; current disposition is
  "retain the upstream pin, reference instance = `49cac8af8`".

## 3. Verified deviation (documented, not changed)

### Dev-vs-production service-script

A verified deviation exists between the deployment target and the running
instance. It is recorded here as evidence; **no configuration or service was
changed by this packet.**

- **Local reference instance (current).** `Start-Default.ps1` defaults to the dev
  server (`pnpm dev:server`) on Windows; a production path is available and was
  verified to boot once the workspace is built
  (`node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js`,
  matching the shipped container's CMD). The production process was observed
  healthy from `17:56:34` to `18:07:22` before being reaped at end of run; the
  durable instance must be started by the operator. The instance reports
  `deploymentMode: local_trusted`. (`CREW-11` operator evidence, 2026-09-30;
  `M0-SETUP.md`.)
- **VPS (read-only evidence, out of M0 scope).** The unit ran the dev script
  (`ExecStart=/usr/bin/pnpm --filter @paperclipai/server dev`) instead of the
  runbook's production `start` — recorded during the CREW-7 evidence pass
  (2026-09-28) and in `docs/deployment/CREWSPAN-VPS-MIGRATION.md` §3–§4. The VPS
  service is currently stopped/disabled and out of M0 scope; this is not to be
  changed.
- **Relation to decisions.** The production target is already decided (D2,
  section 1). This deviation is the *status* against it; closing it is
  engineering follow-up (section 4), not a Board decision.

## 4. Engineering follow-ups (not Board decisions)

These are consequences of the decisions above; they are not themselves Board
calls and none is started by this packet.

1. Bring the **local reference instance** to `authenticated` (it currently reports
   `local_trusted`) to match D4a, with the bootstrap flow recorded.
2. `pnpm build` / production-start verification on the reference host is
   completed and evidenced; `CREW-29` and `CREW-11` cover the mechanics.
3. Add an **immediate backup at startup** and align configured retention with the
   Board's 7d+4w policy (`CREW-9` report §2, §8.3–8.4).
4. Build the **full DR set** (dump + `data/storage/**` + secret/decision keys +
   agent JWT signer) and place it per the Board's key-custody choice (B7).
5. If a hosted-dependency default changes (B1/B2/B5), implement it by shipping a
   different **default/deployment config**, not by editing the code path
   (`doc/FORK-BOUNDARY.md` §5 Rule 2), and run the required privacy review.
6. Correct the `doc/FORK-BOUNDARY.md` topology drift and add the missing
   `upstream` remote where authorized (`UPSTREAM.md` §7.1–7.2) — proposed, not
   performed.
7. Record upstream engagement responses in `UPSTREAM.md` §7.5
   (`doc/M0-EXPLICIT-UNKNOWNS.md` §3).

## 5. Decision summary

| # | Decision | Required approver | Status |
|---|---|---|---|
| B1 | Telemetry (keep / disable / self-host) | Board + privacy review | Open |
| B2 | Announcements feed (keep / own / disable) | Board | Open |
| B3 | npm / update channel and CLI scope | Board | Open |
| B4 | Brand implementation depth | Board | Open |
| B5 | Paperclip Cloud (keep gated / strip / replace) | Board | Open |
| B6 | Auth route / hostname / exposure / bootstrap | Board | Open |
| B7 | Backup destination and retention owner | Board | Partly decided (D3); local sink, retention, key escrow, DR set open |
| B8 | Migration vs fresh | Board | Open |
| B9 | Baseline re-pin | Board | Open (current disposition: retain pin; reference `49cac8af8`) |
| — | Dev-vs-production service script | Not a decision — verified deviation, unchanged | Recorded (section 3) |

**Reminder:** the agent prepared this packet; it has made none of these decisions.
No credential, secret, key, token, or private environment-file content is
included, and no service, deployment, or destructive action was taken.
