# Crewspan launcher for Windows

Runs the built Crewspan server and SPA on `127.0.0.1:3100` and adds a
**Crewspan** shortcut (Paperclip icon) to the Desktop and the Start menu.
This is the Windows counterpart of [`scripts/linux`](../linux/README.md).

## One-time setup

From the repo root in PowerShell. Node **>= 24.11**, pnpm **9.15.4** (via
`npm exec` if `pnpm` is not on PATH), and Rust (`cargo`) are required. The
runner binary also needs the Visual Studio C++ build tools.

```powershell
npm exec --yes --package=pnpm@9.15.4 -- pnpm install --frozen-lockfile
npm exec --yes --package=pnpm@9.15.4 -- pnpm build
npm exec --yes --package=pnpm@9.15.4 -- pnpm paperclipai onboard --yes --bind loopback
.\scripts\windows\install-crewspan-app.ps1
```

`onboard --yes` creates `%USERPROFILE%\.paperclip\instances\default` and
starts the server in that window. Press Ctrl+C once it is up, then use the
shortcut or `crewspan.ps1 start` afterwards.

## Use

- **Desktop or Start menu -> Crewspan** starts the server if needed, opens
  Crewspan in an app window, and shows a small panel. Quitting the panel
  leaves the server running.
- **CLI** from the repo root:

```powershell
.\scripts\windows\crewspan.ps1 start
.\scripts\windows\crewspan.ps1 stop
.\scripts\windows\crewspan.ps1 restart
.\scripts\windows\crewspan.ps1 status
.\scripts\windows\crewspan.ps1 open
.\scripts\windows\crewspan.ps1 logs
.\scripts\windows\crewspan.ps1 build
```

`start` rebuilds first when the checkout moved past the last build. Commits
that touch only docs or the launchers are ignored.

The server is not started at login. Logs and the PID file live in
`%LOCALAPPDATA%\Crewspan`.

Remove the shortcuts with `.\scripts\windows\install-crewspan-app.ps1 -Uninstall`.
Instance data in `%USERPROFILE%\.paperclip` is kept.
