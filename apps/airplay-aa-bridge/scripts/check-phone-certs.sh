#!/usr/bin/env bash
# Read-only role/validity/key checks for a PHONE-side Android Auto identity.
# Usage: check-phone-certs.sh DIR (android_auto.crt + android_auto.key).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${1:-${AIRPLAY_AA_CERT_DIR:-$ROOT/certs}}"
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo "Usage: $0 DIR"
  echo "Checks CarService organization, current validity, and matching key; does not establish head-unit trust."
  echo "Optional: AIRPLAY_AA_OPENSSL_BIN=/absolute/path/to/openssl"
  exit 0
fi
[[ $# -le 1 ]] || { echo "ERROR: expected one certificate directory" >&2; exit 1; }
python3 - "$CERT_DIR" "${AIRPLAY_AA_OPENSSL_BIN:-openssl}" <<'PY'
import datetime
from pathlib import Path
import re
import subprocess
import sys

directory = Path(sys.argv[1]).expanduser()
openssl = sys.argv[2]
certificate = directory / "android_auto.crt"
key = directory / "android_auto.key"

def die(message):
    print("ERROR: " + message, file=sys.stderr)
    raise SystemExit(1)

def run(arguments, data=None):
    try:
        result = subprocess.run([openssl, *arguments], input=data, capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        die("OpenSSL validation could not run: " + str(error))
    if result.returncode:
        die("OpenSSL could not validate the certificate/key (check format and an unencrypted matching key).")
    return result.stdout

if not certificate.is_file() or not key.is_file():
    die("expected android_auto.crt and android_auto.key in " + str(directory))
subject = run(["x509", "-in", str(certificate), "-noout", "-subject", "-nameopt", "RFC2253"]).decode().strip()
subject_value = subject.split("=", 1)[1].lstrip()
organizations = re.findall(r"(?:^|(?<!\\),)O=([^,]*)", subject_value)
if organizations != ["CarService"]:
    die("wrong Android Auto identity role: PHONE requires organization O=CarService; " + subject
        + ". DHU's Android-Auto-Internal identity belongs to the HEAD UNIT.")
dates = run(["x509", "-in", str(certificate), "-noout", "-dates"]).decode().strip()
values = dict(line.split("=", 1) for line in dates.splitlines() if "=" in line)
try:
    start = datetime.datetime.strptime(values["notBefore"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
    end = datetime.datetime.strptime(values["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
except (KeyError, ValueError):
    die("certificate validity could not be parsed; use OpenSSL 3 via AIRPLAY_AA_OPENSSL_BIN if the system parser rejects its time encoding.")
now = datetime.datetime.now(datetime.timezone.utc)
if now < start:
    die("phone certificate is not yet valid: " + values["notBefore"])
if now >= end:
    die("phone certificate expired: " + values["notAfter"])
public_pem = run(["x509", "-in", str(certificate), "-pubkey", "-noout"])
certificate_public = run(["pkey", "-pubin", "-outform", "DER"], public_pem)
key_public = run(["pkey", "-in", str(key), "-passin", "pass:", "-pubout", "-outform", "DER"], b"")
if certificate_public != key_public:
    die("phone certificate and private key do not match")
print(subject)
print(dates)
print("OK: PHONE role, current validity, and key match. Head-unit trust still requires a real authenticated session.")
PY
