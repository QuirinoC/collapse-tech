#!/usr/bin/env bash
# One-shot install on Raspberry Pi OS (Bookworm/Trixie) with USB OTG.
# Target: Pi 4 / Pi 5 / Zero 2 W (gadget-capable). Wired Android Auto only.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo $0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX=/opt/airplay-aa

echo "==> Enabling USB peripheral / gadget (dwc2)"
BOOT_CFG=""
for candidate in /boot/firmware/config.txt /boot/config.txt; do
  if [[ -f "$candidate" ]]; then
    BOOT_CFG="$candidate"
    break
  fi
done
if [[ -z "$BOOT_CFG" ]]; then
  echo "Could not find boot config.txt" >&2
  exit 1
fi

if ! grep -q 'dtoverlay=dwc2' "$BOOT_CFG"; then
  echo "" >>"$BOOT_CFG"
  echo "# AirPlay-AA bridge: USB gadget for wired Android Auto" >>"$BOOT_CFG"
  echo "dtoverlay=dwc2,dr_mode=peripheral" >>"$BOOT_CFG"
  echo "Added dwc2 overlay to $BOOT_CFG (reboot required)."
else
  echo "dwc2 overlay already present in $BOOT_CFG"
fi

CMDLINE=""
for candidate in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  if [[ -f "$candidate" ]]; then
    CMDLINE="$candidate"
    break
  fi
done
if [[ -n "$CMDLINE" ]] && ! grep -q 'modules-load=dwc2' "$CMDLINE"; then
  # Append modules-load without breaking the single-line cmdline.
  sed -i 's/$/ modules-load=dwc2/' "$CMDLINE"
  echo "Updated $CMDLINE"
fi

echo "==> Installing project files to $PREFIX"
install -d "$PREFIX"/{scripts,bridge,config,patches,docs,systemd}
install -d /etc/airplay-aa /var/run/airplay-aa /var/log/airplay-aa
# Copy tree without third_party build cache
shopt -s dotglob nullglob
for item in "$ROOT"/*; do
  base="$(basename "$item")"
  [[ "$base" == "third_party" ]] && continue
  cp -a "$item" "$PREFIX/"
done
install -m 644 "$ROOT/config/bridge.env" /etc/airplay-aa/bridge.env
chmod +x "$PREFIX"/scripts/*.sh "$PREFIX"/bridge/*.py

echo "==> Building UxPlay + AAServer"
export AIRPLAY_AA_PREFIX="$PREFIX"
bash "$PREFIX/scripts/build-deps.sh"

echo "==> Generating idle black H.264"
python3 "$PREFIX/bridge/gen_idle_h264.py" \
  --width 800 --height 480 --fps 30 \
  -o /var/run/airplay-aa/idle.h264 || true

echo "==> Installing systemd unit"
install -m 644 "$ROOT/systemd/airplay-aa-bridge.service" \
  /etc/systemd/system/airplay-aa-bridge.service
systemctl daemon-reload
systemctl enable airplay-aa-bridge.service

cat <<EOF

Installed.

Next steps:
  1. Reboot so dwc2 peripheral mode loads:
       sudo reboot
  2. After reboot, start (or it will autostart):
       sudo systemctl start airplay-aa-bridge
       sudo journalctl -u airplay-aa-bridge -f
  3. On your Mac/iPhone: AirPlay screen mirror to "${AIRPLAY_AA_NAME:-Pi AirPlay AA}"
  4. Plug the Pi USB-C/OTG *data* port into the car USB (or Mac running OpenAuto).
     Use a cable that carries data, not charge-only.

Mac head-unit simulator tips: see docs/mac-testing.md
EOF
