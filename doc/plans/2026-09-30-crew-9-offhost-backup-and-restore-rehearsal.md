# CREW-9 — Local off-host encrypted backup and documented restore rehearsal

Date: 2026-09-30 (UTC). Operator: Crewspan QA & Release (agent). Scope: the **local** M0
reference instance (`PAPERCLIP_HOME=%USERPROFILE%\.paperclip`, `PAPERCLIP_INSTANCE_ID=default`,
embedded PostgreSQL on `127.0.0.1:54329`, app on `127.0.0.1:3100`). The VPS is out of M0 scope
per the Board direction of 2026-09-29.

Result: **restore rehearsal PASSED; fresh supported backup taken and verified; encrypted
archive produced and integrity-verified; off-host copy placed and re-verified on the far side.**
Board decision **D3** (2026-09-30) named the destination, so the last acceptance criterion is now
met. See §7 for the placement and §8 for residual risk.

## 1. Live instance was untouched

| Check | Before | After |
|---|---|---|
| `GET /api/health` | `status: ok` | `status: ok` |
| app listener | `127.0.0.1:3100` (dev server, tsx) | unchanged |
| embedded PG | PID on `127.0.0.1:54329`, data dir `...\instances\default\db` | unchanged, same data dir |
| `databaseBackup.status` | `warning` (latest backup 47.5h old) | `ok` (latest = the backup taken in §4) |

Actions against the live instance were read-only except the supported logical backup (§4). No
restore, migration, or service restart was performed on `default`. The rehearsal (§6) used a
separate scratch `PAPERCLIP_HOME` and a separate embedded-PG port.

## 2. The "known issue" — stale backup warning: confirmed, with root cause

Observed: on a cold start the instance reported `databaseBackup.status = warning` with the newest
backup 47.5h old. After a manual backup the status flipped to `ok` with no warnings. So the
warning is **not** a backup failure — it is a scheduling gap.

Root cause (code): `server/src/index.ts:1828-1844` arms automatic backups with
`setInterval(() => runServerDatabaseBackup("scheduled"), intervalMinutes)`. There is **no backup
run at startup**, so the first automatic backup lands one interval after the process starts
(`PAPERCLIP_DB_BACKUP_INTERVAL_MINUTES`, default 60). Any time the instance is down longer than
the alert age (`PAPERCLIP_DB_BACKUP_MAX_AGE_HOURS`, default 26h) the health endpoint correctly
reports stale. Implication for DR: after a crash/restart there is **no recent backup until the
first tick**, and a crash shortly after start has nothing fresh to restore.

Retention note: the Board policy is "7 daily + 4 weekly". The CLI default retention is 30 daily
days + 4 weeks + 1 month, and the running server reads retention from **Instance Settings (DB)**,
not from `PAPERCLIP_DB_BACKUP_RETENTION_DAYS` (`server/src/index.ts:834-835`). The configured
retention does not currently match the Board policy — flagged as a follow-up.

## 3. Fresh supported backup (§2 of the task)

```
cd C:\Crewspan
$env:PAPERCLIP_HOME="$env:USERPROFILE\.paperclip"; $env:PAPERCLIP_INSTANCE_ID="default"
node cli/node_modules/tsx/dist/cli.mjs cli/src/index.ts db:backup \
  --dir "$env:USERPROFILE\.paperclip\instances\default\data\backups" --json
```

Result:

- File: `paperclip-20260930-153620.sql.gz`
- Size: 2,112,551 bytes
- SHA-256: `2f7765d474b6aa9ce56480f8465e4f65384b5008b83b487f2c6f44fc111034fa`
- Connection source: `embedded-postgres@54329` (no `pg_dump` on this host, so the built-in
  JavaScript backup engine is used; those dumps carry statement breakpoints, which the restore
  path relies on).

Health immediately after: `databaseBackup.status: ok`, `warnings: []`, latest backup age 0h.

## 4. Encryption + integrity verification

Method chosen for the rehearsal: **AES-256-GCM** (Node `crypto`), a 32-byte random key, format
`magic(20) || iv(12) || authTag(16) || ciphertext`. No `age`/`gpg`/`restic`/`openssl` is
installed on this Windows host, so a dependency-free implementation was used. (If the Board
prefers `age`/`restic`, that changes only the tool, not the design.)

- Ciphertext: `paperclip-20260930-153620.sql.gz.enc`, **2,112,599 bytes** (+48-byte header)
- Ciphertext SHA-256: `d5cd97814043caf0a55977ddd3a51cd28a36ec869ae9cb2e0191bb4a43805a05`
- Key file: 32 bytes, SHA-256 `5953b3b4197fa992f4f5ba72d3fb88a269952ebc95ff77a03ee301523b54c43b`
- Round-trip: decrypt → SHA-256 `2f7765…34fa` = plaintext SHA-256, GCM tag verified. **PASS.**

