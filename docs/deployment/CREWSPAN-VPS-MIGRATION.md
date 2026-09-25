# Crewspan VPS migration and remote access runbook

This runbook moves the Crewspan Paperclip fork from `C:\Crewspan` to a separate service on the Contabo VPS recorded in the Vex operations notes. It covers a private Tailscale route and a public HTTPS deployment. It does not assume that the VPS has been inspected or configured.

## Verified source facts and unverified host facts

Verified from the current checkout and local sources:

- Repository: `https://github.com/sico-vibes/crewspan`; default branch: `main`.
- The laptop checkout is on `main` at `60746a0ee412dc637b4b3c4af7c3b09136bc6aa1`, matching the GitHub `main` ref checked for this guide.
- `Start-M0.ps1` runs the app on `127.0.0.1:3100`, sets `PAPERCLIP_INSTANCE_ID=m0`, uses embedded PostgreSQL, and stores `PAPERCLIP_AGENT_JWT_SECRET` in the ignored file `C:\Crewspan\.paperclip-home\agent-jwt-secret.txt`.
- The local embedded database is `C:\Crewspan\.paperclip-home\instances\m0\db`; automatic database backups are under `C:\Crewspan\.paperclip-home\instances\m0\data\backups`.
- The root `package.json` pins `pnpm@9.15.4`. The root and ACP adapter packages require Node.js `>=24.11.0`. Codex ACP is included through `@agentclientprotocol/codex-acp` in the Codex adapter package.
- Paperclip documents logical compressed SQL backups. The CLI includes `paperclipai db:backup`; this checkout exports the restore API `runDatabaseRestore` but has no operator-facing `db:restore` CLI command.

The private Vex operations skill identifies the Contabo VPS and records that a separate Dashboard service already runs there. The laptop could not authenticate over SSH during this task, so this public repository document deliberately does not publish the VPS IP address or SSH target. Retrieve the current target from the private Vex notes, and confirm the following through the Board's authorized access before any deployment:

- DNS hostname and whether it resolves to this VPS.
- Which SSH public key is authorized and which operator account/key file to use. Do not put private keys in this repository or task comments.
- Current inbound firewall/security-group rules, SSH access, Nginx and systemd state.
- Available disk, RAM, CPU, OS version, installed Node.js/pnpm, PostgreSQL client utilities, Tailscale state, and existing services.
- The intended access choice (Tailscale-only or public HTTPS), who may sign in, the account/bootstrap plan, and the off-host backup destination and retention policy.
- Whether any other service already uses the proposed hostname or ports.

Keep Crewspan separate from the existing Dashboard: use its own checkout, service account, environment file, data root, systemd unit, and Nginx virtual host. Do not modify the Dashboard deployment or reuse its database, files, credentials, or service.

## 1. Board preflight decisions

Record these decisions before starting a live deployment:

| Value | Board/operator input |
|---|---|
| Access hostname (for example `crewspan.example.net`) | Required for public HTTPS; confirm DNS ownership and A/AAAA records |
| Access route | Prefer private Tailscale when all intended operators can use the tailnet; otherwise public HTTPS |
| SSH access | Confirm authorized public key and operator procedure; never send the private key to the VPS as a file outside normal SSH use |
| Authentication | `authenticated/private` for a private route; `authenticated/public` for internet access |
| Board/admin account | Identify who will claim or bootstrap the instance and how the one-time setup link will be handled privately |
| Backup destination | Separate encrypted/off-host destination, access controls, retention, and restore-test owner |
| Migration decision | Confirm whether to copy the laptop M0 database and selected instance files or begin with a fresh instance |

Do not expose a `local_trusted` instance remotely. It has no human login flow and is intended for a single-operator local machine.

## 2. Verify and prepare the VPS

The following commands are examples for an operator using the authorized SSH key. Replace `<operator-private-key>` and `<hostname>` locally; do not paste credential contents into shell history, tickets, or Git. The target IP and account below come from the Vex skill and still require confirmation.

From the authorized workstation:

```powershell
ssh -i <operator-private-key> <authorized-user>@<verified-vps-address>
```

On the VPS, record the existing state before changing anything:

```sh
hostnamectl
uname -a
df -h
free -h
nproc
ss -lntup
systemctl --type=service --state=running
nginx -t
nginx -T
```

