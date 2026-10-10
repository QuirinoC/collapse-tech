#!/usr/bin/env bash
# Update an EXISTING Pi install from a privately staged subset of this project.
# No dependency builds, boot changes, reboot, or direct USB gadget operations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX=/opt/airplay-aa
CONFIG=/etc/airplay-aa/bridge.env
SERVICE=airplay-aa-bridge.service
CERT_DIR="${AIRPLAY_AA_CERT_DIR:-$ROOT/certs}"
BACKUP=""

die() { echo "ERROR: $*" >&2; exit 1; }

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo "Usage: sudo env AIRPLAY_AA_CERT_DIR=/private/phone-identity $0"
  echo "Updates an existing /opt/airplay-aa install and enables the SMPTE bench source."
  echo "Validates the PHONE identity before writes, saves a private rollback, and restarts the service once."
  exit 0
fi
[[ $# -eq 0 ]] || die "this updater takes no arguments (use AIRPLAY_AA_CERT_DIR for the identity)"
[[ "$(id -u)" -eq 0 ]] || die "run this staged updater with sudo"
for required in bash python3 openssl systemctl timeout install cp mktemp date; do
  command -v "$required" >/dev/null 2>&1 || die "missing existing-install prerequisite: $required"
done

# This must precede every write, including backup creation and service changes.
bash "$ROOT/scripts/check-phone-certs.sh" "$CERT_DIR"

FILES=(
  scripts/run-bridge.sh
  scripts/run-airplay-pipeline.sh
  scripts/install-certs.sh
  scripts/check-phone-certs.sh
  bridge/inject_h264.py
  bridge/aa_framing.py
  bridge/gen_idle_h264.py
)
for relative in "${FILES[@]}"; do
  [[ -s "$ROOT/$relative" && ! -L "$ROOT/$relative" ]] || die "missing regular staged file: $relative"
  case "$relative" in
    *.sh) bash -n "$ROOT/$relative" ;;
    *.py) python3 - "$ROOT/$relative" <<'PY'
import ast
from pathlib import Path
import sys
path = Path(sys.argv[1])
ast.parse(path.read_text(), filename=str(path))
PY
      ;;
  esac
done
[[ -x "$PREFIX/libexec/aaserver/AAServer" ]] || die "existing AAServer runtime is missing under $PREFIX"
[[ -d "$PREFIX/scripts" && -d "$PREFIX/bridge" ]] || die "existing scripts/bridge directories are missing"
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || die "existing regular config is missing: $CONFIG"
bash -n "$CONFIG"
load_state="$(systemctl show "$SERVICE" -p LoadState --value)"
[[ "$load_state" == loaded ]] || die "existing service is not loaded: $SERVICE"
service_user="$(systemctl show "$SERVICE" -p User --value)"
[[ -z "$service_user" || "$service_user" == root || "$service_user" == 0 ]] || die "expected the existing service to run as root"
service_exec="$(systemctl show "$SERVICE" -p ExecStart --value)"
[[ "$service_exec" == *"path=$PREFIX/scripts/run-bridge.sh ;"* ]] || die "service ExecStart does not use $PREFIX/scripts/run-bridge.sh"
kill_mode="$(systemctl show "$SERVICE" -p KillMode --value)"
[[ "$kill_mode" == control-group ]] || die "expected KillMode=control-group so a stop includes existing child processes"

# Match the certificate installer's runtime/source/build targets. Run that
# installer from PREFIX so it cannot modify an unrelated staged build tree.
CERT_TARGETS=("$PREFIX/libexec/aaserver" "$PREFIX/certs")
for target in "$PREFIX/third_party/AACS/AAServer/ssl" "$PREFIX/third_party/AACS/build/AAServer"; do
  [[ ! -d "$target" ]] || CERT_TARGETS+=("$target")
done
CHANGED=("$CONFIG")
for relative in "${FILES[@]}"; do CHANGED+=("$PREFIX/$relative"); done
for target in "${CERT_TARGETS[@]}"; do
  CHANGED+=("$target/android_auto.crt" "$target/android_auto.key")
