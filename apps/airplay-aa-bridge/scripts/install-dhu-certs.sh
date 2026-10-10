#!/usr/bin/env bash
# Extract DHU HEAD-UNIT credentials for inspection only.
# These cannot authenticate phone-side AAServer. Remote installation is refused.
# Usage: ./scripts/install-dhu-certs.sh (extract only → .local/dhu-headunit/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DHU_DIR="${AIRPLAY_AA_DHU_DIR:-$ROOT/.local/dhu}"
DHU_BIN="$DHU_DIR/desktop-head-unit"
OUT="$ROOT/.local/dhu-headunit"
PI_HOST="${1:-}"
if [[ "$PI_HOST" == --help || "$PI_HOST" == -h ]]; then
  echo "Usage: $0 (extract HEAD-UNIT material locally only)"
  echo "DHU's Android-Auto-Internal identity cannot replace the PHONE-side CarService identity."
  exit 0
fi
if [[ -n "$PI_HOST" || $# -gt 0 ]]; then
  echo "ERROR: remote Pi installation is refused: DHU contains a HEAD-UNIT identity, not a PHONE identity." >&2
  echo "Use a current CarService certificate/key with AIRPLAY_AA_CERT_DIR and install-certs.sh." >&2
  exit 1
fi

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
(out / "headunit.crt").write_bytes(crt + (b"" if crt.endswith(b"\n") else b"\n"))
(out / "headunit.key").write_bytes(key + (b"" if key.endswith(b"\n") else b"\n"))
(out / "headunit.key").chmod(0o600)
print(f"wrote {out}/headunit.crt and headunit.key (HEAD UNIT ONLY)")
PY

OPENSSL="${AIRPLAY_AA_OPENSSL_BIN:-openssl}"
"$OPENSSL" x509 -in "$OUT/headunit.crt" -noout -subject -issuer -dates
"$OPENSSL" rsa -in "$OUT/headunit.key" -check -noout
echo "Extracted locally for inspection. This HEAD-UNIT identity cannot fix PHONE-side AAServer authentication."