If SSH authorization, disk/RAM headroom, DNS, firewall, or the current proxy layout is unclear, stop and have the Board/operator resolve it. Do not infer host state from this runbook. Keep public inbound ports to the minimum required by the chosen access route. Do not expose TCP 3100 to the internet.

## 3. Install Crewspan as an isolated service

Use a dedicated unprivileged account and separate paths. The examples use:

- Checkout: `/srv/crewspan`
- Persistent Paperclip state: `/var/lib/crewspan/paperclip`
- Persistent Linux home for Codex CLI auth: `/var/lib/crewspan/service-home`
- Private service environment: `/etc/crewspan/crewspan.env`

Confirm these paths do not collide with current services. As root, create the account and data directories:

```sh
useradd --system --create-home --home-dir /var/lib/crewspan/service-home --shell /usr/sbin/nologin crewspan
install -d -o root -g crewspan -m 0750 /srv/crewspan
install -d -o crewspan -g crewspan -m 0750 /var/lib/crewspan/paperclip
install -d -o crewspan -g crewspan -m 0700 /var/lib/crewspan/service-home
install -d -o root -g crewspan -m 0750 /etc/crewspan
```

Install a currently supported Node.js release at or above `24.11.0`. Install and activate the exact package manager version pinned in this source, `pnpm@9.15.4`, using the VPS's supported Node/package-manager installation method. Verify versions as the service identity and ensure systemd will have the same absolute `node` and `pnpm` paths in `PATH`:

```sh
node --version
pnpm --version
```

Both checks must pass; Node must be `v24.11.0` or newer and pnpm must report `9.15.4`. Install Git and, if needed for the SQL restore helper's `pg_dump`/`psql` fallback, PostgreSQL client utilities. Verify the chosen packages against the VPS OS before installing them.

Clone the latest default branch into the isolated checkout. The command can run as an authorized deploy operator with write access to `/srv/crewspan`:

```sh
git clone --branch main --single-branch https://github.com/sico-vibes/crewspan.git /srv/crewspan
cd /srv/crewspan
git rev-parse HEAD
```

Install dependencies and build the production workspace, including the UI bundled into the server:

```sh
cd /srv/crewspan
pnpm install --frozen-lockfile
pnpm build
```

Both commands must exit successfully. The production systemd service starts `server/dist/index.js` via the server package's `start` script; do not run `pnpm dev` as the long-lived production service.

For later upgrades, use `git fetch origin main` and fast-forward `main`; do not merge unrelated branches into the service checkout. Let the service account read/execute the checkout but not own the deployment code if updates are performed by an operator:

```sh
chown -R root:crewspan /srv/crewspan
find /srv/crewspan -type d -exec chmod 0750 {} +
```

Do not normalize file permissions recursively; preserve Git's executable modes. Future dependency installs/builds need to run as root or a deployment account with write access to `/srv/crewspan` before the service ownership is reapplied.

## 4. Configure persistence and systemd

Leave `DATABASE_URL` and `DATABASE_MIGRATION_URL` unset to use embedded PostgreSQL. With `PAPERCLIP_HOME=/var/lib/crewspan/paperclip` and `PAPERCLIP_INSTANCE_ID=m0`, the database lives at:

```text
/var/lib/crewspan/paperclip/instances/m0/db
```

The service identity must own and be able to write the entire persistent data root. The repository itself should remain separate and should not contain database files, runtime secrets, OAuth state, backups, or agent workspaces.

Create `/etc/crewspan/crewspan.env` as root with mode `0640`, owned by `root:crewspan`. Do not commit or print this file. Use this baseline for a private Tailscale deployment; substitute the Board-approved canonical URL. For private mode, URL handling can be automatic, but setting the canonical URL is still preferred for consistent browser and callback origins:

```dotenv
PAPERCLIP_HOME=/var/lib/crewspan/paperclip
PAPERCLIP_INSTANCE_ID=m0
HOME=/var/lib/crewspan/service-home
HOST=127.0.0.1
PORT=3100
SERVE_UI=true
PAPERCLIP_MIGRATION_AUTO_APPLY=true
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private
PAPERCLIP_PUBLIC_URL=https://<board-approved-hostname>
TRUST_PROXY=loopback
PAPERCLIP_DB_BACKUP_ENABLED=true
PAPERCLIP_DB_BACKUP_DIR=/var/lib/crewspan/paperclip/instances/m0/data/backups
PAPERCLIP_DB_BACKUP_RETENTION_DAYS=30
PAPERCLIP_DB_BACKUP_MAX_AGE_HOURS=26
PAPERCLIP_AGENT_JWT_SECRET=<load-a-random-secret-from-the-approved-secret-store>
```