The archive and key are held **staged on the reference host** (off the instance home and off the
repo), not off-host:

```
C:\Users\jbmst\crewspan-dr-staging\archive\paperclip-20260930-153620.sql.gz.enc
C:\Users\jbmst\crewspan-dr-staging\keys\backup-key-20260930.bin
```

This is a rehearsal artifact. It satisfies "encrypted + hash-verified", not "off-host" (§8).

## 5. Restore rehearsal (isolated) — PASSED

Method: scratch `PAPERCLIP_HOME` at `C:\Users\jbmst\crewspan-dr-staging\home`, instance `drill`,
**fresh empty** embedded-Postgres cluster on a free port (`56123`; the live `54329` was never
touched), then the checked-in supported API `runDatabaseRestore` from `@paperclipai/db`
(this checkout has no `db:restore` CLI). Helper: temporary `restore-drill.ts`, run with `tsx` from
`C:\Crewspan\packages\db`, deleted afterwards. The helper refuses a non-empty DB dir and stops the
embedded server in a `finally` block.

Timings (ms from start):

```
initdb-done        6,943
postgres-started   7,134  (port 56123)
restore-complete  12,739
total             12,853  (wall clock ~14.7s incl. tsx startup)
```

Fidelity check — restored vs live `public` schema:

| Metric | Live (`54329`) | Restored drill (`56123`) |
|---|---|---|
| public tables | 214 | 214 |
| companies | 2 | 2 |
| agents | 18 | 18 |
| issues | 21 | 21 |
| projects | 3 | 3 |
| activity_log rows | 963 | 963 |

The drill cluster was then stopped and deleted (~107.7 MB, 2,891 files). The live `default`
instance and database were not modified by any of this.

## 6. What a logical SQL backup does **not** cover

Restoring the `.sql.gz` alone is **not** full instance disaster recovery:

- **Local uploads / storage** — `instances/default/data/storage/**` (issue attachments,
  generated avatars, work-product files). Not in the dump.
- **Encrypted-secrets master key** — `instances/default/secrets/master.key`. Secret rows are
  restored, but their values are **undecryptable** without the matching key
  (`doc/DATABASE.md:381-391`).
- **Agent JWT signer** — `%USERPROFILE%\.paperclip\agent-jwt-secret.txt`
  (`PAPERCLIP_AGENT_JWT_SECRET`). Existing agent run tokens stop validating if it is lost or
  rotated.
- **Per-company agent state** — `companies/<id>/…` (e.g. `codex-account-home-secrets`), plus
  `workspaces/**`, `projects/**`, `skills/**`, `telemetry/state.json`, and instance config.
- **Decision-signing key** — `instances/default/secrets/decision-signing.key`.

A real DR set therefore pairs the DB dump with the storage directory and the key files, each
protected separately with the key held under Board custody.

## 7. Board decision D3 (2026-09-30) — off-host copy placed and verified

Recorded Board policy (`UPSTREAM.md` §9.4): "an encrypted copy to an off-host destination, 7
daily plus 4 weekly retained, Board-owned, with a documented restore rehearsal." Board decision
D3 (comment on this issue, 2026-09-30) named the destination and custody:

| Field | Value (Board D3) |
|---|---|
| Destination | `/var/backups/crewspan/` on `zero1-contabo` (root-only), via `ssh zero1-contabo` + `sudo -n` |
| Encryption | AES-256-GCM (as rehearsed); ciphertext only off-host |
| Key custody | Board-side, stored **separately** from the archive — never beside it, never in the repo, never in an issue or comment |
| Retention | 7 daily + 4 weekly |
| Owner | Board |

**Placement performed (off-host copy now in place):**

1. Created the destination read-only: `sudo -n install -d -o root -g root -m 700 /var/backups/crewspan`.
2. `scp` of the already-built, already-hashed ciphertext to a staging dir, then
   `sudo -n install -o root -g root -m 600` into the destination (only the ciphertext — the key
   was **not** copied to the VPS).
3. Verified size **and** sha256 on the far side; staging file removed.

Far-side evidence (exact commands + output):

```
$ sudo -n ls -l /var/backups/crewspan/
-rw------- 1 root root     754 Sep 30 16:50 README-backups.txt
-rw------- 1 root root 2112599 Sep 30 16:50 paperclip-20260930-153620.sql.gz.enc

$ sudo -n sha256sum /var/backups/crewspan/paperclip-20260930-153620.sql.gz.enc
d5cd97814043caf0a55977ddd3a51cd28a36ec869ae9cb2e0191bb4a43805a05

$ sudo -n stat -c 'size=%s bytes; mode=%a; owner=%U:%G' .../paperclip-20260930-153620.sql.gz.enc
size=2112599 bytes; mode=600; owner=root:root

$ sudo -n stat -c 'dir mode=%a owner=%U:%G' /var/backups/crewspan
dir mode=700 owner=root:root
```

