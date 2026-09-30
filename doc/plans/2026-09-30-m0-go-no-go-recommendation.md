# Crewspan M0 go/no-go and migration-readiness recommendation

Status: recommendation prepared for the Board, 2026-09-30 (UTC). Author and owner:
Crewspan QA & Release (agent), issue `CREW-5` (stage 6, final M0 closure).

Scope authority: [`2026-09-24-crewspan-e2e-v3.md`](2026-09-24-crewspan-e2e-v3.md)
§3.3, §3.5, §14; Board dispositions in `UPSTREAM.md` §9; the Board decision packet
[`2026-09-30-m0-board-decision-packet.md`](2026-09-30-m0-board-decision-packet.md).

**This is a recommendation. It is not a decision and it does not record a
go/no-go.** Only the Board records the §3.5 decision. No M1–M7 implementation is
started, and no deployment, restart, migration, restore, or destructive action
was performed by this issue.

## 1. Recommendation

**Pending — not a Go on the evidence as it stands.**

The §3.5 *Go* condition is **not met**: S1–S7 do not pass their stated
conditions (S3 is an explicit Fail; the rest the Board has carried into M1), and
the two quantitative inputs the gate needs — the M2 retrofit estimate and the
upstream sync cost — have not been measured, so the gate cannot be evaluated as
written. M0 exit (§14) also requires the M1–M7 estimates to be re-baselined,
which has not happened.

Two Board-resolvable paths remain, and the choice is the Board's:

- **Option A — record "Go with changes."** The Board formally re-scopes the
  gate: S1–S7 feasibility closes as **M1 exit criteria** (as the Board already
  dispositioned on 2026-09-30), S3 containment is accepted as an **M1-gated
  risk** rather than an M0 blocker, and the open decisions (section 5) are
  recorded or explicitly deferred. M1 may then start against that recorded,
  re-scoped gate.
- **Option B — record "No-go / hold."** The M0 gate stays closed until S1–S7
  pass and M1–M7 are re-baselined under the literal §3.5 wording.

The honest engineering position: the evidence cannot support a plain **Go**, and
a plain **No-go** would contradict the Board's own disposition that the remaining
spikes are production-integration work belonging to M1. **Option A is supportable
only if the Board records the re-scope explicitly**; otherwise the default is
Option B.

## 2. §3.5 gate criteria and current status

| §3.5 criterion | Required for | Status | Evidence |
|---|---|---|---|
| S1–S7 pass | Go | **NOT MET.** S3 = Fail; S1, S2, S4, S5, S6, S7 = carried to M1 by Board disposition (not passed). S8 framework-feasible. | `doc/plans/2026-09-29-crewspan-m0-spike-evidence.md` (addenda of 2026-09-30); Board disposition on `CREW-30`, 2026-09-30 |
| M2 retrofit estimate ≤ 18 engineer-weeks | Go | **UNKNOWN.** No retrofit estimate exists; M1–M7 not re-baselined. | plan §14 (estimates are "re-estimated at the M0 gate") |
| Upstream sync < 2 engineer-days | Go | **UNKNOWN.** S2 rehearsal not performed. | spike report S2; `UPSTREAM.md` §8 |
| Retrofit 18–28 ew → reduce first-release scopes | Go with changes | Cannot evaluate (estimate unknown) | plan §3.5 |
| Retrofit > 28 ew / no adapter containable on the reference VPS / sync > 5 e-d → No-go | No-go | Cannot evaluate; S3 containment **not demonstrated** (but also not disproven) | spike report S3 addendum, 2026-09-30 |