`PAPERCLIP_AGENT_JWT_SECRET` is sensitive. Set it using the Board's approved secret-delivery method, not by committing an example value or copying it into this guide. It should be generated with a cryptographically secure random generator. Restrict `/etc/crewspan/crewspan.env` to root and the service group. If the instance is behind a local reverse proxy, `TRUST_PROXY=loopback` trusts only the local proxy network; do not set `TRUST_PROXY=true`. The default is to trust no proxy.

For a public deployment, set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`, keep `HOST=127.0.0.1`, set the exact public HTTPS URL, and retain the default public-mode authentication rate limiting. Do not disable `PAPERCLIP_AUTH_RATE_LIMIT_ENABLED` unless a verified front-door rate limiter replaces it.

Create `/etc/systemd/system/crewspan.service`:

```ini
[Unit]
Description=Crewspan Paperclip control plane
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=crewspan
Group=crewspan
WorkingDirectory=/srv/crewspan
EnvironmentFile=/etc/crewspan/crewspan.env
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/pnpm --filter @paperclipai/server start
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/var/lib/crewspan

[Install]
WantedBy=multi-user.target
```

Adjust `/usr/bin/pnpm` and `PATH` to the verified installation paths. If the local Node package manager shim cannot locate Node under systemd, use the absolute `pnpm` path and include the absolute Node binary directory. Do not load an interactive shell profile from the unit. Validate filesystem protections against actual runtime writes before enabling them; if Paperclip needs another write directory, add only that specific path.

After migration restore is complete (or for a fresh install once ready for initial setup):

```sh
systemctl daemon-reload
systemctl enable --now crewspan
systemctl status crewspan --no-pager
```

## 5. Migrate laptop M0 data safely

Decide whether this is a fresh instance or a migration before starting Crewspan on the VPS. For a migration, restore into a new, empty VPS data root. Keep a second copy of the laptop state until the restored VPS has passed acceptance. Do not copy a running PostgreSQL data directory.

### 5.1 Create a supported compressed SQL backup on Windows

Leave `Start-M0.ps1` running so its embedded PostgreSQL server is available to the backup CLI. In another PowerShell window at `C:\Crewspan`, run:

```powershell
npm exec --yes --package=pnpm@9.15.4 -- pnpm paperclipai db:backup --dir 'C:\Crewspan\.paperclip-home\instances\m0\data\backups' --json
```

Confirm the command reports a completed backup and note the exact `.sql.gz` filename and size. Keep the archive private. A logical database backup includes database data, migration history, and plugin-owned schemas, but not the local storage directory, local encrypted-secrets master key, instance environment/config files, workspaces, or Codex login state.

If preserving uploaded local-disk files or encrypted secrets, stop the laptop app cleanly with Ctrl+C first, then make separate protected copies of the applicable paths:

- Local disk uploads, if used: `C:\Crewspan\.paperclip-home\instances\m0\data\storage`.
- Local encrypted secret key, if used: `C:\Crewspan\.paperclip-home\instances\m0\secrets\master.key`.
- Existing agent JWT signer: `C:\Crewspan\.paperclip-home\agent-jwt-secret.txt`.

Only migrate the storage directory/key if the database references those files or encrypted values. Preserve the master key together with the database or the encrypted secrets cannot be decrypted. Transfer these items separately using an approved encrypted channel and restrict their destination permissions. Do not transfer the laptop's `db` directory, entire `.paperclip-home`, `.codex` state, browser state, or arbitrary workspace contents as a substitute for a supported migration.

### 5.2 Transfer only over authenticated SSH/SCP

Use the operator's authorized SSH key and the confirmed hostname/IP. The VPS SSH host key must be verified through the operator's trusted host-key process before first connection. Stage the backup in a root-only directory; do not put it in `/srv/crewspan` or under a public web root.

Example from PowerShell (replace placeholders locally):

```powershell
scp -i <operator-private-key> 'C:\Crewspan\.paperclip-home\instances\m0\data\backups\<backup-file>.sql.gz' <authorized-user>@<verified-vps-address>:/root/crewspan-migration/
```

On the VPS, confirm the transferred file's size/hash against the laptop's local hash, then move it to a root-only staging path readable by the `crewspan` service account or restore operator. Delete the staging copy after successful restore and backup verification. Never commit the backup, include it in a support bundle, or post its contents in a task comment.

### 5.3 Restore with the app stopped

This source currently does not provide `paperclipai db:restore`. Its checked-in supported restore entry point is `runDatabaseRestore` from `@paperclipai/db`. Use a temporary restore helper based on that API, and stop the application before touching the embedded database:

```sh
sudo systemctl stop crewspan
sudo systemctl is-active crewspan   # must report inactive
```

Restore only into the new, empty `/var/lib/crewspan/paperclip/instances/m0/db` cluster. The application must not be running while the helper owns the embedded PostgreSQL lifecycle. Keep the service stopped if the helper fails; preserve diagnostics and the original SQL backup, then resolve the issue before retrying. Do not restore on top of a database that has already been migrated by starting the app.

For this checkout, a temporary helper can live at `server/scripts/restore-m0.ts` and run as the `crewspan` account. It uses this instance's embedded PostgreSQL data directory and configured port (the new-instance default is `54329`), initializes a fresh cluster, starts it, ensures the `paperclip` database exists, calls the checked-in `runDatabaseRestore` API, and stops the embedded server in a `finally` block. It refuses to restore into a non-empty database directory. The default directory is `<PAPERCLIP_HOME>/instances/<PAPERCLIP_INSTANCE_ID>/db`; adjust the helper if `database.embeddedPostgresDataDir` is customized. A minimal implementation using this checkout's exports is:

```ts
import { existsSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { ensurePostgresDatabase, runDatabaseRestore } from "@paperclipai/db";

const home = process.env.PAPERCLIP_HOME ?? "/var/lib/crewspan/paperclip";
const instanceId = process.env.PAPERCLIP_INSTANCE_ID ?? "m0";
const instanceRoot = path.join(home, "instances", instanceId);
const configPath = path.join(instanceRoot, "config.json");
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : {};
const port = config.database?.embeddedPostgresPort ?? 54329;
const databaseDir = path.join(instanceRoot, "db");
const backupFile = process.env.CREWSPAN_RESTORE_FILE;
if (!backupFile) throw new Error("Set CREWSPAN_RESTORE_FILE to the staged .sql.gz path.");
if (!existsSync(backupFile)) throw new Error(`Backup file not found: ${backupFile}`);
mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
if (readdirSync(databaseDir).length !== 0) {
  throw new Error(`Refusing to restore into a non-empty database directory: ${databaseDir}`);
}

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "paperclip",
  password: "paperclip",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
  onLog: (message: string) => process.stderr.write(`${message}\n`),
  onError: (message: string) => process.stderr.write(`${message}\n`),
});
let started = false;
try {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  started = true;
  const adminUrl = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
  await ensurePostgresDatabase(adminUrl, "paperclip");
  await runDatabaseRestore({
    connectionString: `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`,
    backupFile,
  });
  process.stdout.write("Database restore completed.\n");
} finally {
  if (started) await pg.stop();
}
```

Run it from `/srv/crewspan` with the app still stopped, the backup staged read-only for `crewspan`, and the normal service environment loaded:

```sh
sudo -u crewspan env PAPERCLIP_HOME=/var/lib/crewspan/paperclip PAPERCLIP_INSTANCE_ID=m0 \
  CREWSPAN_RESTORE_FILE=/var/lib/crewspan/restore/<backup-file>.sql.gz \
  pnpm --filter @paperclipai/server exec tsx scripts/restore-m0.ts
