# AI orchestration layer (Claude Cloud workflow)

**Scope.** This applies **only** when the work is done with Claude in **Claude Cloud** (claude.ai/code
sessions). It is not a rule for local Paperclip agents, for Codex or OpenCode run directly, or for
human contributors. Those follow the normal repo rules (`AGENTS.md`, `CLAUDE.md`).

**Owner decision.** Set by the project owner. Changing the roles or models below is the owner's call.

## 1. Roles

Claude is the **lead**. The lead pushes the plan forward by handing work to other agents and models.
It does not do the heavy lifting itself.

| Stage | Who | Model | Setting | May write code? |
| --- | --- | --- | --- | --- |
| Plan | Claude Opus 5.5 | `claude-opus-5-5` | effort `high` | **No.** Plans only. |
| Implement | Codex | `gpt-6-luna` | effort `high` | Yes. The only stage that writes code. |
| QA | OpenCode Go | `opencode-go/deepseek-v4.1-flash` | default variant | Tests, and fixes only what QA needs. |
| Lead | Claude (this session) | session model | - | Review, small fixes, git, PRs, CI. |

## 2. Flow

1. **Plan.** The lead gives the planner a written brief. The planner returns a plan. It writes no code
   and changes no files.
2. **Implement.** The lead gives the approved plan to Codex. Codex writes the code in the working tree.
3. **QA.** When Codex finishes, OpenCode Go (DeepSeek V4.1 Flash) runs the checks and tests the change
   needs, then reports to the lead.
4. **Lead review.** The lead reads the diff and the QA report. The lead lands the change, or sends it
   back. **Delegated agents never commit, push, open PRs or merge.** The lead does.

## 3. What the lead may do itself

Only two things:

- **Small changes.** A fix the lead can see is wrong and can correct in a few lines.
- **Tasks the owner gives to the lead directly.**

Everything else goes through the stages above. If the lead finds itself writing a large change,
it stops and plans it instead.

## 4. Merging

The owner's standing instruction: **merge to `main` right away once the change is confirmed good.**
"Confirmed good" means CI is green on the exact head, including the `ci / verify` gate, and the lead has
reviewed the diff. Merge with a **merge commit**, not a squash, so history from upstream stays linked.
This covers ordinary changes. It does not cover the actions in section 5 that need separate authorisation.

## 5. Rules that still apply

The guardrails in `CLAUDE.md` bind every stage and every agent:

- Port 3100 stays loopback-only.
- Never commit credentials or tokens. Never put a key in a brief, a prompt, a log or a file in the repo.
- Do not decide Board decisions B1-B9 in code.
- Deploy, restart, migration, restore and any destructive action need the owner's explicit authorisation.
- Verify before claiming. Run the command and cite the output.
- **Containment (S3).** No agent runs against real data until the S3 containment gate is met.
  Until then, delegated agents work only on this repository's code and public data.

## 6. Lane configuration

The `delegate-setup` skill stores this as **lanes** (`delegate-fleet.v1`). The map below is committed
as the project config `.delegate/config.json` (repo scope only, never global).

```json
{
  "version": "delegate-fleet.v1",
  "lanes": {
    "plan": { "implementer": "claude", "model": "claude-opus-5-5", "effort": "high", "readOnly": true },
    "implement": { "implementer": "codex", "model": "gpt-6-luna", "effort": "high" },
    "qa": { "implementer": "opencode", "model": "opencode-go/deepseek-v4.1-flash" }
  }
}
```

- `plan` is `readOnly` so the planner cannot edit files.
- `qa` sets no `variant`, so OpenCode's own default applies.
- Dispatch with `--lane <name>` through the matching `*-delegate` skill.
- A project config only takes effect in a clone after it is written through `delegate-setup`. The
  approval is stored in that clone's local git metadata, not in the committed file. A fresh session
  therefore must approve it once more (step 5 in section 7). A hand-edited file fails closed.

## 7. Session setup

A Claude Cloud container is temporary. Logins and installs are gone when the session ends. Each session:

1. Install the CLIs: `npm install -g @openai/codex opencode-ai`.
2. **Codex:** run `codex login --device-auth`. The owner opens the link and enters the code.
3. **OpenCode Go:** the owner provides the key through the environment's secrets, or pastes it in the
   session. Write it to `~/.local/share/opencode/auth.json` as `{"opencode-go": {"type": "api", "key": "..."}}`
   with mode `0600`. Do not commit it.
4. Verify each with one real request. A status line alone is not proof.
5. Re-approve the committed lanes for this clone:
   `node .claude/skills/delegate-setup/scripts/config.mjs write --scope project --cwd "$PWD" .delegate/config.json`
   then run `config.mjs load --cwd "$PWD"` and check that `projectTrusted` is `true`.

To avoid repeating this, put the installs in the environment's setup script and the OpenCode Go key in
its secrets.

## 8. Known caveats

- **Every git worktree needs its own lane approval.** The approval is stored per worktree in git metadata.
  A relay run from a fresh worktree stops with "project fleet config is not trusted". Run the `config.mjs write
  --scope project` command from step 5 of section 7 with `--cwd <worktree>` before dispatching.
- **Use a separate worktree per delegated task.** Codex and OpenCode then cannot disturb the PR branch. Codex's
  sandbox blocks child processes, so it cannot run test suites that spawn them. It says so in its report. The
  lead runs those tests, because the lead is not sandboxed the same way.
- **`pnpm install --frozen-lockfile` can fail on a fresh checkout.** `pnpm-lock.yaml` on `main` lags (only patch
  hashes) because the refresh workflow runs on `master`, not `main`. In a scratch worktree run
  `pnpm install --resolution-only --ignore-scripts --no-frozen-lockfile`, then `pnpm install --frozen-lockfile`. Never
  commit the changed lockfile: the PR policy (`ci / policy`) rejects it.
- **Gate commands must be checked.** `node --test <directory>` does not work. Name the test files.
- **QA finds real defects.** On T1 the QA agent found seven defects that 11 passing tests missed. Always run it.

- **Discovery shows OpenCode as unauthenticated.** `delegate-setup`'s probe looks for `●` (U+25CF), but
  OpenCode 1.18.x prints `•` (U+2022). This is a false negative in the probe. Verify with a real request.
- **The model alias is not pinned.** The Agent tool accepts only the alias `opus`, and this project has
  not verified that it resolves to Opus 5.5. To guarantee 5.5, run the planner through the `plan` lane,
  which passes `claude-opus-5-5`.
- **Not contained.** Delegated agents are not sandboxed by this project yet. Codex reports it can use a
  bundled `bubblewrap`, but no containment test has been run (see S3 in the M1 handoff).
- **Delegates can be wrong.** A delegate can report success on a broken change. The lead reviews the diff and
  the test output, not only the summary.
