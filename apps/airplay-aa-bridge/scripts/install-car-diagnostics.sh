#!/usr/bin/env bash
# Passive recorder only: no bridge restart, USB writes or network changes.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -d -m 755 /var/log/airplay-aa
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/scripts/car_diagnostics.py" \
  /opt/airplay-aa/scripts/car_diagnostics.py --mode 755 --owner 0 --group 0
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/systemd/airplay-aa-diagnostics.service" \
  /etc/systemd/system/airplay-aa-diagnostics.service --mode 644 --owner 0 --group 0
systemctl daemon-reload
systemctl enable airplay-aa-diagnostics.service
systemctl restart airplay-aa-diagnostics.service
systemctl is-active airplay-aa-diagnostics.service
