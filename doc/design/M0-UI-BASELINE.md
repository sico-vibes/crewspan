# M0 UI design baseline evidence

Captured for CREW-8 against the **local** M0 reference deployment at `C:\Crewspan`, per the
[v3 plan §3.1](../plans/2026-09-24-crewspan-e2e-v3.md#31-pin-and-baseline) ("Capture the
design baseline"). This is a read-only evidence capture: no visual redesign, no Crewspan
product changes, nothing merged beyond this record and the screenshots it cites.

- **Fork baseline cited:** `main` at `49cac8af8` (Board decision, 2026-09-29 — see project
  description) / upstream pin `v2026.916.1` (`d554c4789`, recorded in `UPSTREAM.md`).
- **Instance actually running for capture:** `C:\Crewspan`, `main` at `0a591975f` (one
  docs-only commit past the pinned `49cac8af8` — `git status` clean, no working-tree changes).
- **Capture date:** 2026-09-29.
- **Start command used:** `C:\Crewspan\Start-Default.ps1` (`PAPERCLIP_HOME=%USERPROFILE%\.paperclip`,
  `PAPERCLIP_INSTANCE_ID=default`, `HOST=127.0.0.1`, `PORT=3100`, `SERVE_UI=true`), which runs
  `pnpm --filter @paperclipai/server dev` — **dev-mode service**, not the production `server start`
  target the Board decided on. This is the same explicitly recorded temporary deviation
  `M0-SETUP.md` and the project description already flag (owned by CREW-11), reconfirmed here
  because it is what this baseline was captured against.
- **Health at capture time:** `GET /api/health` → `status: ok`, `deploymentMode: local_trusted`,
  `deploymentExposure: private`, `commit 0a591975f`. Note: the Board decision (project
  description, 2026-09-29) sets auth mode to `authenticated`, superseding the `local_trusted`
  default — the running instance had not been switched over at capture time. Flagged as a
  baseline gap below; not fixed here (out of this issue's scope).

## 1. Viewport/theme evidence records (6)

Screenshots of the default authenticated landing screen (`Dashboard`, Personal Workspace),
reached at `http://127.0.0.1:3100/` with no further navigation. All six attached to the
delivery comment; local capture paths for reproduction reference only (not links — see
`doc/design/m0-baseline/` in this branch):

| # | Theme | Width | File | `<html>` class observed |
|---|---|---|---|---|
| 1 | dark | 1440×900 | `screen-dark-1440.png` | `dark` |
| 2 | dark | 1024×768 | `screen-dark-1024.png` | `dark` |
| 3 | dark | 390×844 | `screen-dark-390.png` | `dark` |
| 4 | light | 1440×900 | `screen-light-1440.png` | *(none)* |
| 5 | light | 1024×768 | `screen-light-1024.png` | *(none)* |
| 6 | light | 390×844 | `screen-light-390.png` | *(none)* |

**Reproducible commands** (headless Chromium via the repo's `browser-automation` skill,
Playwright API underneath):

```js
// theme is driven by prefers-color-scheme, NOT a UI toggle or localStorage —
// verified by probing localStorage (empty of any theme key) and by
// page.emulateMedia({ colorScheme }) flipping documentElement.className
// between "dark" and "" on reload.
await page.emulateMedia({ colorScheme: theme });   // 'dark' | 'light'
await page.setViewportSize({ width, height });      // 1440x900 | 1024x768 | 390x844
await page.reload({ waitUntil: 'load' });
await page.screenshot({ path });
```

**Theme-switch mechanism:** none found in the UI itself (no toggle under the account menu or
settings was reachable/needed — theme resolves purely from `prefers-color-scheme` via
`next-themes`/Tailwind's `dark` class strategy, with no stored override in `localStorage` for
this workspace). This is itself a baseline fact worth recording: there is currently no
in-app light/dark control, only OS/browser preference.

**Console/network at capture:** zero console errors or warnings and zero failed requests
across all six captures.

**Observed gap:** at 390×844 in **light** theme, the fixed bottom tab bar (Home / Tasks /
New Task / Agents / Inbox) visually overlaps the last stat row ("Month Spend" / "Pending
Approvals" figures partially obscured) — see `screen-light-390.png`. The same viewport in
**dark** theme does not show this overlap (`screen-dark-390.png`), same data, same scroll
position (top). Not reproduced further or fixed here — flagged for the design/QA track as a
mobile responsive defect on the Dashboard screen, light theme specifically.

## 2. Token inventory

The repository already carries a checked-in token audit at
[`doc/design/TOKEN-AUDIT.md`](TOKEN-AUDIT.md) (run scope `ui/src/`, dated 2026-07-06, ripgrep
method, read-only — no source modified). Cited here rather than re-run, since it is current
against this baseline (no `ui/src/index.css` changes between that audit and the pinned
`49cac8af8` / observed `0a591975f`). Headline counts:

- Single token source confirmed at `ui/src/index.css` (Tailwind v4, CSS custom properties via
  `@theme`), per `DESIGN.md`'s token-layer contract.
- ~80+ existing tokens across three tiers: semantic (shadcn core set), brand (agent gradients,
  status hues), domain (match-chip, annotation highlights, motion/typography).
- Hardcoded-value drift: ~1,550 sites (hex/rgb/arbitrary-spacing/radius/shadow) outside the
  3,115 Tailwind-palette-class sites reported separately (`bg-red-500` etc., not yet ruled in
  or out of scope by the design owner — see that document's flagged decision).

## 3. Component inventory

Likewise cited from the checked-in
[`doc/design/COMPONENT-INVENTORY.md`](COMPONENT-INVENTORY.md) (scope `ui/src/components/` and
`ui/src/pages/`, dated 2026-09-21, read-only):

- 24 shared primitives (`ui/src/components/ui/`), all checked against the live shadcn
  registry — no updates found (in sync).
- 206 feature components (178 flat + 28 in nested subdirs), 73 pages.
- **Grand total: 303** components, matching `DESIGN.md`'s own "24 + ~277" estimate.

## 4. Storybook build result

**Blocked** — the build fails on this Windows host, before producing `storybook-static/`.

Command run (from `C:\Crewspan`, dependencies already installed per `M0-SETUP.md`):

```
npm exec --yes --package=pnpm@9.15.4 -- pnpm --filter @paperclipai/ui build-storybook
```

Result: `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` — exit status 1. Root cause:

```
[plugin storybook-agent-avatar-assets]
Error: Only URLs with a scheme in: file, data, and node are supported
by the default ESM loader. On Windows, absolute paths must be valid
file:// URLs. Received protocol 'c:'
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]
```

Traced to `scripts/storybook-agent-avatar-assets.mjs:11`:
`serverRequire.resolve("tsx/esm/api")` returns a raw Windows path
(`C:\Crewspan\node_modules\...`), which is then passed straight to a dynamic
`import()`. Node's ESM loader on Windows requires `file://`-scheme URLs for
absolute paths — a bare `C:\...` path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
This is a **build-only Vite plugin bug that is Windows-specific** (the reference
host for this baseline is Windows); it would need `pathToFileURL()` around that
`resolve()` call to fix. Not fixed here — out of this issue's scope (evidence
capture only, no source changes).

**Consequence for other Storybook-dependent evidence:** `tests/storybook-visual/`
(the Playwright pixel-stability suite, §12.7 gate 3) requires
`ui/storybook-static/index.json`, which this failure never produces, so that
suite is transitively blocked on this host too. Separately, its own baseline
archive is unconfigured (`tests/storybook-visual/baseline-manifest.json`:
`snapshotCount: 0`, `archive.url`/`sha256`/`byteSize` all empty), so even a
successful build would have nothing to diff against yet. That manifest also
pins its environment to `platform: "ubuntu-24.04"` — this Windows host is not
the intended capture platform for that suite regardless of the plugin bug.

### Update (2026-09-29, CREW-26): build fixed

The gap above is closed. `scripts/storybook-agent-avatar-assets.mjs` (and the same pattern in
`scripts/serve-storybook-static.mjs`, used by the Playwright suite's `webServer`) wrapped
`serverRequire.resolve("tsx/esm/api")` in `pathToFileURL(...).href` before the dynamic
`import()`. Verified on this Windows host:

- `pnpm --filter @paperclipai/ui build-storybook` exits 0 and produces `ui/storybook-static/`
  (confirmed `index.html` and `index.json` present; build completed in ~4m39s).
- `npx playwright test --config tests/storybook-visual/playwright.config.ts --project=stories`
  starts: the `webServer` (`scripts/serve-storybook-static.mjs`) boots, Chromium launches, 2645
  tests are collected and run against the built stories.
- Remaining state is unchanged from the platform-lock note above, not a new gap: no baseline
  archive is configured yet (`baseline-manifest.json` still empty), and the suite's
  `maxDiffPixels: 0` comparisons are pinned to `ubuntu-24.04` — a Windows run cannot produce a
  pass/fail pixel verdict regardless. The one test run manually here failed only with "snapshot
  doesn't exist yet, writing actual" (expected with no baseline downloaded), not the ESM error.
- No behavior change on Linux/macOS: `pathToFileURL()` on a POSIX absolute path returns the
  equivalent `file://` URL, so the import target is identical there.

## 5. `DESIGN.md` principles (source of truth, v0.3)

Captured verbatim reference (see [`DESIGN.md`](../../DESIGN.md) at the repo root — unchanged
at this baseline):

- Product stance: *"Every screen should answer, in order: what is happening, does it need me,
  what do I do about it."* Density in service of scanning, never chrome.
- Single token source `ui/src/index.css`; no parallel token source.
- 8 principles: one way to say each thing; tokens are the only source of visual values;
  spacing routes through tokens (scale TBD); hierarchy through structure not decoration;
  systematic status; machine values look machine-made; canonical term is *task* (rename not
  yet enforced — still *"Tasks"* in the captured nav, consistent with `DESIGN.md`'s explicit
  note that the rename is out of scope for the current extraction run); agent-modifiable by
  design.
- Zero-visual-change enforcement for the ongoing simplification run is Storybook-baseline
  driven, not screenshot-of-the-app driven — this document's §1 screenshots are a separate,
  app-level baseline for the v3 plan §3.1 gate, not a substitute for that Storybook baseline.

## 6. Observed UI surfaces mapped to the v3 plan (§12.2)

From the captured Dashboard's sidebar (see screenshots), the current top-level nav is:
**Dashboard, Inbox** / WORK: **Tasks, Projects, Routines, Artifacts** / ORG: **Agents,
Skills, Connectors, Audit** / CHATS: per-agent chat threads + **Board**.

| Observed surface (current UI) | v3 plan §12.2 new/extended surface | Plan's stated Paperclip ancestor | Fit |
|---|---|---|---|
| Dashboard | *(no direct plan entry — closest is the operational "what needs me" framing in §12.1)* | — | Existing surface, no planned Crewspan extension named yet |
| Tasks | Delegation tree, Result/evidence card, Sign-off, Runs and attempts (all extend Task detail) | Sub-issue list / Approval card / Run summary / Run history | Direct ancestor — Task detail is the plan's central "end-to-end operations view" (§12.3) |
| Projects | Files (project tab) | Artifacts view, issue documents | Direct ancestor |
| Routines | *(inherited, reused under Crewspan authority rules — §2.2 table)* | — | No new surface planned; authority rules wrap it |
| Artifacts | Files (project tab) shares this ancestor | Artifacts view | Direct ancestor |
| Agents | People (humans and agents); Effective access tab | Agents list plus agent detail; Agent detail configuration panel | Direct ancestor |
| Skills | *(unlisted in §12.2 — Skills persists as inherited, not explicitly mapped)* | — | Gap: plan doesn't name a Skills ancestor explicitly |
| Connectors | Model policy and data classes | Connections | Direct ancestor (plan says "Connections settings") |
| Audit | *(no explicit new surface — audit log requirements are in §5.12, not §12.2)* | — | Functional requirement exists (append-only audit, hash chain) but no named UI ancestor in §12.2 |
| Per-agent chat / Board (CHATS section) | Chat (channels, DMs, threads) | Task comment thread plus Inbox list | Direct ancestor — today's chat is already agent-DM-shaped, close to the plan's target |
| Inbox | Inbox (evolve "Mine") | "Mine"/Inbox | Direct ancestor |
| *(not observed on Dashboard — exists elsewhere per pages/ listing)* Org chart, Company Settings, Approvals, Costs | Org chart; Board & governance; Access requests; Cost per accepted task | Existing org chart; Company settings; Approval detail; Costs/budgets | Named ancestors exist; not captured in this screenshot set (out of the six-record scope — see §1) |

## 7. Baseline gaps identified

1. **Auth mode drift.** Running instance reports `deploymentMode: local_trusted`; the Board
   decision (2026-09-29) sets `authenticated` as the required mode. Not switched at capture
   time. (Not this issue's fix — flag for whoever owns the auth-mode switch.)
2. **Service mode drift.** Dev server (`pnpm dev:server`), not the production `server start`
   target — already tracked as CREW-11's scope; reconfirmed against this specific baseline
   capture.
3. **No in-app theme toggle.** Theme is OS-preference-only (`prefers-color-scheme`); there is
   no UI control an operator can use to force light/dark independent of the OS. Not
   necessarily a defect (may be intentional), but worth a design decision record if Crewspan
   wants an explicit toggle (§12 doesn't call one out either way).
4. **Mobile light-theme overlap.** See §1 "Observed gap" — bottom tab bar over dashboard stat
   row at 390px in light theme only.
5. **Paperclip branding still present.** Confirmed via `doc/FORK-BOUNDARY.md` (pinned-commit
   grep: 4,685/7,434 tracked files mention "paperclip") and directly visible in this capture
   (page `<title>Paperclip</title>`, "Paperclip" appended to the Dashboard document title).
   Relevant to v3 plan §1.5 "Crewspan name" trademark screen and §3.1 provenance — not a UI
   defect, a rebrand-scope item already tracked in `FORK-BOUNDARY.md`.
6. **§12.2 surface-to-ancestor gaps.** Skills and Audit have no explicitly named Paperclip
   ancestor in the plan's §12.2 table (see §6 above) despite being live top-level nav items
   today. Worth a plan addendum before UI work starts on either.
7. **Six-record scope did not reach Org chart, Company Settings, Approvals, or Costs**, all of
   which the plan names explicit ancestors for (§12.2). This document's six records satisfy
   CREW-8's acceptance criteria (which asks for six viewport/theme records, not full-surface
   coverage); a fuller per-surface capture is future work if M1+ needs it.

## 8. What this evidence does NOT claim

- No visual redesign and no Crewspan product change was made to produce this record.
- No later-milestone (M1–M7) implementation is included.
- This is not the Playwright pixel-stability baseline (§12.7 item 3) — that baseline is
  Storybook-story-scoped and lives under `tests/storybook-visual/`, separately gated by
  `pnpm storybook-visual:baseline`, whose archive manifest is unconfigured (no `archive.url`)
  at this baseline — see §4.
