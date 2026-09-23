#!/usr/bin/env bash
# Install non-expired GAL engineering TLS identity into every AAServer location.
# Stock AACS CarService cert expired 2022-08-24 → HU/DHU "certificate has expired"
# / car "device is not responding" after AOAP.
#
# Usage (from Mac, Pi reachable):
#   ./scripts/install-certs.sh quirino@10.0.0.112
# On the Pi (repo or /opt/airplay-aa tree):
#   sudo ./scripts/install-certs.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRT="$ROOT/certs/android_auto.crt"
KEY="$ROOT/certs/android_auto.key"
PI_HOST="${1:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$CRT" && -f "$KEY" ]] || die "missing $CRT / $KEY"

install_local() {
  local prefix="${AIRPLAY_AA_PREFIX:-/opt/airplay-aa}"
  local targets=()
  [[ -d "$prefix/libexec/aaserver" ]] && targets+=("$prefix/libexec/aaserver")
  [[ -d "$prefix/third_party/AACS/AAServer/ssl" ]] && targets+=("$prefix/third_party/AACS/AAServer/ssl")
  [[ -d "$prefix/third_party/AACS/build/AAServer" ]] && targets+=("$prefix/third_party/AACS/build/AAServer")
  # Also cover a live build tree next to this script (dev installs).
  [[ -d "$ROOT/third_party/AACS/AAServer/ssl" ]] && targets+=("$ROOT/third_party/AACS/AAServer/ssl")
  [[ -d "$ROOT/third_party/AACS/build/AAServer" ]] && targets+=("$ROOT/third_party/AACS/build/AAServer")

  ((${#targets[@]})) || die "no AAServer install dirs under $prefix (run install-pi.sh first)"

  local t
  for t in "${targets[@]}"; do
    echo "→ $t"
    install -m 644 "$CRT" "$t/android_auto.crt"
    install -m 644 "$KEY" "$t/android_auto.key"
  done

  echo "==> verifying installed cert notAfter"
  openssl x509 -in "$prefix/libexec/aaserver/android_auto.crt" -noout -subject -dates
  local after
  after="$(openssl x509 -in "$prefix/libexec/aaserver/android_auto.crt" -noout -enddate | cut -d= -f2)"
  echo "$after" | grep -q 2048 || die "expected notAfter year 2048, got: $after"

  if systemctl list-unit-files airplay-aa-bridge.service &>/dev/null; then
    systemctl restart airplay-aa-bridge
    sleep 2
    systemctl is-active airplay-aa-bridge
  fi
  echo "OK: non-expired certs installed"
}

if [[ -n "$PI_HOST" ]]; then
  scp "$CRT" "$KEY" "$ROOT/scripts/install-certs.sh" "$PI_HOST:/tmp/"
  ssh "$PI_HOST" 'bash -s' <<'EOF'
set -euo pipefail
sudo mkdir -p /opt/airplay-aa/certs /opt/airplay-aa/scripts
sudo cp /tmp/android_auto.crt /tmp/android_auto.key /opt/airplay-aa/certs/
sudo cp /tmp/install-certs.sh /opt/airplay-aa/scripts/
sudo chmod +x /opt/airplay-aa/scripts/install-certs.sh
sudo AIRPLAY_AA_PREFIX=/opt/airplay-aa /opt/airplay-aa/scripts/install-certs.sh
EOF
  echo "Installed on $PI_HOST"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo, or pass a Pi host: $0 quirino@10.0.0.112" >&2
  exit 1
fi

install_local
