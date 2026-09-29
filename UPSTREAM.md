# UPSTREAM.md — Crewspan ↔ upstream Paperclip baseline record

This file records the pinned upstream Paperclip baseline for Crewspan, the fork
and deployment revisions observed against it, and the open upstream proposals.
It is the provenance record required by the v3 plan
([`doc/plans/2026-09-24-crewspan-e2e-v3.md`](doc/plans/2026-09-24-crewspan-e2e-v3.md)
§3.1 and §13.10) and the `UPSTREAM.md` referenced by
[`doc/FORK-BOUNDARY.md`](doc/FORK-BOUNDARY.md).

It records facts and a recommendation. Changing the pin is a Board decision
(item **D5** in the M0 decision packet), so this revision keeps the existing
pin and states the recommendation below rather than re-pinning unilaterally.

## 1. Record format

Each baseline record has these fields. They are the minimum a future sync must
update.

| Field | Meaning |
| --- | --- |
| `pinned_tag` | Upstream release tag the fork is pinned to. |
| `pinned_commit` | Full commit SHA the tag points to (annotated tag target). |
| `pinned_date` | Commit date of the pinned SHA. |
| `upstream_remote` | URL of the read-only upstream repository. |
| `latest_upstream_tip` | Upstream default-branch tip observed at record time, with date. |
| `latest_stable_tag` | Newest upstream **stable** release tag observed at record time. |
| `fork_main_commit` | Tip of the fork's default branch (`main`) at record time. |
| `vps_checkout_commit` | Revision of the read-only VPS checkout at record time. |
| `verified_commands` | The exact commands that produced the SHAs above. |
| `delta_summary` | Commits/fork patches between the pin and the observed tips. |
| `open_proposals` | Upstream changes or process gaps awaiting a decision or an upstream response. |

## 2. Pinned baseline (M0)

| Field | Value |
| --- | --- |
| `pinned_tag` | `v2026.916.1` |
| `pinned_commit` | `d554c4789ed3930f8a53ac9fdf6503b3187097da` |
| `pinned_date` | 2026-09-21 12:19:51 -0700 |
| `upstream_remote` | `https://github.com/paperclipai/paperclip.git` |
| `fork_remote` | `https://github.com/sico-vibes/crewspan.git` (default branch `main`) |
| `latest_stable_tag` | `v2026.916.1` — no newer stable release; only canaries (`canary/v2026.928.0-canary.9` at record time) |
| `recorded_at` | 2026-09-28 |

The pinned SHA is the annotated tag target and matches upstream's published
tag: `git ls-remote --tags https://github.com/paperclipai/paperclip.git refs/tags/v2026.916.1`
returns `d554c4789ed3930f8a53ac9fdf6503b3187097da`, and the fork's `origin` carries
the same tag object.