The S3 spike is the one place the plan names a possible **No-go** trigger ("no
adapter can be contained on the reference VPS"). The Board-authorized VPS
container spike did *not* achieve a real API-key-capable adapter run under a
runner supervisor or the §9.14 fail-closed suite (no `bwrap` in the shipped
image; rootless Podman/gVisor unavailable; no provider credential or runner
registration supplied). That is **not evidence of an escape** — it is evidence
that containment is **unproven**, which is a gate gap, not a proven No-go.

## 3. §14 M0 exit criteria and current status

| §14 exit requirement | Status |
|---|---|
| §3 inventories (CREW-2) | Met — `doc/plans/2026-09-29-crewspan-m0-system-inventories.md` |
| Spikes S1–S8 (CREW-3 / CREW-30) | **Partially met** — S8 answered; S3 Fail; S1/S2/S4–S7 carried to M1 |
| Design baseline (CREW-8) | Met — `doc/design/M0-UI-BASELINE.md`, `doc/design/m0-baseline/*.png` |
| Term table, threat model, trademark screen, §3.4 unknowns (CREW-10) | Met — `doc/M0-TERM-TABLE.md`, `doc/M0-THREAT-MODEL.md`, `doc/M0-TRADEMARK-SCREEN.md`, `doc/M0-EXPLICIT-UNKNOWNS.md` |
| `UPSTREAM.md` (CREW-4) | Met — `UPSTREAM.md` (+ `upstream` remote present in this checkout) |
| Upstream proposals / engagement (§3.6) | Not done — `UPSTREAM.md` §7.5 records no upstream issue/PR opened |
| §3.1 upstream build/test evidence at the pin | **Not fully met** — could not be captured on Windows; `UPSTREAM.md` §5/§7.4 require a Linux capture that has not been done |
| **§3.5 decision recorded** | **Met only once the Board records it** (this document is the input) |
| **M1–M7 re-baselined** | **NOT MET** |
| M0 gate unexceeded (no M1–M7 code) | Met — no M1–M7 implementation added |

## 4. Evidence ledger (M0 output)

| Issue | Artifact | Location / commit |
|---|---|---|
| CREW-4 | Baseline + re-pin record, fork boundary | `UPSTREAM.md` (main) |
| CREW-2 | Twelve system inventories | `doc/plans/2026-09-29-crewspan-m0-system-inventories.md` (main; PR #1) |
| CREW-8 | UI design baseline (6 captures + tokens/components + Storybook result) | `doc/design/M0-UI-BASELINE.md`, `doc/design/m0-baseline/*` (main) |
| CREW-10 | Term table, threat model v1, trademark screen, §3.4 unknowns | `doc/M0-TERM-TABLE.md`, `doc/M0-THREAT-MODEL.md`, `doc/M0-TRADEMARK-SCREEN.md`, `doc/M0-EXPLICIT-UNKNOWNS.md` (main) |
| CREW-3 / CREW-30 | S1–S8 spike evidence | `doc/plans/2026-09-29-crewspan-m0-spike-evidence.md` (landed to `main` by this issue) |
| CREW-9 | Off-host encrypted backup + restore rehearsal | `doc/plans/2026-09-30-crew-9-offhost-backup-and-restore-rehearsal.md` (landed to `main` by this issue) |
| CREW-11 | Local service start mode (production path + dev rollback) | `Start-Default.ps1`, `M0-SETUP.md` (main) |
| CREW-26 | Storybook build fix on Windows | PR #2 (merged) |
| CREW-27 | CI baseline restoration | PR #3 (merged) |
| CREW-29 | Windows build portability | `d90edb56b` (main) |
| CREW-6 | Board decision packet | `doc/plans/2026-09-30-m0-board-decision-packet.md` (main) |
| CREW-5 | This recommendation | `doc/plans/2026-09-30-m0-go-no-go-recommendation.md` (this issue) |

## 5. Open Board decisions (from the CREW-6 packet)

Recorded: D1 reference instance, D2 production start target, D3 off-host backup
destination/custody (destination `/var/backups/crewspan/` on `zero1-contabo`,
AES-256-GCM, key Board-side and separate, 7 daily + 4 weekly, owner Board),
D4a authentication mode `authenticated`, and the M0 gate itself.

Still open at this recommendation: **B1** telemetry default, **B2** announcements
feed, **B3** npm/update channel and CLI scope, **B4** brand implementation depth,
**B5** Paperclip Cloud disposition, **B6** auth route/hostname/exposure and
administrator bootstrap, **B7** local-instance backup sink, retention
enforcement, key escrow and full-DR set, **B8** migration vs fresh, **B9**
baseline re-pin. B1 requires a privacy review before a new default ships
(`AGENTS.md` rule 7). None of these is decided by the agent.

## 6. Repo currency (Board instruction, 2026-09-30)

- Open M0 pull requests on `sico-vibes/crewspan`: **none** (PR #1, #2, #3 all
  merged).
- Artifacts missing from `origin/main` at the start of this issue: the CREW-30
  spike evidence report and the CREW-9 backup/restore report. Both are **landed
  to `origin/main` by this issue**.
- **Parked with reason:** `spikes/m0/` (the throwaway feasibility probes
  `prototypes.test.mjs` + `README.md`) stays on branch
  `agent/crewspan-backend-engineer/crew-30`. It is deliberately **not** merged:
  the Board classified it as throwaway feasibility code (not M1
  implementation), and the report records its results and reproduction command.
- The `agent/crewspan-qa-release/crew-4`, `crew-8`, `crew-10` and `crew-11`
  branch tips are already contained in `origin/main` (no unique commits).

## 7. Residual risks

1. **S3 containment unproven (M0 evidence failure).** No API-key-capable adapter
   was run under a runner supervisor, and the §9.14 fail-closed suite was not
   run. Not an escape finding; a gate gap carried to M1.
2. **M2 retrofit and upstream-sync cost unknown.** The single most important
   sizing input for the Go/no-go is unmeasured; §3.5 cannot be evaluated.
3. **Reference instance auth gap.** The live local reference reports
   `deploymentMode: local_trusted` (verified 2026-09-30 via `/api/health`),
   while Board D4a recorded `authenticated`. The decided auth mode is not yet in
   effect on the reference instance.
4. **Service-start deviation (dev-script operation).** `Start-Default.ps1`
   defaults to the **dev** server (`-Mode dev`); production start
   (`node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js`,
   matching the shipped container) is **opt-in** and was verified healthy only
   for one bounded window. The durable instance must be started by the operator,
   and the default path remains the dev script. This is the recorded temporary
   deviation against D2.
5. **VPS revision drift.** The VPS `/srv/crewspan` checkout is behind fork
   `main` and lacked the upstream merge (`UPSTREAM.md` §3–§4). The VPS is out of
   M0 scope as a reference instance (service `inactive`/`disabled`) and is used
   only as the D3 backup sink.
6. **Backup/DR coverage.** A logical SQL dump does not cover
   `data/storage/**`, `secrets/master.key`, `secrets/decision-signing.key`, or
   `agent-jwt-secret.txt`; there is no startup backup; configured retention does
   not match the Board's 7d+4w policy; and the AES-256-GCM key is Board-custodied
   but not yet independently escrowed. The restore rehearsal verified schema and
   row fidelity but did **not** boot the full server against the restored
   database.
7. **Upstream build/test evidence at the pin not captured on Linux**
   (`UPSTREAM.md` §5, §7.4). The fork CI baseline (PR #3) is green except for
   documented inherited flakes, but that is fork `main`, not the pinned
   `v2026.916.1` baseline.
8. **Hosted-dependency defaults.** Telemetry is on by default and points at a
   Paperclip ingest endpoint; the announcements feed defaults to Paperclip's
   feed; Paperclip Cloud UI copy remains (gated). These are B1/B2/B5 privacy and
   branding decisions, not resolved here.
9. **Trademark screen is not a legal conclusion** (`doc/M0-TRADEMARK-SCREEN.md`);
   disposition is B4/B5 for the Board.

## 8. Minimum package before M1 authorization

For the Board to record **Option A ("Go with changes")**, the record should
contain: a named gate re-scope carrying S1–S7 into M1; an explicit disposition
for S3; the B1–B9 statuses (decided or deferred); the engineering follow-ups
below; and confirmation the repo is current. For **Option B ("No-go / hold")**,
the blocker list is S1–S7 pass plus an M1–M7 re-baseline.

Engineering follow-ups implied (not started): bring the local reference instance
to `authenticated`; make production start the default and evidence it; add a
startup backup and align retention; build the full DR set and escrow the key;
capture §3.1 build/test evidence on Linux; open the upstream engagement; correct
the `FORK-BOUNDARY.md` topology drift.

## 9. Escalations requiring human authorization

No deploy, restart, migration, restore, backup-destination change, or destructive
action is performed or requested to be performed by this issue; each requires
explicit Board authorization. The B-series decisions in section 5 are Board-only.
Port 3100 remains loopback-only; `/etc/crewspan/crewspan.env` is never read or
printed; `/root/Dashboard` and its services are never touched.

## 10. Provenance and verification

- Reference instance: local checkout `C:\Crewspan`; Board D1 reference build
  `49cac8af8162e362b6fd0f7b91a0ea2af43b0dd1`; upstream provenance pin
  `v2026.916.1` / `d554c4789ed3930f8a53ac9fdf6503b3187097da` (`UPSTREAM.md` §2).
- Fork `main` tip at recommendation time: `6d6db59e145b33631c60ba35957c407a45a43e1`
  ("docs(m0): land the Board decision packet (CREW-6)").
- Live health (read-only, 2026-09-30):
  `GET http://127.0.0.1:3100/api/health` → `status: ok`, `authReady: true`,
  `deploymentMode: local_trusted`, `deploymentExposure: private`,
  `databaseBackup.status: ok` (latest backup 3.2 h old), reported commit
  `6d6db59e1`, branch `main`, no local changes.
- Spike evidence: `doc/plans/2026-09-29-crewspan-m0-spike-evidence.md`.
- Backup/restore evidence: `doc/plans/2026-09-30-crew-9-offhost-backup-and-restore-rehearsal.md`.
