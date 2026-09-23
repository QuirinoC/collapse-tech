#!/usr/bin/env bash
# Extract non-expired GAL engineering cert/key from Google DHU and install them
# into AAServer on the Pi. Required because stock AACS android_auto.crt
# (CarService OU=53) expired 2022-08-24 and DHU aborts with:
#   Verify returned: certificate has expired
#
# The DHU binary embeds obfuscated PEM blobs (XOR 0x27). The "client" identity
# is the public Android-Auto-Internal engineering cert (valid through 2048),
# which DHU accepts during TLS verify.
#
# Usage:
#   ./scripts/install-dhu-certs.sh              # extract only → .local/dhu-certs/
#   ./scripts/install-dhu-certs.sh quirino@10.0.0.112
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DHU_DIR="${AIRPLAY_AA_DHU_DIR:-$ROOT/.local/dhu}"
DHU_BIN="$DHU_DIR/desktop-head-unit"
OUT="$ROOT/.local/dhu-certs"
PI_HOST="${1:-}"

if [[ ! -x "$DHU_BIN" ]]; then
  echo "DHU not found; run scripts/run-mac-dhu.sh once to download it." >&2
  exit 1
fi

mkdir -p "$OUT"
python3 - "$DHU_BIN" "$OUT" <<'PY'
import struct, sys
from pathlib import Path

dhu = Path(sys.argv[1])
out = Path(sys.argv[2])
data = dhu.read_bytes()

def va_to_file(va: int) -> int:
    if 0x100000000 <= va < 0x100A90000:
        return va - 0x100000000
    if 0x100A90000 <= va < 0x100AC0000:
        return (va - 0x100A90000) + 0xA90000
    if 0x100AC0000 <= va < 0x100AF4000:
        return (va - 0x100AC0000) + 0xAC0000
    raise ValueError(hex(va))

# Mach-O symbol addresses from desktop-head-unit 2.1-mac (r02.1)
PTR_CLIENT, LEN_CLIENT = 0x100AC4B50, 0x1005512C8
PTR_KEY, LEN_KEY = 0x100AC4B58, 0x100551978

def load(ptr_va: int, len_va: int) -> bytes:
    ptr = struct.unpack_from("<Q", data, va_to_file(ptr_va))[0]
    length = struct.unpack_from("<Q", data, va_to_file(len_va))[0]
    blob = data[va_to_file(ptr) : va_to_file(ptr) + length]
    return bytes(b ^ 0x27 for b in blob).rstrip(b"\x00")

crt = load(PTR_CLIENT, LEN_CLIENT)
key = load(PTR_KEY, LEN_KEY)
if b"BEGIN CERTIFICATE" not in crt or b"BEGIN PRIVATE" not in key:
    raise SystemExit("failed to decode DHU embedded cert/key (binary layout changed?)")
(out / "android_auto.crt").write_bytes(crt + (b"" if crt.endswith(b"\n") else b"\n"))
(out / "android_auto.key").write_bytes(key + (b"" if key.endswith(b"\n") else b"\n"))
print(f"wrote {out}/android_auto.crt and android_auto.key")
PY

openssl x509 -in "$OUT/android_auto.crt" -noout -subject -issuer -dates
openssl rsa -in "$OUT/android_auto.key" -check -noout

if [[ -z "$PI_HOST" ]]; then
  echo "Extracted only. To install on the Pi:"
  echo "  $0 quirino@10.0.0.112"
  exit 0
fi

scp "$OUT/android_auto.crt" "$OUT/android_auto.key" "$PI_HOST:/tmp/"
ssh "$PI_HOST" 'bash -s' <<'EOF'
set -euo pipefail
sudo cp /tmp/android_auto.crt /tmp/android_auto.key /opt/airplay-aa/libexec/aaserver/
sudo cp /tmp/android_auto.crt /tmp/android_auto.key /opt/airplay-aa/third_party/AACS/AAServer/ssl/
# Keep build tree in sync if present.
if [[ -d /opt/airplay-aa/third_party/AACS/build/AAServer ]]; then
  sudo cp /tmp/android_auto.crt /tmp/android_auto.key /opt/airplay-aa/third_party/AACS/build/AAServer/
fi
sudo systemctl restart airplay-aa-bridge
sleep 2
systemctl is-active airplay-aa-bridge
openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -dates
EOF

echo "Installed on $PI_HOST. Re-launch: ./scripts/run-mac-dhu.sh"
