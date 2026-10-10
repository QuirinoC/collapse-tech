#!/usr/bin/env bash
# Install a validated PHONE-side Android Auto identity into AAServer locations.
# AIRPLAY_AA_CERT_DIR contains current android_auto.crt + android_auto.key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="${AIRPLAY_AA_CERT_DIR:-$ROOT/certs}"
CRT="$CERT_DIR/android_auto.crt"
KEY="$CERT_DIR/android_auto.key"
PI_HOST="${1:-}"
CHECKER="$(dirname "$0")/check-phone-certs.sh"
SKIP_RESTART="${AIRPLAY_AA_SKIP_RESTART:-0}"

die() { echo "ERROR: $*" >&2; exit 1; }

if [[ "$PI_HOST" == --help || "$PI_HOST" == -h ]]; then
  echo "Usage: AIRPLAY_AA_CERT_DIR=/path/to/phone-identity $0 [user@pi-host]"
  echo "Without a host, run as root on the Pi. Wrong-role/expired/mismatched identities are rejected before installation."
  echo "AIRPLAY_AA_SKIP_RESTART=1 suppresses restart for a controlled deployment (default 0)."
  exit 0
fi
[[ $# -le 1 ]] || die "expected at most one Pi host"
[[ "$SKIP_RESTART" == 0 || "$SKIP_RESTART" == 1 ]] || die "AIRPLAY_AA_SKIP_RESTART must be 0 or 1"
# Check before SCP, mkdir, copies, or restarts. Bundled DHU material fails here.
bash "$CHECKER" "$CERT_DIR"
CERT_DIR="$(cd "$CERT_DIR" && pwd)"
CRT="$CERT_DIR/android_auto.crt"
KEY="$CERT_DIR/android_auto.key"

install_local() {
  local prefix="${AIRPLAY_AA_PREFIX:-/opt/airplay-aa}"
  [[ -d "$prefix/libexec/aaserver" ]] || die "AAServer runtime is missing under $prefix (build it first)"
  install -d "$prefix/certs"
  local targets=("$prefix/certs" "$prefix/libexec/aaserver")
  [[ -d "$prefix/third_party/AACS/AAServer/ssl" ]] && targets+=("$prefix/third_party/AACS/AAServer/ssl")
  [[ -d "$prefix/third_party/AACS/build/AAServer" ]] && targets+=("$prefix/third_party/AACS/build/AAServer")
  # Also cover a live build tree next to this script (dev installs).
  [[ -d "$ROOT/third_party/AACS/AAServer/ssl" ]] && targets+=("$ROOT/third_party/AACS/AAServer/ssl")
  [[ -d "$ROOT/third_party/AACS/build/AAServer" ]] && targets+=("$ROOT/third_party/AACS/build/AAServer")

  ((${#targets[@]})) || die "no AAServer install dirs under $prefix (run install-pi.sh first)"

  local t
  for t in "${targets[@]}"; do
    [[ "$(cd "$t" && pwd)" == "$CERT_DIR" ]] && continue
    echo "→ $t"
    install -m 644 "$CRT" "$t/android_auto.crt"
    install -m 600 "$KEY" "$t/android_auto.key"
  done

  bash "$CHECKER" "$prefix/libexec/aaserver"

  if [[ "$SKIP_RESTART" == 0 ]] && command -v systemctl >/dev/null 2>&1; then
    local load_state
    load_state="$(systemctl show airplay-aa-bridge.service -p LoadState --value 2>/dev/null || true)"
    if [[ "$load_state" == loaded ]]; then
      systemctl restart airplay-aa-bridge
      sleep 2
      systemctl is-active airplay-aa-bridge
    fi
  fi
  echo "OK: validated PHONE identity installed; verify authentication with the real head unit."
}

if [[ -n "$PI_HOST" ]]; then
  [[ "$PI_HOST" != -* && "$PI_HOST" != *[[:space:]]* ]] || die "invalid Pi host"
  remote_dir="$(ssh "$PI_HOST" 'mktemp -d /tmp/airplay-aa-certs.XXXXXX')"
  [[ "$remote_dir" =~ ^/tmp/airplay-aa-certs\.[A-Za-z0-9]+$ ]] || die "unexpected remote staging path"
  wrapper="$(mktemp -t airplay-aa-install.XXXXXX)"
  cleanup_remote() {
    rm -f "$wrapper"
    ssh -o BatchMode=yes -o ConnectTimeout=5 "$PI_HOST" "rm -rf -- '$remote_dir'" >/dev/null 2>&1 || true
  }
  trap cleanup_remote EXIT
  cat >"$wrapper" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
stage="$1"
skip_restart="$2"
trap 'rm -rf "$stage"' EXIT
bash "$stage/check-phone-certs.sh" "$stage"
install -d /opt/airplay-aa/certs /opt/airplay-aa/scripts
install -m 644 "$stage/android_auto.crt" /opt/airplay-aa/certs/
install -m 600 "$stage/android_auto.key" /opt/airplay-aa/certs/
install -m 755 "$stage/install-certs.sh" "$stage/check-phone-certs.sh" /opt/airplay-aa/scripts/
env AIRPLAY_AA_PREFIX=/opt/airplay-aa AIRPLAY_AA_CERT_DIR="$stage" AIRPLAY_AA_SKIP_RESTART="$skip_restart" /opt/airplay-aa/scripts/install-certs.sh
EOF
  scp "$CRT" "$KEY" "$ROOT/scripts/install-certs.sh" "$CHECKER" "$PI_HOST:$remote_dir/"
  scp "$wrapper" "$PI_HOST:$remote_dir/apply-phone-certs.sh"
  # User-level validation precedes sudo. A terminal carries only the password
  # prompt; the install script is a staged file, so stdin remains interactive.
  ssh "$PI_HOST" "bash '$remote_dir/check-phone-certs.sh' '$remote_dir'"
  ssh -t "$PI_HOST" "sudo bash '$remote_dir/apply-phone-certs.sh' '$remote_dir' '$SKIP_RESTART'"
  echo "Installed on $PI_HOST"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo, or pass a Pi host: $0 quirino@10.0.0.112" >&2
  exit 1
fi

install_local