```

Before that command, verify the default port is unused and the target directory is empty:

```sh
sudo ss -lntp | grep ':54329' || true
sudo find /var/lib/crewspan/paperclip/instances/m0/db -mindepth 1 -maxdepth 1 -print
```

Both commands should print no matching listener or database files. If either prints a result, stop and identify the owner/state; do not remove files or restore over them.

This helper is temporary operator code, not a supported CLI surface. Confirm imports and runtime behavior against the exact locked package versions before using it. It is intentionally limited to a new/empty target database. Remove the helper after the operation; do not add it to Git.

After the helper exits successfully, verify the embedded process is stopped, remove any temporary helper, confirm the restored database directory is owned by `crewspan:crewspan`, then start Crewspan:

```sh
systemctl start crewspan
systemctl status crewspan --no-pager
journalctl -u crewspan -n 100 --no-pager
curl -fsS http://127.0.0.1:3100/api/health
```

If the app reports migration errors, keep it private and stopped before attempting another restore. Do not delete the source backup or laptop state until health, login, company data, uploads (if migrated), and agent API behavior are confirmed.

### 5.4 Preserve or rotate the agent JWT signer deliberately

For an existing M0 migration, preserve the exact value from `agent-jwt-secret.txt` in the VPS secret store as `PAPERCLIP_AGENT_JWT_SECRET`. This keeps currently issued short-lived agent JWTs valid during the migration. Treat the signer as a credential: only root and the service account's process environment should have access. Do not add it to the repository, unit file, comments, shell transcripts, or this document.

If the signer is unavailable or the Board chooses rotation, generate a new random secret and record that all existing agent run tokens will stop validating; restart the service after updating it and verify new agent runs receive working credentials. Do not rotate the signer casually or while runs are in flight. The login/session data in the database is separate from this agent JWT signing secret.

## 6. Remote access

### Preferred: private Tailscale route

Use this option when every intended operator can join the authorized tailnet. Configure the Paperclip process to remain on `127.0.0.1:3100` and use an approved private reverse-proxy route such as Tailscale Serve, or a dedicated private Nginx site. Set `authenticated/private`. Confirm that the selected proxy can reach loopback, presents the canonical hostname, and is restricted by tailnet ACLs. Use HTTPS from the operator device to the private endpoint. Do not assume Tailscale is installed or configured on the VPS; verify it with the Board before relying on this route.

### Public HTTPS: only after the public-access gate is met

Use `authenticated/public` only after the Board supplies and verifies the hostname, DNS points to the VPS, TLS issuance/renewal is working, the reverse proxy is configured, and the first administrator/bootstrap flow is understood. The Paperclip listener stays loopback-only. Nginx should have a separate `server` block for the Crewspan hostname and proxy to `http://127.0.0.1:3100`, forwarding the normal `Host`, `X-Forwarded-Proto`, and client address headers and supporting WebSocket upgrades. Do not change the existing Dashboard virtual host.

