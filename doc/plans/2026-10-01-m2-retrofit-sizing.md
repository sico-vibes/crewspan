# M2 scoped-access retrofit sizing input

Generated: 2026-10-01T19:38:19.888Z

**Gate status: UNPROVEN.** This is a static code inventory, not a completed S1 estimate. It does not include every query hidden behind helpers, runtime route coverage, cross-cutting changes, review, migration, or leak-test effort. Do not compare these counts directly with the §3.5 threshold of 18 engineer-weeks.

## Measured source inventory

| Metric | Count |
|---|---:|
| Production source files | 781 |
| Nonblank source lines | 462123 |
| Route files (path heuristic) | 75 |
| Route registrations (syntax heuristic) | 935 |
| Database references (syntax heuristic) | 1335 |
| Exported functions (syntax heuristic) | 2365 |

## Optional calibrated scenario

No team-calibrated rates supplied; engineer-week result is **UNPROVEN**.

## Gate status

- S1 integrated scoped-access prototype and leak tests: **UNPROVEN**.
- M2 engineer-week estimate and §3.5 ≤18-week threshold: **UNPROVEN**; a rate scenario, if present, is not gate evidence by itself.
- Board scope decision for an 18–28-week estimate: **OPEN**.

## Interpretation

Counts use the tracked source under the selected root and simple text patterns. They are a repeatable starting inventory only. Complete the route/query inventory, apply S1 guard/query prototypes to projects, tasks and attachments, run leak tests, and have the delivery team estimate the remaining M2 work before recording a gate result.
