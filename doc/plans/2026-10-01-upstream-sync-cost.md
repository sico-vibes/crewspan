# Upstream sync cost measurement input

Generated: 2026-10-01T19:32:08.866Z

**Status: UNPROVEN.** File overlap is a change-risk indicator; it does not measure hands-on conflict resolution, builds, tests, reviews, or elapsed engineer-days. S2's <2-engineer-day criterion requires an actual rehearsal on the S1 skeleton.

The file counts compare each ref's tree with the selected base. Shared paths are not confirmed merge conflicts.

## Local references

- Base: v2026.916.1
- Upstream ref: refs/remotes/upstream/master
- Fork ref: HEAD

## Changed-file overlap

| Metric | Count |
|---|---:|
| Upstream changed files | 2311 |
| Fork changed files | 2592 |
| Paths changed on both sides | 2301 |
| Upstream-only paths | 10 |
| Fork-only paths | 291 |

## Gate status

- S2 real merge rehearsal and recorded effort: **UNPROVEN**.
- §3.5 upstream sync <2 engineer-days: **UNPROVEN**.
- No remote fetch, branch mutation, merge, or real-data run was performed by this script.

## Overlapping paths

- `.agents/skills/add-product-e2e-eval/SKILL.md`
- `.agents/skills/add-runner-eval/SKILL.md`
- `.agents/skills/paperclip-evals/SKILL.md`
- `.claude/launch.json`
- `.devin/wiki.json`
- `.dockerignore`
- `.env.runner-e2e.example`
- `.github/scripts/publish-storybook.cjs`
- `.github/scripts/tests/cloud-readiness.test.mjs`
- `.github/scripts/tests/cloud-runner-routing.test.mjs`
- `.github/scripts/tests/docker-canary-promotion.test.mjs`
- `.github/scripts/tests/docker-disk-workflow.test.mjs`
- `.github/scripts/tests/lockfile-refresh-workflows.test.mjs`
- `.github/scripts/tests/post-merge-runner-routing.test.mjs`
- `.github/scripts/tests/pr-dependency-cache.test.mjs`
- `.github/scripts/tests/pr-runner-rust-cache.test.mjs`
- `.github/scripts/verify-storybook.cjs`
- `.github/workflows/cloud-readiness.yml`
- `.github/workflows/docker-cloud.yml`
- `.github/workflows/docker-runner-check.yml`
- `.github/workflows/docker.yml`
- `.github/workflows/pr-trusted.yml`
- `.github/workflows/release-verify.yml`
- `.github/workflows/release.yml`
- `.github/workflows/runner-full-stack-e2e.yml`
- `.github/workflows/runner-protocol-live-evals.yml`
- `.github/workflows/sentry-contract.yml`
- `.github/workflows/storybook-deploy.yml`
- `.gitignore`
- `AGENTS.md`
- `DESIGN.md`
- `Dockerfile`
- `README.md`
- `ROADMAP.md`
- `cli/src/__tests__/prompt-default-accept.test.ts`
- `cli/src/__tests__/worktree.test.ts`
- `cli/src/commands/client/connections.ts`
- `cli/src/commands/client/issue.ts`
- `cli/src/prompts/database.ts`
- `cli/src/prompts/secrets.ts`
- `cli/src/prompts/server.ts`
- `cli/src/prompts/storage.ts`
- `doc/AGENT-ARTIFACTS.md`
- `doc/CLI.md`
- `doc/DATABASE.md`
- `doc/DEPLOYMENT-MODES.md`
- `doc/DEVELOPING.md`
- `doc/DOCKER.md`
- `doc/PRODUCT.md`
- `doc/RELEASE-CHECKLIST.md`
- … 2251 additional shared paths omitted

## Required follow-up

Select the upstream release and S1 skeleton, rehearse the merge in an isolated disposable worktree, record conflict files and hands-on hours, run the relevant build/tests, and update this report with the operator-reviewed result. Do not infer engineer-days from file counts.