| Property | Staged ciphertext (reference host) | Far side `/var/backups/crewspan/` | Match |
|---|---|---|---|
| Size (bytes) | 2,112,599 | 2,112,599 | yes |
| SHA-256 | `d5cd97…a05` | `d5cd97…a05` (`d5cd97814043caf0a55977ddd3a51cd28a36ec869ae9cb2e0191bb4a43805a05`) | yes |
| Mode / owner | — | `0600 root:root`, dir `0700 root:root` | root-only |

**Scope note:** the VPS remains out of M0 scope as a *reference instance* and was not modified as
one (service still `inactive`/`disabled`, no listener on `:3100`, no data touched). Use as a
**backup sink** is the separate, non-destructive use Board D3 authorised.

**Key custody (separate, off-host):** the AES-256-GCM key is **not** on the VPS and never travels
with the ciphertext. It remains at the Board-side staging path
(`C:\Users\jbmst\crewspan-dr-staging\keys\backup-key-20260930.bin`, 32 B, SHA-256
`5953b3b4…43b`), held by the Board and separate from the archive. A non-secret
`README-backups.txt` in `/var/backups/crewspan/` documents owner, retention, encryption and key
custody (no key material).

## 8. Residual risk / follow-ups

1. ~~**Off-host copy not placed**~~ — **resolved 2026-09-30**: ciphertext copied to
   `/var/backups/crewspan/` on `zero1-contabo`; far-side size + sha256 re-verified (§7). All
   acceptance criteria are now met.
2. **Key custody is Board-side, not yet independently off-host** — the AES-256-GCM key is held
   separately from the ciphertext (never on the VPS), but it currently rests on the Board-side
   reference host. Board custody should move/escrow it per its own key policy; until then the
   ciphertext alone is not restorable by anyone but the Board.
3. **No startup backup** — `server/src/index.ts:1828-1844`; add an immediate run on boot (or a
   shorter first interval) so a cold start is not stale for up to an hour.
4. **Retention mismatch** — configured retention ≠ the Board's 7d+4w policy; set it in Instance
   Settings / config.
5. **Key files not backed up** — pair the DB dump with `secrets/master.key`,
   `secrets/decision-signing.key`, `agent-jwt-secret.txt`, and `data/storage/**` for real DR.
6. **App-boot proof** — the rehearsal verified table + row fidelity but did not start the full
   server against the restored DB; the migration/health path against a restored cluster is still
   unproven.
7. **Out-of-scope observation** — the running instance reports `deploymentMode: local_trusted`
   and runs the dev server (`pnpm dev:server`), while the Board recorded `authenticated` +
   production start. Covered by `CREW-11`, noted here only.

## 9. Evidence appendix

- `GET http://127.0.0.1:3100/api/health` (before): `databaseBackup.status=warning`,
  `latest=paperclip-20260928-160142.sql.gz`, `ageHours=47.5`.
- Manual backup output: `paperclip-20260930-153620.sql.gz`, `sizeBytes=2112551`.
- `GET /api/health` (after): `databaseBackup.status=ok`, `warnings=[]`,
  `latest=paperclip-20260930-153620.sql.gz`.
- `Get-FileHash … -Algorithm SHA256` = `2F7765…34FA`.
- `dr-encrypt.mjs encrypt` JSON: plaintext 2,112,551 B sha `2f7765…34fa`;
  ciphertext 2,112,599 B sha `d5cd97…a05`.
- `dr-encrypt.mjs decrypt` JSON: `auth: gcm-tag-ok`, decrypted sha `2f7765…34fa` (match).
- `restore-drill.ts` JSON timeline (above) + verify block: `publicTableCount: 214`,
  `rows_companies: 2`, `rows_agents: 18`, `rows_issues: 21`, `rows_projects: 3`,
  `rows_activity_log: 963`.
- `ssh zero1-contabo 'sudo -n sha256sum /var/backups/crewspan/paperclip-20260930-153620.sql.gz.enc'` =
  `d5cd97814043caf0a55977ddd3a51cd28a36ec869ae9cb2e0191bb4a43805a05` (matches staged ciphertext).
- `ssh zero1-contabo 'sudo -n stat -c %s /var/backups/crewspan/paperclip-20260930-153620.sql.gz.enc'` =
  `2112599` (matches); dir `/var/backups/crewspan` `0700 root:root`, file `0600 root:root`.
- `ssh zero1-contabo 'systemctl is-active crewspan; systemctl is-enabled crewspan'` = `inactive` /
  `disabled`; no listener on `:3100` — VPS service untouched.
- `git -C C:\Crewspan status --short --branch` → `## main` (no residue; scratch helper deleted).
