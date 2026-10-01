# Crewspan desktop: status and handoff (2026-10-01)

Written so work can continue locally (outside Claude Cloud). Source of truth for the plan stays
`doc/plans/2026-09-30-m1-handoff.md`; desktop design is in `doc/plans/2026-09-30-m1-desktop-plan.md`;
the M1 backlog is `doc/plans/2026-10-01-m1-backlog.md`.

## What exists and is proven

| Item | State |
| --- | --- |
| Windows installer built by CI (`.github/workflows/desktop.yml`, `Desktop (Windows)`) | Works. Manual dispatch with `publish: true` creates a GitHub pre-release. |
| Release `v0.1.0-beta.2` | Published (installer, `.sig`, `SHA256SUMS.txt`) plus update feed `desktop-updates/latest.json`. |
| Server starts in the installed app on Windows | Fixed in beta.2 (verbatim `\\?\` path bug). Owner confirmed the app opens and, after a timeout and Retry, connects. |
| Signed auto-update | Built and published (Tauri updater, key pair owned by the owner, secrets `TAURI_SIGNING_PRIVATE_KEY` and `..._PASSWORD`). **The update path itself is unproven** until a second release exists to update to. |
| Fail-fast signing check | Proven: wrong secrets fail in about a minute. |

## Known problem being fixed

First launch takes longer than the 5 minute ready timeout (database creation plus about 290 migrations,
plus Defender scanning about 52,000 files, plus runtime TypeScript transpiling). The owner presses Retry
and it then connects. A Multica-style instant start is not possible with a bundled server; the fix is to
do the work at build time.

## PR #13 (open, one commit plus CI fixes): the "speed" batch

Branch `claude/tender-fermi-4j829o`. Built through the delegation pipeline (see `doc/AI-ORCHESTRATION.md`).
Contents: startup phases with timing log lines and a progress splash, first-run timeout raised to 900 s,
staging without the tsx loader, a pre-built migrated database template seeded on first launch (fallback to
the slow path; failed seeds moved aside, never deleted), tray mode with a one-time notice, update checks at
launch and every 24 h, dead-server restart, cancellable first start, tighter capabilities, faster NSIS
compression, CI caches and a test timeout, plus M1 tooling (fail-closed probe-suite scaffolding, M2 sizing
and upstream-sync-cost scripts, backlog doc).

CI history on this PR: (1) pnpm action cache misconfigured (fixed); (2) no-tsx staging rejected a package
whose `files` lists a missing folder (`skills`); fixed in the latest commit (missing `files` entries are
tolerated, a missing export target still fails). The next `Desktop (Windows)` run is the first real test of
no-tsx staging and the template build. The template step is `continue-on-error` so it cannot block a release.

Local test state when this was written: cargo fmt, sidecar-core and shell-logic tests, Windows type-check
(`cargo check --target x86_64-pc-windows-msvc -p crewspan-desktop`, needs `AR_x86_64_pc_windows_msvc=llvm-ar`
when cross-checking from Linux) all pass; node tests 291 of 294, the 2 failures are older tests unrelated to
this work (Storybook viewport config, CLI proxy env).

## Next steps (in order)

1. Get PR #13 green: watch the `Desktop (Windows)` job; fix whatever the no-tsx staging or the template step
   reports. Normal CI (`ci / verify`) is already green on earlier heads except an old flaky chat test
   (`chat-channels.integration.test.ts`, upstream; re-run once if it fails).
2. Merge (merge commit), then dispatch `desktop.yml` on `main` with a new version (for example
   `0.1.0-beta.3`) and `publish: true`.
3. Owner tests: install over the old version; first launch should be much faster; the old beta.2 install
   should offer the update (this proves the updater).
4. Review the QA notes below and the open questions.

## Open items and risks

- The pre-built template and no-tsx staging are unproven on Windows. Fallbacks: `--loader tsx` for staging;
  template off (the app then uses the slow path).
- QA findings not fixed: `desktop.yml` grants `contents: write` on pull_request runs (also on `main`; plan
  asked for write only in a publish job); `blocking_show` inside the close handler may deadlock on some
  platforms; `stop_for_update` does not wait for a restarting server; `.db.failed-seed-*` directories are
  never cleaned; the backlog doc is the place to correct any over-claims (S3 containment is NOT passed).
- Still owner tasks: rotate the OpenCode Go key that was pasted in chat; delete stale GitHub branches (the
  cloud session cannot); refresh `UPSTREAM.md` pin (Board decision B9); `refresh-lockfile.yml` targets
  `master` not `main`.
- Board decisions B1-B9 were not touched. M1 exit criteria beyond the desktop work (S1, S2, S3 containment,
  S4-S7, M2 retrofit sizing, upstream sync cost) are tracked in `2026-10-01-m1-backlog.md`; S3 containment
  must be proven before any agent runs against real data.

## How to continue locally

- Node 24.11+, pnpm 9.15.4; Rust stable with the `x86_64-pc-windows-msvc` target for type-checks.
- CI workaround: `main`'s `pnpm-lock.yaml` lags; run `pnpm install --resolution-only --ignore-scripts
  --no-frozen-lockfile` then `pnpm install --frozen-lockfile`, and never commit the lockfile (`ci / policy`).
- Windows builds take about 45 minutes, mostly the full `pnpm build` and the NSIS packaging; run them on CI.
- Delegation pipeline (optional): plan with Claude Opus, implement with Codex, QA with OpenCode, lead reviews;
  see `doc/AI-ORCHESTRATION.md`. Caveats found: background jobs are killed when the cloud container restarts
  (it restarts when a scheduled check-in fires while a job is running); OpenCode QA sometimes times out with no
  output (re-run it); every worktree needs its own lane approval.
- Windows sidecar log for diagnostics: `%LOCALAPPDATA%\io.github.sicovibes.crewspan\logs\sidecar.log`.