done
for target in "${CHANGED[@]}"; do
  [[ ! -L "$target" ]] || die "refusing to replace a symlink: $target"
  [[ ! -e "$target" || -f "$target" ]] || die "expected a regular installed file: $target"
done

umask 077
BACKUP="$(mktemp -d "/var/backups/airplay-aa-bench-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
chmod 700 "$BACKUP"
mkdir "$BACKUP/files"
for target in "${CHANGED[@]}"; do
  if [[ -f "$target" ]]; then
    cp -a --parents -- "$target" "$BACKUP/files"
    [[ "$target" != */android_auto.key ]] || chmod 600 "$BACKUP/files$target"
    printf '%s\n' "$target" >>"$BACKUP/existing-files"
  else
    printf '%s\n' "$target" >>"$BACKUP/new-files"
  fi
done
touch "$BACKUP/existing-files" "$BACKUP/new-files"
cat >"$BACKUP/rollback.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Run rollback with sudo." >&2; exit 1; }
backup="$(cd "$(dirname "$0")" && pwd)"
if ! timeout 30s systemctl stop airplay-aa-bridge.service; then
  echo "Service stop did not complete; no files restored. Inspect systemctl status airplay-aa-bridge.service before retrying." >&2
  exit 1
fi
while IFS= read -r path; do
  [[ -z "$path" ]] || cp -a -- "$backup/files$path" "$path"
done <"$backup/existing-files"
while IFS= read -r path; do
  [[ -z "$path" ]] || rm -f -- "$path"
done <"$backup/new-files"
timeout 30s systemctl restart airplay-aa-bridge.service
systemctl is-active airplay-aa-bridge.service
echo "Previous files restored."
ROLLBACK
chmod 700 "$BACKUP/rollback.sh"

on_exit() {
  status=$?
  if ((status)); then
    echo "Update did not complete. Inspect: sudo systemctl status $SERVICE --no-pager" >&2
    echo "Rollback: sudo bash $BACKUP/rollback.sh" >&2
  fi
}
trap on_exit EXIT
echo "Private backup: $BACKUP"
if ! timeout 30s systemctl stop "$SERVICE"; then
  die "service stop did not complete within 30s; installed files are untouched (the stop job may still be running)"
fi

for relative in "${FILES[@]}"; do
  install -o root -g root -m 755 "$ROOT/$relative" "$PREFIX/$relative"
done
install -d -o root -g root -m 755 "$PREFIX/certs"
install -o root -g root -m 644 "$CERT_DIR/android_auto.crt" "$PREFIX/certs/android_auto.crt"
install -o root -g root -m 600 "$CERT_DIR/android_auto.key" "$PREFIX/certs/android_auto.key"
env AIRPLAY_AA_PREFIX="$PREFIX" AIRPLAY_AA_CERT_DIR="$PREFIX/certs" AIRPLAY_AA_SKIP_RESTART=1 \
  bash "$PREFIX/scripts/install-certs.sh"
python3 - "$CONFIG" <<'PY'
from pathlib import Path
import re
import sys
path = Path(sys.argv[1])
lines = path.read_text().splitlines(keepends=True)
updated = []
found = False
for line in lines:
    if re.match(r"^\s*(?:export\s+)?AIRPLAY_AA_SOURCE\s*=", line):
        if not found:
            updated.append("AIRPLAY_AA_SOURCE=test-pattern\n")
            found = True
    else:
        updated.append(line)
if not found:
    if updated and not updated[-1].endswith("\n"):
        updated[-1] += "\n"
    updated.append("\n# Local USB/DHU bench: use the existing encoder and transport.\nAIRPLAY_AA_SOURCE=test-pattern\n")
path.write_text("".join(updated))
PY
bash -n "$CONFIG"
timeout 30s systemctl restart "$SERVICE"
systemctl is-active "$SERVICE"
echo "Bench source installed and service restarted. Verify decoded video with the Mac DHU runner."
echo "Rollback: sudo bash $BACKUP/rollback.sh"
