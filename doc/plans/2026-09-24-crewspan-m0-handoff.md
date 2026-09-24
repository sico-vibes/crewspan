# Crewspan M0 handoff

The [v3 E2E plan](2026-09-24-crewspan-e2e-v3.md) is the current scope authority. The [v1 plan](2026-09-24-crewspan-e2e-v1.md), [v2 plan](2026-09-24-crewspan-e2e-v2.md), and [Opus review](2026-09-24-crewspan-opus-review.md) are retained as decision history.

M0 verifies the pinned Paperclip fork, existing product surface, design language, authorization boundaries, runner behavior, and feasibility spikes. No M1 or later implementation starts before the M0 gate. The current local checkout at `C:\Crewspan` is the development machine baseline; it does not substitute for the plan's later reference VPS probe.

## Crewspan development organization

These are permanent development responsibilities. **Current assignments alone are limited to M0.**

| Agent | Responsibility | Reports to |
| --- | --- | --- |
| Ra (formerly Vex) | Program lead and milestone coordination | Board |
| Ptah (formerly Rook) | Engineering and architecture | Ra |
| Thoth (formerly Hollis) | Product requirements and workflows | Ra |
| Ma'at (formerly Wren) | Quality and governance | Ra |
| Seshat (formerly Vex 2) | Research and documentation | Ra |
| Hathor | Product design and accessibility | Thoth |
| Horus | Frontend and collaboration | Ptah |
| Khnum | Backend and data | Ptah |
| Khepri | Agent runtime and model gateway | Ptah |
| Shu | Infrastructure and deployment | Ptah |
| Hapi | Integrations and connectors | Ptah |
| Anubis | Security and isolation | Ma'at |
| Nephthys | Test automation and release | Ma'at |

All 13 use Codex `gpt-6-luna` at high reasoning with the explicit CLI engine. The Onboarding project has `C:\Crewspan` as its primary workspace for the current M0 inventory. Agent creation and autonomous task assignment are disabled during M0. All 13 are paused; a later milestone requires a Board decision before work begins.

## Current task boundary

`CRE-1` onboarding and `CRE-2` local agent token repair are done. `CRE-3` product contract is blocked because the later-milestone design must wait for M0. `CRE-4` is the **M0 fork boundary inventory**: the verified pinned baseline, inherited product and UI surfaces, already changed local files, and future divergence. The [fork boundary inventory](../FORK-BOUNDARY.md) records that result; the [product contract draft](../CREWSPAN-PRODUCT-CONTRACT.md) remains a working note, not implementation authority.

Thoth's retry proved that the Windows Codex CLI starts with the project workspace and managed skills, but local `workspace-write` policy rejects its PowerShell command before it can inspect files. Thoth was paused again, and the Board completed the source inventory directly. This does not pass the v3 reference-VPS sandbox spike or the complete M0 gate. The remaining M0 inventories, visual baseline, upstream sync rehearsal, security probes, and S1-S8 spikes are still pending. No later milestone has started.