This matches the baseline recorded in
[`M0-SETUP.md`](M0-SETUP.md) ("Baseline: Paperclip tag `v2026.916.1`, commit
`d554c4789ed3930f8a53ac9fdf6503b3187097da`") and in
[`doc/FORK-BOUNDARY.md`](doc/FORK-BOUNDARY.md) §1.

## 3. Observed fork and deployment revisions

| Revision | SHA | Date | Notes |
| --- | --- | --- | --- |
| Upstream `master` tip | `24c58e479aeb8e2d6506eeb48d9c8bc012c9863d` | 2026-09-28 15:38 -0500 | 27 commits past the merge base; not a stable release. |
| Fork `origin/main` tip | `41675dcec290184ce51afceda9a4d22c186a7623` | 2026-09-28 23:07 +0100 | Fork default branch. |
| VPS `/srv/crewspan` (`main`) | `7732ecae35c125bb0aad666a688307728fdca24e` | 2026-09-27 00:46 +0200 | 21 commits behind fork `main`; `status` clean; only `origin` configured. |

Verification commands:

```sh
git ls-remote https://github.com/paperclipai/paperclip.git refs/heads/master
git ls-remote origin refs/heads/main
ssh zero1-contabo "sudo -n git -C /srv/crewspan rev-parse HEAD; \
  sudo -n git -C /srv/crewspan status -sb; \
  sudo -n git -C /srv/crewspan remote"
```

## 4. Delta summary

Fork `main` (`41675dcec`) carries `d554c4789` (the pin) plus upstream `master`
up to merge base `01d9a1218` (`fix: make keyboard shortcut enablement a personal
preference (#14141)`), plus these fork commits:

- `9ec2ca8ad` feat(crewspan): establish M0 baseline and connection support
- `60746a0ee` feat(crewspan): merge current Paperclip upstream
- `7b80d25a4` docs: add Crewspan VPS migration runbook
- `899d915ed` docs: add initial Crewspan idea brief
- `7732ecae3` Fix subpath deployment and Crewspan routing
- `a620496ca` Merge upstream Paperclip master
- `41675dcec` fix(codex-local): honour the bypass setting in the ACP lane

The VPS checkout (`7732ecae3`) stops before the upstream merge
(`a620496ca`) and the Codex fix (`41675dcec`): it is **21 commits behind** fork
`main` and does not contain the merged upstream master line.

### 4.1 Upstream history note

`v2026.916.1` (`d554c4789`) is an ancestor of the fork's `main` but **is not an
ancestor of the current upstream `master`**:

```sh
git merge-base --is-ancestor v2026.916.1 refs/remotes/upstream/master   # exit 1
git merge-base --is-ancestor v2026.916.1 refs/remotes/origin/main       # exit 0
```

Upstream `master` carries the same change under a different SHA
(`5d9b20ccf`, same PR title `#13562`), and the previous stable tag
`v2026.831.1` is likewise not an ancestor of `master`. Upstream's `master`
history is therefore rewritten/diverged relative to released tags. **Release
tags, not `master`, are the reproducible provenance anchor.**

## 5. Baseline build/test evidence (v2026.916.1)

Captured 2026-09-28 on the local Windows workstation (Windows, Node v25.8.0,
pnpm 9.15.4) against a pristine worktree of the pin:

| Step | Command | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | Dependency download completes; root `postinstall` (`scripts/link-plugin-dev-sdk.mjs`) fails `EPERM` creating directory symlinks for excluded dev plugins. Workaround: create NTFS junctions (same limitation recorded in `M0-SETUP.md`). |
| Build | `pnpm build` | Fails at `@paperclipai/paperclip-runner check:protocol-manifest`. On this checkout the cause is `core.autocrlf=true` writing CRLF into generated baseline files, so the generator's byte comparison fails. After LF-normalising the tree the check passes. |
| Build (LF tree, Git Bash) | `pnpm build` | 35/36 workspace projects build; `@paperclipai/paperclip-runner` fails `ERR_UNSUPPORTED_ESM_URL_SCHEME` (a script imports a Windows absolute path instead of a `file://` URL); `packages/db` also requires Unix `cp`. |
| Tests | `pnpm test:run` | `scripts/run-vitest-stable.mjs` calls `spawnSync("pnpm", …)`, which is `ENOENT` on Windows (pnpm is a `.cmd`/`.ps1`, not a POSIX executable). |
| Tests (direct) | `pnpm exec vitest run <file>` | Vitest 4.1.11 startup error `ERR_PACKAGE_IMPORT_NOT_DEFINED: #module-evaluator` under Node 25.8.0. |

**Conclusion:** upstream's build and test toolchain at the pin does not run
unmodified on this Windows workstation for platform reasons (line endings,
symlink `EPERM`, Unix-only shell commands, POSIX `pnpm` spawn, absolute-path ESM
imports). No upstream pass rate could be captured here. Progress: **no service
restart, deployment, or destructive action was performed.**

The §3.1 build/install/test evidence must be captured on the Linux reference
host (the VPS or an equivalent Linux container). That capture is **not yet
done** and is a remaining M0 item.

## 6. Re-pin recommendation

**Retain `v2026.916.1` (`d554c4789`) as the M0 provenance baseline.** Reasons:

1. It is the newest upstream **stable** release; there is no newer stable tag,
   only canaries.
2. It is a reproducible release tag. Upstream `master` is a moving, rewritten
   line that does not even contain the previous stable tags (see §4.1), so
   pinning the M0 baseline to `master` or fork `main` would pin unreleased,
   non-reproducible code.
3. The fork and the VPS already carry the tag object, so the pin is auditable
   on both sides.

Re-pinning to the current fork `main` is a separate question from the §3.1
provenance baseline: it is the **reference-instance definition (Board decision
D1)**. The current fork `main` already contains an upstream merge beyond the
pin, so re-pinning would change both the upstream level and the fork content at
once. If the Board selects fork `main` as the reference instance, that decision
should name an exact SHA (`41675dcec…`) and require the VPS to be moved to it.

## 7. Open proposals and follow-ups

1. **Missing `upstream` remote on the VPS.** The VPS checkout (`/srv/crewspan`)
   has only `origin`; the fork-boundary assumption that `upstream` is a
   configured read-only remote does not hold there. Proposed follow-up: add the
   `upstream` remote to the VPS checkout — a repository/operational change that
   needs explicit authorization and was **not performed** here.
2. **`doc/FORK-BOUNDARY.md` topology drift.** Its §1/§5 describe branches
   `master` and `m0/paperclip-v2026.916.1` and state that `origin/master`
   mirrors upstream. In reality the fork default branch is `main`, there is no
   `master`, and `origin/main` carries fork commits and is 27 commits behind
   upstream `master`. Proposed follow-up: correct the topology section (not an
   unapproved repository mutation here).
3. **Telemetry / announcements / update-channel decisions.** Per
   `doc/FORK-BOUNDARY.md` §6 these live dependencies on Paperclip infrastructure
   remain open; they are Board decisions, tracked outside this record.
4. **Linux build/test capture.** Run §3.1 install/build/test at the pin on the
   Linux reference host and record the pass rate here.
5. **Upstream engagement.** No upstream issue/PR proposing Crewspan changes
   (human org nodes #11353, pluggable authorization/sandbox hooks, scoped
   visibility) has been opened yet; record upstream responses here when they
   exist.

## 8. Merge discipline

- Keep this pinned baseline; record each upstream update here when the M0 sync
  rehearsal begins.
- Rehearse a sync on an isolated branch, measure conflicts and tests, and follow
  the v3 M0 gate before moving the pin.
- Do not assume `origin/main` is a clean mirror of upstream; verify both remotes
  (see §3–§4).