For a same-host Nginx proxy, configure the app's `TRUST_PROXY=loopback`; the default trusts no proxy. This lets Express use proxy metadata only from loopback. Do not use `TRUST_PROXY=true` on an internet-facing server. If the proxy is elsewhere, configure only its verified address/CIDR and test request-IP handling; never trust a broad client-controlled forwarded-header chain. Set `PAPERCLIP_PUBLIC_URL=https://<exact-hostname>` and allow additional hostnames only when genuinely required. Configure and renew TLS at the reverse proxy. Enable the normal public-mode auth rate limiting.

Example Nginx site for a public HTTPS host (replace the hostname and certificate paths). `map` belongs inside the Nginx `http {}` block; define it once, reusing an existing WebSocket map if present:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name <crewspan-hostname>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name <crewspan-hostname>;

    ssl_certificate     /etc/letsencrypt/live/<crewspan-hostname>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<crewspan-hostname>/privkey.pem;

    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Do not enable the site until TLS certificate files exist. After installing the site, run `nginx -t` and reload Nginx only after it passes. Obtain and renew the certificate using the Board-approved ACME/TLS method for the VPS. Keep the existing Dashboard virtual host untouched. If Nginx and the certificate are not already configured, first confirm DNS and ports 80/443 with the Board/operator; the example alone does not install or issue TLS certificates.

Open only the public ports needed for HTTPS (normally TCP 443, and TCP 80 only if needed for HTTP-to-HTTPS redirect or ACME validation) and the already-authorized SSH path. Confirm host and provider firewalls agree. Verify with `ss -lntup` that Paperclip listens on `127.0.0.1:3100`, never `0.0.0.0:3100` or the public address. Port 3100 must not be reachable from the internet.

For `authenticated/public`, use `pnpm paperclipai auth bootstrap-ceo` from the `/srv/crewspan` checkout as the service identity with the same instance environment. This generates a one-time invite URL; deliver it privately and immediately complete the first-admin claim. Do not expose a public bootstrap-pending instance to untrusted users. Browser-first first-admin claiming is for `authenticated/private`; it is disabled for public exposure. For a migrated instance whose only administrator is `local-board`, use the one-time `/board-claim/<token>?code=<code>` flow emitted on startup, and complete it through the verified login path before considering the instance live.

