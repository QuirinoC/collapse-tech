#!/usr/bin/env bash
# Install the independent sidecar without changing bonds or private car config.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ${EUID} -ne 0 ]]; then
  echo 'Run as root on the Pi.' >&2
  exit 1
fi
/usr/bin/python3 -c 'import dbus, dbus.service; from gi.repository import GLib'
install -d -m 0755 /opt/airplay-aa/bridge /etc/airplay-aa
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/bridge/bluetooth_protocol.py" /opt/airplay-aa/bridge/bluetooth_protocol.py --mode 644 --owner 0 --group 0
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/bridge/phone_bluetooth.py" /opt/airplay-aa/bridge/phone_bluetooth.py --mode 755 --owner 0 --group 0
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/config/bluetooth.conf.example" /etc/airplay-aa/bluetooth.conf.example --mode 644 --owner 0 --group 0
python3 "$ROOT/scripts/atomic_install.py" "$ROOT/systemd/airplay-aa-bluetooth.service" /etc/systemd/system/airplay-aa-bluetooth.service --mode 644 --owner 0 --group 0
systemctl daemon-reload
if [[ -f /etc/airplay-aa/bluetooth.conf ]]; then
  /usr/bin/python3 /opt/airplay-aa/bridge/phone_bluetooth.py --check-config
  systemctl enable --now airplay-aa-bluetooth.service
else
  echo 'Installed. Configure /etc/airplay-aa/bluetooth.conf for your known car before enabling airplay-aa-bluetooth.service.'
fi
