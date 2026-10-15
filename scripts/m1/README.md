# M1 offline gate tooling

These scripts validate reports and measure local source/history indicators. They
do not run adapters, access credentials, connect to a provider, deploy, fetch
git refs, or use real data. **No output from the probe fixtures is evidence that
S3 passed.** S3 remains a hard gate before any agent is run against real data.

The gate/status ledger is `doc/plans/2026-10-01-m1-backlog.md`. The M2 source
inventory and local upstream path comparison are written to the two dated
reports below. Each executable has a corresponding named Node test file.

## Probe suite contract (S3 / v3 §9.14)

```sh
node scripts/m1/probe-suite.mjs
node scripts/m1/probe-suite.mjs --fixture complete
node scripts/m1/probe-suite.mjs --fixture incomplete
node scripts/m1/probe-suite.mjs --fixture failed
node scripts/m1/probe-suite.mjs --report path/to/operator-captured-report.json
node --test scripts/m1/probe-suite.test.mjs
```

No-argument invocation exits nonzero because no reference-environment probes
were run. Fixtures test the report contract only. A complete fixture prints
`SCAFFOLDING ONLY` and cannot authorize a real-data run. Report mode checks that
 all §9.14 probe results are present, deny/contain outcomes are explicit, and
 each has an evidence reference; even complete-shaped reports exit 2 and cannot
 certify S3.

## M2 source inventory

```sh
node scripts/m1/measure-m2-sizing.mjs
node scripts/m1/measure-m2-sizing.mjs server/src doc/plans/2026-10-01-m2-retrofit-sizing.md --rates path/to/team-calibrated-rates.json
node --test scripts/m1/measure-m2-sizing.test.mjs
```

Rate JSON requires non-negative `routeRegistrationHours`,
`databaseReferenceHours`, and `sourceFileReviewHours` numeric values. The optional
scenario is transparent arithmetic from team-supplied rates; categories overlap
and must be validated against S1 before use. No default rate is assumed, so the
default engineer-week result remains **UNPROVEN**.

The command writes `doc/plans/2026-10-01-m2-retrofit-sizing.md`. Route and query
counts use static syntax heuristics. The engineer-week threshold stays
**UNPROVEN** until the team applies calibrated effort assumptions to the full
S1 prototype and leak-test scope.

## Upstream sync overlap indicator

```sh
node scripts/m1/measure-upstream-sync.mjs
node scripts/m1/measure-upstream-sync.mjs <base-ref> <upstream-ref> <fork-ref> [report-path]
node --test scripts/m1/measure-upstream-sync.test.mjs
```

The command reads existing local git refs only and writes
`doc/plans/2026-10-01-upstream-sync-cost.md`. It reports shared changed paths
relative to the selected base ref. Overlap is a risk indicator, not elapsed engineering
time; the S2 rehearsal and `<2 engineer-day` threshold remain **UNPROVEN** until
an isolated rehearsal on the S1 skeleton is completed and timed.

## Run all offline tooling tests

```sh
node --test scripts/m1/probe-suite.test.mjs scripts/m1/measure-m2-sizing.test.mjs scripts/m1/measure-upstream-sync.test.mjs
```
