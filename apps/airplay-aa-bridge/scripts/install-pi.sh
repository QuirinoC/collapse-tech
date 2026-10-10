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
ATOMIC_INSTALL="$ROOT/scripts/atomic_install.py"
[[ -s "$ATOMIC_INSTALL" ]] || { echo "Missing durable installer: $ATOMIC_INSTALL" >&2; exit 1; }

# Reject wrong-role, expired, or mismatched credentials before boot/service edits.
# The legacy bundled DHU identity belongs to a head unit, not this phone endpoint.
CERT_SRC="${AIRPLAY_AA_CERT_DIR:-$ROOT/certs}"
CERT_SRC="$(cd "$CERT_SRC" && pwd)"
bash "$ROOT/scripts/check-phone-certs.sh" "$CERT_SRC"

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

# Current Pi OS images already contain dtoverlay=dwc2,dr_mode=host under
# [cm5]. That makes the USB-C port a host, so a data cable never enumerates.
# Rewrite every dwc2 overlay to peripheral, and ensure [all] has one too.
python3 - "$BOOT_CFG" "$ROOT/scripts" <<'PY'
import re, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from atomic_install import atomic_write
path = sys.argv[1]
lines = open(path).read().splitlines()
section = "all"
out = []
changed = False
seen_all_peripheral = False
overlay_re = re.compile(r"^(\s*)dtoverlay=dwc2\b")
for line in lines:
    header = re.match(r"\[(.+)\]", line.strip())
    if header:
        section = header.group(1).strip().lower()
        out.append(line)
        continue
    if overlay_re.match(line) and not line.strip().startswith("#"):
        if "dr_mode=peripheral" not in line:
            indent = overlay_re.match(line).group(1)
            line = f"{indent}dtoverlay=dwc2,dr_mode=peripheral"
            changed = True
            print(f"rewrote dwc2 overlay under [{section}] -> peripheral", file=sys.stderr)
        if section == "all":
            seen_all_peripheral = True
    out.append(line)

if not seen_all_peripheral:
    inserted = False
    new = []
    for line in out:
        new.append(line)
        if not inserted and line.strip().lower() == "[all]":
            new.append("# AirPlay-AA bridge: USB-C gadget (phone-side Android Auto over AOAP)")
            new.append("dtoverlay=dwc2,dr_mode=peripheral")
            inserted = True
            changed = True
    if not inserted:
        new.extend([
            "",
            "[all]",
            "# AirPlay-AA bridge: USB-C gadget (phone-side Android Auto over AOAP)",
            "dtoverlay=dwc2,dr_mode=peripheral",
        ])
        changed = True
    out = new
    print("added dtoverlay=dwc2,dr_mode=peripheral under [all]", file=sys.stderr)

if changed:
    atomic_write(Path(path), ("\n".join(out) + "\n").encode())
    print("CHANGED")
else:
    print("UNCHANGED")
PY
echo "USB gadget overlay in $BOOT_CFG (reboot required if it changed)."

python3 "$ATOMIC_INSTALL" - /etc/modules-load.d/usb-gadget.conf --mode 644 <<'EOF'
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
  python3 - "$CMDLINE" "$ROOT/scripts" <<'PY'
from pathlib import Path
import sys
sys.path.insert(0, sys.argv[2])
from atomic_install import atomic_write
path = Path(sys.argv[1])
atomic_write(path, path.read_bytes().rstrip(b"\r\n") + b" modules-load=dwc2\n")
PY
  echo "Updated $CMDLINE"
fi

# ICS ethernet gadget claims the UDC — conflicts with AAServer AOAP.
systemctl disable --now rpi-usb-gadget-ics.service 2>/dev/null || true
systemctl mask rpi-usb-gadget-ics.service 2>/dev/null || true
# Common name collisions with this bridge's UxPlay receiver.
systemctl disable --now shairport-sync.service pi-airplay-receiver.service 2>/dev/null || true
modprobe -r g_ether 2>/dev/null || true


echo "==> Installing project files to $PREFIX"
install -d /var/run/airplay-aa /var/log/airplay-aa
# Copy project files without dependency cache or ignored bench/research artifacts.
if [[ "$ROOT" != "$PREFIX" ]]; then
  python3 "$ATOMIC_INSTALL" "$ROOT" "$PREFIX" --tree \
    --exclude third_party --exclude .local --exclude .git --exclude certs \
    --exclude __pycache__ --exclude .pytest_cache --exclude '*.pyc' \
    --exclude '*.log' --exclude '*.pcap'
fi
if [[ "$CERT_SRC" != "$PREFIX/certs" ]]; then
  python3 "$ATOMIC_INSTALL" "$CERT_SRC/android_auto.crt" "$PREFIX/certs/android_auto.crt" --mode 644
  python3 "$ATOMIC_INSTALL" "$CERT_SRC/android_auto.key" "$PREFIX/certs/android_auto.key" --mode 600
fi
python3 "$ATOMIC_INSTALL" "$ROOT/config/bridge.env" /etc/airplay-aa/bridge.env --mode 644
# Tree installation preserves the executable source modes before each fsync.

echo "==> Building UxPlay + AAServer"
export AIRPLAY_AA_PREFIX="$PREFIX"
export AIRPLAY_AA_CERT_DIR="$PREFIX/certs"
bash "$PREFIX/scripts/build-deps.sh"

# Install the validated PHONE identity into runtime, source, and build locations.
echo "==> Installing current CarService PHONE identity (all AAServer locations)"
AIRPLAY_AA_PREFIX="$PREFIX" AIRPLAY_AA_CERT_DIR="$PREFIX/certs" bash "$PREFIX/scripts/install-certs.sh"

echo "==> Generating idle black H.264"
IDLE_STAGE="$(mktemp /var/run/airplay-aa/idle.h264.install.XXXXXX)"
if python3 "$PREFIX/bridge/gen_idle_h264.py" \
  --width 800 --height 480 --fps 30 \
  -o "$IDLE_STAGE"; then
  python3 "$ATOMIC_INSTALL" "$IDLE_STAGE" /var/run/airplay-aa/idle.h264 --mode 644
fi
rm -f "$IDLE_STAGE"

echo "==> Installing systemd unit"
python3 "$ATOMIC_INSTALL" "$ROOT/systemd/airplay-aa-bridge.service" \
  /etc/systemd/system/airplay-aa-bridge.service --mode 644
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