Never use `local_trusted` with a LAN, tailnet, or public listener. Do not expose port 3100 directly, even if authentication is enabled.

## 7. Codex ACP setup and smoke check

Codex ACP needs Node.js `>=24.11.0`, and its server command must be available to the Paperclip process. The dependency is part of this checkout's Codex adapter and is installed with the frozen workspace lockfile. Do not copy the laptop's private Codex OAuth state to the VPS.

As the `crewspan` service identity, install/provision the supported Codex CLI/ACP runtime if the current source installation does not already make its ACP server command executable. Perform a fresh Codex login for that Linux service identity using the approved OpenAI account/auth process. Keep the resulting state under `/var/lib/crewspan/service-home/.codex` (or the explicitly configured service `CODEX_HOME`) with owner `crewspan:crewspan` and mode `0700` on the directory, `0600` on credential files. Do not copy or print `auth.json`. Verify the service identity can run the installed Codex CLI and check its version; then use the adapter's environment test and a small assigned-workspace smoke issue to confirm the Codex ACP server starts and authenticates.

ACP permission mode `approve-all` approves ACP permission requests. Crewspan's current Codex ACP still retains the assigned workspace sandbox. It does not promise unrestricted VPS host filesystem access. Respect the configured workspace and execution-target network restrictions.

## 8. Operations and verification

### Health, login, and runtime

Run on the VPS:

```sh
systemctl is-active crewspan
curl -fsS http://127.0.0.1:3100/api/health
ss -lntp | grep ':3100'
journalctl -u crewspan -n 100 --no-pager
```

Success means systemd reports `active`, `/api/health` returns HTTP 200 with a healthy status, the listening address is loopback only, and logs have no database, migration, auth, or UI startup errors. From an allowed remote device, load the configured HTTPS/Tailscale URL, sign in, verify the Board/admin account and expected companies/issues, then sign out and confirm a fresh browser session requires login.

For a first admin, complete the private browser claim or public bootstrap-invite path described above. Retain the one-time URL only long enough to claim the account; do not place it in shell history or logs shared outside the operator group.

### Agent JWT and ACP smoke

Run a small, non-destructive assigned issue through the Codex ACP lane in an approved workspace. Confirm it starts, can call the Paperclip API, and completes the task. A `401` from an agent API write commonly means `PAPERCLIP_AGENT_JWT_SECRET` is missing or does not match the running server. Confirm the secret is loaded without printing its value, restart after a rotation, then retry with a newly issued run token. Confirm ACP tests report Node support, an executable Codex ACP server, and authenticated credentials.

### Backups and restore readiness

The application's automatic logical DB backup defaults are enabled, every 60 minutes, and retained for 30 days. Check the actual configured path and disk headroom. Run a manual backup as the service identity:

```sh
cd /srv/crewspan
sudo -u crewspan env PAPERCLIP_HOME=/var/lib/crewspan/paperclip PAPERCLIP_INSTANCE_ID=m0 \
  pnpm paperclipai db:backup --dir /var/lib/crewspan/paperclip/instances/m0/data/backups --json
```

Confirm a recent `.sql.gz` exists and has nonzero size. Keep a second encrypted copy at the Board-approved off-host destination; local retention alone is not disaster recovery. Database backups do not contain local uploads or the encrypted-secrets master key, so back those paths up separately when used. Protect and test restoration of the JWT signer through the secret store as well.

This checkout's built-in `db:backup` command creates backups; it does not provide a `db:restore` CLI. The supported `runDatabaseRestore` library API is used in the migration procedure above. Maintain a tested operator helper matching this exact source release. Perform a restore rehearsal to an isolated data root before relying on the backups.

### Logs and service recovery

```sh
systemctl status crewspan --no-pager
journalctl -u crewspan -f
journalctl -u crewspan --since '1 hour ago' --no-pager
systemctl restart crewspan
```

For a restart loop, inspect recent logs, environment-file permissions (without displaying secrets), ownership under `/var/lib/crewspan`, free disk, Node/pnpm paths, database startup, port conflicts, and proxy TLS logs. Do not repeatedly restart an instance that reports restore or migration failure.

