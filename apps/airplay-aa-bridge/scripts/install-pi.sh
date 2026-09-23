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

echo "==> Enabling USB peripheral / gadget (dwc2 + libcomposite)"
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

# Pi 5: otg_mode=1 under [all]/[pi5] forces host and kills the USB-C gadget.
# otg_mode under [cm4] only is fine (this board ignores that section).
python3 - "$BOOT_CFG" <<'PY' || true
import re, sys
path = sys.argv[1]
text = open(path).read().splitlines()
section = "all"
bad = []
for i, line in enumerate(text, 1):
    m = re.match(r"\[(.+)\]", line.strip())
    if m:
        section = m.group(1).strip().lower()
        continue
    if re.match(r"\s*otg_mode\s*=", line) and section not in ("cm4",):
        bad.append(f"{i}:{section}:{line.strip()}")
if bad:
    print("WARNING: otg_mode outside [cm4] in", path, "→", "; ".join(bad), file=sys.stderr)
PY

if ! grep -q 'dtoverlay=dwc2' "$BOOT_CFG"; then
  # Ensure peripheral overlay lands under [all] (not only a board section).
  if grep -q '^\[all\]' "$BOOT_CFG"; then
    awk '
      BEGIN { done=0 }
      /^\[all\]/ { print; if (!done) {
        print "# AirPlay-AA bridge: USB-C gadget (phone-side Android Auto over AOAP)"
        print "dtoverlay=dwc2,dr_mode=peripheral"
        done=1; next
      }}
      { print }
      END { if (!done) {
        print ""
        print "[all]"
        print "# AirPlay-AA bridge: USB-C gadget (phone-side Android Auto over AOAP)"
        print "dtoverlay=dwc2,dr_mode=peripheral"
      }}
    ' "$BOOT_CFG" >"${BOOT_CFG}.tmp" && mv "${BOOT_CFG}.tmp" "$BOOT_CFG"
  else
    {
      echo ""
      echo "[all]"
      echo "# AirPlay-AA bridge: USB-C gadget (phone-side Android Auto over AOAP)"
      echo "dtoverlay=dwc2,dr_mode=peripheral"
    } >>"$BOOT_CFG"
  fi
  echo "Added dwc2 overlay under [all] in $BOOT_CFG (reboot required)."
else
  echo "dwc2 overlay already present in $BOOT_CFG"
fi

install -d /etc/modules-load.d
cat >/etc/modules-load.d/usb-gadget.conf <<'EOF'
# AirPlay-AA bridge: USB gadget stack (must not be empty)
dwc2
libcomposite
usb_f_fs
usb_f_mass_storage
EOF
echo "Wrote /etc/modules-load.d/usb-gadget.conf"

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

# ICS ethernet gadget claims the UDC — conflicts with AAServer AOAP.
systemctl disable --now rpi-usb-gadget-ics.service 2>/dev/null || true
systemctl mask rpi-usb-gadget-ics.service 2>/dev/null || true
# Common name collisions with this bridge's UxPlay receiver.
systemctl disable --now shairport-sync.service pi-airplay-receiver.service 2>/dev/null || true
modprobe -r g_ether 2>/dev/null || true


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

# Prefer non-expired GAL engineering certs. Stock AACS CarService cert expired
# 2022-08-24; cars/DHU then fail TLS → "device is not responding" / cert expired.
# Install into every AAServer ssl location (runtime + source + build trees).
if [[ -f "$PREFIX/certs/android_auto.crt" && -f "$PREFIX/certs/android_auto.key" ]]; then
  echo "==> Installing non-expired AA TLS identity (all AAServer locations)"
  AIRPLAY_AA_PREFIX="$PREFIX" bash "$PREFIX/scripts/install-certs.sh"
fi

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
  4. Plug the Pi USB-C/OTG *data* port into the car USB, or into a Mac and run
     apps/airplay-aa-bridge/scripts/run-mac-dhu.sh (see docs/mac-testing.md).
     Use a cable that carries data, not charge-only.

Mac head-unit simulator tips: see docs/mac-testing.md
EOF
