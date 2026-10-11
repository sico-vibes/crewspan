# Crewspan launcher for Linux

Runs the built Crewspan server + SPA as a systemd user service on
`127.0.0.1:3100` and adds a **Crewspan** entry (Paperclip icon) to the app
launcher. Written for Omarchy; works on any systemd desktop.

## One-time setup

```bash
pnpm install --frozen-lockfile && pnpm build      # needs Node >= 24.11, pnpm 9.15.4, Rust (runner binary)
pnpm paperclipai onboard --yes --bind loopback    # creates ~/.paperclip/instances/default, starts the server; Ctrl+C once it is up
scripts/linux/install-crewspan-app.sh             # command, service, icon, launcher entry
```

## Use

- **App launcher → Crewspan** (SUPER + SPACE on Omarchy) opens a floating
  panel: it starts the server if needed, opens Crewspan as a web app, and
  offers open / logs / restart / rebuild / stop. Quitting the panel leaves the
  server running.
- **CLI**: `crewspan start | stop | restart | status | open | logs | build`.

`crewspan start` rebuilds first when the checkout moved past the last build
(commits touching only docs or this launcher are ignored).

The service is not enabled at login. To start it at login:
`systemctl --user enable crewspan`.

Remove with `scripts/linux/install-crewspan-app.sh --uninstall` (instance
data in `~/.paperclip` is kept).