### Upgrade and rollback

Before every upgrade, confirm an off-host backup is recent and verified. From an operator account with write access:

```sh
cd /srv/crewspan
git status --short --branch
git fetch origin main
git switch main
git pull --ff-only origin main
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart crewspan
sudo systemctl status crewspan --no-pager
curl -fsS http://127.0.0.1:3100/api/health
```

Observe logs and complete the remote login and agent smoke checks after upgrade. Paperclip applies database migrations during startup when configured to do so. `paperclipai update rollback` can roll back the application release but does not reverse database migrations. If a database migration must be undone, stop the service and restore the verified pre-upgrade database backup using the supported restore API into the appropriate data root; also restore matching non-database files/keys from their backups. Do not roll back code against an incompatible migrated database without the restore plan.

## 9. Troubleshooting

| Symptom | Checks and response |
|---|---|
| Service cannot start or loops | `journalctl -u crewspan -n 200 --no-pager`; verify absolute Node/pnpm paths, Node `>=24.11.0`, pnpm `9.15.4`, read access to `/srv/crewspan`, write access to `/var/lib/crewspan`, and that TCP 3100 is unused. |
| Health reports database failure | Confirm `DATABASE_URL` is unset for embedded PostgreSQL, `PAPERCLIP_HOME`/instance ID are correct, disk is not full, and the database directory is owned by `crewspan`. Do not delete database files to “reset” a migrated instance. |
| Remote page is unavailable | Check DNS from an external network, TLS/Nginx or Tailscale Serve state, tailnet ACLs, firewall rules, and proxy logs. Verify proxy target `127.0.0.1:3100` and local health separately. Do not open port 3100 as a workaround. |
| Login redirects or callback URLs are wrong | Check the exact `PAPERCLIP_PUBLIC_URL`, exposure mode, TLS forwarding headers, hostname allowlist if customized, and `TRUST_PROXY` scope. Do not broaden trust to `true`. |
| Agent writes return 401 | Verify the service process has a nonempty JWT signer loaded, that it matches the intended migration value, and that the app restarted after any key change. Retry with a newly minted run token after rotation. |
| Codex ACP fails | Check service-account Codex login, permissions on `.codex`, executable ACP server command, Node version, adapter environment test results, and whether execution-target policy denied network. Do not copy the laptop's auth file. |
| Encrypted secrets fail after migration | Restore the matching `secrets/master.key` together with the database and verify owner/mode. Without the original matching key, local encrypted values cannot be decrypted. |
| Uploads are missing | Confirm the database backup succeeded and separately restore the local-disk storage path if it was used. The SQL backup does not contain uploaded files. |
| Backup is stale or missing | Check the configured backup directory, service write access, free disk, backup-related health details, and journal errors. Create a manual backup, then verify off-host transfer. |

## 10. Go-live checklist

- [ ] Board supplied the hostname, access choice, auth/admin plan, authorized SSH access, and backup destination.
- [ ] DNS, SSH access, firewall, host resources, OS packages, and existing Dashboard state were inspected by an authorized operator.
- [ ] Crewspan runs from its own `/srv/crewspan` checkout as unprivileged `crewspan`; no Dashboard service or data was reused or changed.
- [ ] Node.js is `>=24.11.0`; pnpm is `9.15.4`; frozen install and production build succeeded.
- [ ] `PAPERCLIP_HOME` and `PAPERCLIP_INSTANCE_ID=m0` resolve to the intended persistent path; embedded PostgreSQL owns its data and `DATABASE_URL` is unset.
- [ ] The migration used a supported `.sql.gz` backup over authenticated SSH/SCP, restored with the app stopped, and did not copy a live Postgres directory.
- [ ] JWT signer was preserved securely or deliberately rotated with old run-token impact understood; Codex was freshly authenticated as the service identity.
- [ ] Tailscale/private or public HTTPS route is verified; public mode uses `authenticated/public`, TLS, login, first-admin claim, trusted proxy scope, and rate limits.
- [ ] Paperclip listens only on `127.0.0.1:3100`; external scans/connection checks confirm TCP 3100 is not exposed.
- [ ] Health, browser login, data review, Codex ACP workspace smoke, database backup, off-host copy, and restore rehearsal all succeeded.
- [ ] Logs, restart procedure, upgrade steps, rollback path, and backup/key retention owner are recorded for operators.
