# Claude local sign-in (Crewspan) — host-login adoption

**Status:** fixed and shipped on `main`. **Do not regress** — see §5.
**Date:** 2026-10-15
**Scope:** connecting a Claude (Anthropic) subscription on a `local_trusted` Crewspan instance.

---

## 1. Symptom

On a Windows workstation running Crewspan locally (`local_trusted`, only a `local`
execution environment), connecting Claude did not work, while the released
upstream Paperclip build (`paperclipai@2026.1012.0`) worked against the same
machine and the same Claude CLI.

Two different paths failed, with two different errors:

| Path | Endpoint | Failure |
| --- | --- | --- |
| Connectors / AI-connections "Connect Claude" | `POST /ai-connections/local` | `422` — matched only after a full browser sign-in the operator could not complete |
| Agent form / onboarding "Sign in with Claude" | `POST /setup-token-login-sessions` | `422 Environment driver "local" is not allowed here. Allowed drivers: sandbox` |

Live evidence from the instance log (times local):

```
23:52:16 POST /ai-connections/local/attempts/<id>/code  422
23:52:28 POST /api/companies/<id>/ai-connections/local  422
00:11:51 POST /api/companies/<id>/setup-token-login-sessions 422
00:16:40 POST /api/companies/<id>/ai-connections/local/check  422
```

## 2. Root cause

Crewspan is a fork of upstream Paperclip pinned to `v2026.916.1` and then merged
with upstream **`master`**. Upstream `master` still carries the *old* local
sign-in design (`server/src/services/local-ai-browser-login.ts`: the server
spawns the provider CLI in a host-side pseudo-terminal). The **released** build
(`v2026.1012.0`) replaced that: it lets a `local_trusted` operator connect Claude
using **the Claude CLI login already present on the machine** (`~/.claude`).

Crewspan's copy had that capability removed. Concretely:

* `ui/src/components/ai-connections/useLocalAiLogin.ts` hard-coded
  `const isolated = true;`, so the UI **always** created a fresh server-side
  sign-in session and never offered the host login.
* `server/src/services/local-ai-credentials.ts` rejected `loginHome === undefined`
  for every provider, so the server could not read the host login.
* `server/src/services/local-ai-login.ts` `check()` threw `422 "Start browser
  sign-in before checking this account."` when no session id was supplied.
* `server/src/routes/ai-connections.ts` `POST /ai-connections/local` required a
  session id for every provider.

The released build gates this on deployment mode:

```ts
// release v2026.1012.0
const isolated = intent.provider !== "anthropic" || !options.allowHostClaude;
```

Second, separate issue: the **agent-form** flow (`setup-token-login-sessions`)
runs the sign-in inside a **sandbox** environment (`allowedDrivers: ["sandbox"]`).
A local Windows install has only the `local` driver, so that route is a `422` by
design — **in the released build too**. It is not fixed here; it needs a sandbox
provider. The flow that matters locally is the AI-connections one.

### Why merging upstream did not fix it

Merging the release tag `v2026.1012.0` into this branch keeps **"ours"**: the
merge result still contains `local-ai-browser-login.ts` and still calls
`startLocalBrowserLogin`. Upstream `master` also *lags* the release here — it
still has `local-ai-browser-login.ts`. So building either `master` or a merge of
the tag reproduces the old, sandbox/PTY-bound behaviour.

## 3. The fix

Port the released behaviour into Crewspan (targeted, not a full re-pin):

| File | Change |
| --- | --- |
| `server/src/services/local-ai-credentials.ts` | Import `readClaudeToken`. Allow `anthropic` with no login home → read the host login (`readClaudeToken({ allowKeychain: true })`). Other providers still require a home. Actionable error for the no-home case. |
| `server/src/services/local-ai-login.ts` | `check()` allows `anthropic` with **no** open attempt; only other providers require a session. |
| `server/src/routes/ai-connections.ts` | `POST /ai-connections/local`: for `anthropic` without a session, require the **local operator** and save the host credential directly. |
| `ui/src/components/ai-connections/useLocalAiLogin.ts` | Add `options.allowHostClaude`; `isolated = provider !== "anthropic" \|\| !options.allowHostClaude`. |
| `ui/src/components/new-agent/AgentProviderConnection.tsx` | Pass `{ allowHostClaude: health.data?.deploymentMode === "local_trusted" }`. |
| `ui/src/components/OnboardingWizard.tsx` | Pass `{ allowHostClaude: localLoginHealth.data?.deploymentMode === "local_trusted" }`. |
| `server/src/services/windows-login-terminal.ts` | Build fix: `const childEnv: NodeJS.ProcessEnv = …` (the `delete childEnv.BROWSER` line failed `tsc` with `TS2339`). |

## 4. Verification

```powershell
$co = "<companyId>"; $b = @{ provider="anthropic"; method="subscription"; name="Claude";
  ownership="personal"; agentIds=@(); allAgents=$false } | ConvertTo-Json -Compress

# Before: 422 "Start browser sign-in before checking this account."
# After:  200 {"status":"ready"}
Invoke-WebRequest "http://127.0.0.1:3100/api/companies/$co/ai-connections/local/check" `
  -Method POST -ContentType application/json -Body $b

# Before: 422        After: 201 {"connectionId":…,"grantId":…}
Invoke-WebRequest "http://127.0.0.1:3100/api/companies/$co/ai-connections/local" `
  -Method POST -ContentType application/json -Body $b
```

Requires a Claude CLI login on the machine (`~/.claude/.credentials.json`, or the
macOS Keychain item). Without one, the call fails with the actionable
`"Run claude auth login in a terminal on the machine running Paperclip…"`.

## 5. Invariants — do not regress

1. `useLocalAiLogin` **must** keep the `allowHostClaude` option. Never re-introduce
   `const isolated = true;`.
2. Both call sites (`AgentProviderConnection`, `OnboardingWizard`) **must** pass
   `allowHostClaude` gated on `deploymentMode === "local_trusted"`. Do not enable
   it on authenticated/public instances.
3. `readVerifiedLocalAiCredential("anthropic")` with **no** login home **must**
   read the host login. With a login home it must **never** fall back to the
   ambient/operator credential (that isolation is deliberate and tested).
4. `local-ai-login.check()` **must** accept `anthropic` with no session id, and
   `POST /ai-connections/local` **must** accept `anthropic` with no
   `localSessionId` on a `local_trusted` instance.
5. Locked by tests — keep them green:
   * `server/src/__tests__/local-ai-credentials.test.ts`
   * `ui/src/components/ai-connections/useLocalAiLogin.test.tsx`

## 6. Syncing with upstream

Merge from **release tags**, not `master`. Upstream `master` diverges from the
released line and lags it for this area (see `UPSTREAM.md` §4.1). When re-pinning,
re-check §5 afterwards.

## 7. Not fixed here

* `setup-token-login-sessions` still requires a `sandbox` environment. That is
  upstream behaviour; it needs a sandbox provider configured for the instance.
* A stuck login lease can produce a repeating
  `Setup-token reaper: a lease release failed; it stays retryable` log line.
  Harmless; clear the stale `adapter_auth_sessions` lease row if it is noisy.
