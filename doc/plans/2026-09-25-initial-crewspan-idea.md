# Initial Crewspan idea: scoped intake brief

- **Date:** 2026-09-25
- **Intake:** [CRE-5](/CRE/issues/CRE-5)
- **Scope authority:** [Crewspan M0 plan](2026-09-24-crewspan-e2e-v3.md)
- **Product reference:** [Crewspan Product Contract](../CREWSPAN-PRODUCT-CONTRACT.md)
- **Team boundary:** [M0 handoff](2026-09-24-crewspan-m0-handoff.md)

## Idea

Grow the Paperclip fork into a human-and-agent company workspace. Preserve
Paperclip's end-to-end operations view and familiar UI while enabling human
collaboration, mixed human/AI reporting lines, governed agent provider/model/
effort/access, project-scoped repositories and documents, and delegation that
uses context and tokens efficiently.

The product contract frames the destination as one company, org, work chain and
set of projects shared by people and agents, with governance of what agents may
see, use and spend. It also keeps conversations attached to work and preserves
Paperclip's control-plane role.

## M0 outcome

M0 produces evidence and a recorded go/no-go decision on whether the Crewspan
vision is feasible on the pinned Paperclip baseline, plus re-baselined later
milestone estimates. M0 is verification and planning; it does not deliver the
new workforce or collaboration capabilities.

## In-scope decisions and evidence

Under the v3 plan, M0 may verify and record:

- the pinned upstream baseline, inherited operations surfaces, design language,
  current fork boundary and terminology;
- route, query, realtime, background-job, agent-facing, auth, runner/adapter,
  work-behavior, connection/budget, knowledge/communication, migration, and
  extension-point inventories;
- feasibility results for spikes S1–S8, including authorization sizing,
  upstream sync cost, contained runner and git isolation, model gateway,
  session scoping, assignment/wake behavior and MFA;
- design baseline, upstream engagement and response, threat model, trademark
  screen, and resulting estimates and risks;
- the §3.5 go, go-with-changes or no-go recommendation and the Board's recorded
  M0 disposition.

These decisions assess the later product commitments; they do not authorize
their design or implementation ahead of the M0 gate.

## Exclusions in this intake

No code changes or later-milestone implementation. In particular, this brief
does not authorize building mixed human/agent orgs (M1), scoped access (M2),
runner/model gateway (M3), delegation and model governance (M4), project files
and knowledge (M5), or DMs, channels and mentions (M6). It also does not
authorize new issues, subtasks, hires, agent assignments, or a general chat,
project-management, or code-review product. Future ideas get separate intake
issues.

## Acceptance criteria

This intake brief is complete when it states the idea, its M0-only outcome,
decisions, exclusions, gate criteria and Board decision path, and points to
existing work only. M0 itself meets the v3 plan's exit when the §3.5 go/no-go
decision is recorded and M1–M7 estimates are re-baselined; the evidence and
deliverables are those listed in §§3 and 14 of that plan.

## Board decision

No additional decision is needed to accept this brief: the Board has assigned
the documentation task within M0. The Board still owns the M0 gate decision
after the required evidence is complete. Until then, no later milestone may
start.

## Routing

- [CRE-3 — Write the Crewspan product contract](/CRE/issues/CRE-3), owned by
  **Thoth (product)**: product reference for the human-and-agent company model.
- [CRE-4 — M0 fork boundary inventory](/CRE/issues/CRE-4), owned by
  **Thoth (product)**: current-state and divergence evidence used by this
  intake.
- The [v3 E2E plan](2026-09-24-crewspan-e2e-v3.md) remains the M0 scope
  authority; the [M0 handoff](2026-09-24-crewspan-m0-handoff.md) records the
  current team and assignment boundary.
