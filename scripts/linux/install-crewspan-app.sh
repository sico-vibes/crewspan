#!/usr/bin/env bash
# install-crewspan-app.sh — install the Crewspan launcher for the current Linux user.
#
# Installs, for this checkout:
#   ~/.local/bin/crewspan                        -> scripts/linux/crewspan (symlink)
#   ~/.config/systemd/user/crewspan.service      built server on 127.0.0.1:3100
#   ~/.local/share/icons/hicolor/512x512/apps/crewspan.png   Paperclip icon
#   ~/.local/share/applications/crewspan.desktop app launcher entry (SUPER + SPACE on Omarchy)
#
# The service is not started at login; the launcher starts it on demand.
#
# Usage: scripts/linux/install-crewspan-app.sh [--uninstall]

set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
BIN="$HOME/.local/bin/crewspan"
UNIT_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/crewspan.service"
ICON_ROOT="$HOME/.local/share/icons/hicolor"
ICON_FILE="$ICON_ROOT/512x512/apps/crewspan.png"
DESKTOP_FILE="$HOME/.local/share/applications/crewspan.desktop"

if [[ ${1:-} == --uninstall ]]; then
  systemctl --user stop crewspan.service 2>/dev/null || true
  rm -f "$BIN" "$UNIT_FILE" "$ICON_FILE" "$DESKTOP_FILE"
  systemctl --user daemon-reload
  gtk-update-icon-cache "$ICON_ROOT" &>/dev/null || true
  echo "Crewspan launcher removed. Instance data in ~/.paperclip was left untouched."
  exit 0
fi

# Prefer the mise shim so the unit keeps working across node upgrades.
NODE_BIN="$HOME/.local/share/mise/shims/node"
[[ -x $NODE_BIN ]] || NODE_BIN="$(command -v node || true)"
[[ -n $NODE_BIN ]] || { echo "node not found; install Node >= 24.11 first." >&2; exit 1; }

mkdir -p "$(dirname "$BIN")" "$(dirname "$UNIT_FILE")" "$(dirname "$ICON_FILE")" "$(dirname "$DESKTOP_FILE")"

chmod +x "$ROOT/scripts/linux/crewspan"
ln -sfn "$ROOT/scripts/linux/crewspan" "$BIN"

# Matches the shipped container command and Start-Default.ps1 -Mode production.
# HOST/PORT pin the server to loopback regardless of the instance config.
cat >"$UNIT_FILE" <<EOF
[Unit]
Description=Crewspan local server (127.0.0.1:3100)
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=notify
NotifyAccess=all
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
Environment=PATH=%h/.local/share/mise/shims:%h/.local/bin:%h/.cargo/bin:/usr/local/bin:/usr/bin
Environment=PAPERCLIP_INSTANCE_ID=default
Environment=HOST=127.0.0.1
Environment=PORT=3100
Environment=SERVE_UI=true
Environment=PAPERCLIP_UI_DEV_MIDDLEWARE=false
Environment=PAPERCLIP_MIGRATION_AUTO_APPLY=true
UnsetEnvironment=DATABASE_URL DATABASE_MIGRATION_URL
# Signal only the server: it drains runs and stops embedded PostgreSQL itself.
# Signalling the whole group races Postgres shutdown against that drain.
KillMode=mixed
Restart=on-failure
RestartSec=5
TimeoutStartSec=300
TimeoutStopSec=300

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload

cp "$ROOT/ui/public/android-chrome-512x512.png" "$ICON_FILE"
gtk-update-icon-cache "$ICON_ROOT" &>/dev/null || true

# Omarchy opens TUIs through xdg-terminal-exec; TUI.float gives a floating panel.
if command -v xdg-terminal-exec >/dev/null; then
  EXEC="xdg-terminal-exec --app-id=TUI.float -e $BIN"
  TERMINAL=false
else
  EXEC="$BIN"
  TERMINAL=true
fi

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Crewspan
Comment=Start and open the local Crewspan server
Exec=$EXEC
Terminal=$TERMINAL
Icon=crewspan
Categories=Development;
StartupNotify=true
Actions=open;stop;

[Desktop Action open]
Name=Open in browser
Exec=$BIN open

[Desktop Action stop]
Name=Stop server
Exec=$BIN stop
EOF
chmod +x "$DESKTOP_FILE"

echo "Crewspan launcher installed for $ROOT"
echo "  command:  crewspan (help: crewspan help)"
echo "  app:      Crewspan in the app launcher"
echo "  service:  systemctl --user status crewspan"
