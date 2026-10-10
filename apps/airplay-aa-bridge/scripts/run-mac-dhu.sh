#!/usr/bin/env bash
# Launch Google Desktop Head Unit (DHU) against the Pi AAServer USB gadget.
#
# Bench findings (Mac mini arm64, 2026-10):
# - No OpenAuto macOS/arm64 prebuild; Docker Desktop cannot USB-passthrough.
# - DHU darwin-x64 (Rosetta) CAN complete AOAP with AAServer (12d1:107e → 18d1:2d00),
#   and version negotiation (phone 1.5). Authentication also requires a current,
#   trusted PHONE identity with O=CarService. Validate it with check-phone-certs.sh
#   and install via AIRPLAY_AA_CERT_DIR + install-certs.sh; the current candidate
#   expires 2026-12-09 and needs renewal. install-dhu-certs.sh extracts HEAD-UNIT
#   material only and must not supply AAServer's identity.
# - Flag form MUST be `--usb TAGAAS` (not `-u=TAGAAS`, which searches for "=TAGAAS").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DHU_DIR="${AIRPLAY_AA_DHU_DIR:-$ROOT/.local/dhu}"
DHU_BIN="$DHU_DIR/desktop-head-unit"
CFG="${1:-$DHU_DIR/config/aa_bridge.ini}"

if [[ ! -x "$DHU_BIN" ]]; then
  mkdir -p "$DHU_DIR"
  echo "Downloading Android Auto Desktop Head Unit (darwin-x64)..."
  curl -fsSL -o /tmp/dhu-darwin.zip \
    'https://dl.google.com/android/repository/desktop-head-unit-darwin-x64_r02.1.zip'
  unzip -o /tmp/dhu-darwin.zip -d "$DHU_DIR"
  chmod +x "$DHU_BIN"
  xattr -dr com.apple.quarantine "$DHU_DIR" 2>/dev/null || true
fi

if [[ ! -f "$CFG" ]]; then
  mkdir -p "$(dirname "$CFG")"
  cat >"$CFG" <<'EOF'
[general]
touch = true
touchpad = false
controller = false
instrumentcluster = false
resolution = 800x480
dpi = 160
framerate = 30

[sensors]
location = true
night_mode = true
driving_status = true
EOF
fi

if [[ "$(uname -m)" == "arm64" ]]; then
  if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
    echo "Installing Rosetta 2 (needed for DHU x86_64)..."
    softwareupdate --install-rosetta --agree-to-license
  fi
fi

if ! ioreg -p IOUSB -w0 2>/dev/null | grep -q AAServer; then
  echo "WARN: no AAServer USB gadget seen yet."
  echo "  Keep GPIO power connected; connect Pi USB-C data to this Mac."
fi

# The old local setup contains ssl_bypass.dylib. Bench tests must exercise
# the real head-unit certificate check, even if a shell inherited that shim.
unset DYLD_INSERT_LIBRARIES DYLD_FORCE_FLAT_NAMESPACE
export DYLD_LIBRARY_PATH="$DHU_DIR${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
cd "$DHU_DIR"

echo "Launching DHU @ 800x480 (USB serial TAGAAS)."
echo "Expect: AOAPv2 switch → 18d1:2d00 → protocol 1.5 → TLS → video."
exec arch -x86_64 "$DHU_BIN" -c "$CFG" --usb TAGAAS
