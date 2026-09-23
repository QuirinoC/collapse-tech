#!/usr/bin/env bash
# Top-level orchestrator: AAServer (USB AOAP) + AirPlay pipeline + H.264 injector.
# Wireless Android Auto is intentionally disabled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer installed config, fall back to repo defaults.
# shellcheck disable=SC1091
if [[ -f /etc/airplay-aa/bridge.env ]]; then
  source /etc/airplay-aa/bridge.env
else
  source "${ROOT}/config/bridge.env"
fi

export PATH="${AIRPLAY_AA_PREFIX}/bin:${PATH}"
export GST_PLUGIN_PATH="${AIRPLAY_AA_PREFIX}/lib/gstreamer-1.0:${GST_PLUGIN_PATH:-}"
# Socket H.264 inject mode (no Snowmix).
unset AIRPLAY_AA_SHM || true

mkdir -p "$AIRPLAY_AA_LOGDIR" "$(dirname "$AIRPLAY_AA_SOCKET")" /var/run/airplay-aa
cd "${AIRPLAY_AA_PREFIX}/libexec/aaserver"

# Enlarge Unix socket buffers for 800x480 H.264 bursts.
sysctl -w net.core.wmem_max=2097152 >/dev/null || true
sysctl -w net.core.wmem_default=2097152 >/dev/null || true

modprobe libcomposite 2>/dev/null || true
modprobe dwc2 2>/dev/null || true
modprobe usb_f_mass_storage 2>/dev/null || true
modprobe usb_f_fs 2>/dev/null || true

# Stale configfs gadgets from a prior crash block AAServer ("Already exist").
if [[ -d /sys/kernel/config/usb_gadget ]]; then
  for g in /sys/kernel/config/usb_gadget/*; do
    [[ -d "$g" ]] || continue
    echo "" >"$g/UDC" 2>/dev/null || true
    for cfg in "$g"/configs/*; do
      [[ -d "$cfg" ]] || continue
      for link in "$cfg"/*; do [[ -L "$link" ]] && rm -f "$link"; done
      rmdir "$cfg"/strings/* 2>/dev/null || true
      rmdir "$cfg" 2>/dev/null || true
    done
    for fn in "$g"/functions/*; do
      [[ -e "$fn" ]] || continue
      for lun in "$fn"/lun.*; do
        [[ -d "$lun" ]] && echo "" >"$lun/file" 2>/dev/null || true
      done
      rmdir "$fn" 2>/dev/null || true
    done
    rmdir "$g"/strings/* 2>/dev/null || true
    rmdir "$g"/strings 2>/dev/null || true
    rmdir "$g" 2>/dev/null || true
  done
fi
# g_ether claims the UDC and conflicts with AAServer's composite gadget.
modprobe -r g_ether 2>/dev/null || true

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
  rm -f ./socket "$AIRPLAY_AA_SOCKET"
}
trap cleanup EXIT INT TERM

rm -f ./socket "$AIRPLAY_AA_SOCKET"

# AAServer creates ./socket in its cwd; expose a stable path via symlink.
(
  while true; do
    date -Is
    ./AAServer ${AIRPLAY_AA_DUMP:+--dumpfile="$AIRPLAY_AA_DUMP"}
    echo "AAServer exited; restarting in 2s" >&2
    sleep 2
  done
) >"$AIRPLAY_AA_LOGDIR/aaserver.log" 2>&1 &
AA_PID=$!

for _ in $(seq 1 60); do
  if [[ -S ./socket ]]; then
    ln -sfn "$(pwd)/socket" "$AIRPLAY_AA_SOCKET"
    break
  fi
  sleep 0.5
done
[[ -S "$AIRPLAY_AA_SOCKET" ]] || { echo "AAServer socket not ready" >&2; exit 1; }

"${ROOT}/scripts/run-airplay-pipeline.sh" &
PIPE_PID=$!

PYTHONPATH="${ROOT}/bridge${PYTHONPATH:+:$PYTHONPATH}" \
  python3 "${ROOT}/bridge/inject_h264.py" \
    --aa-socket "$AIRPLAY_AA_SOCKET" \
    --h264-source "$AIRPLAY_AA_H264" \
    >"$AIRPLAY_AA_LOGDIR/inject.log" 2>&1 &
INJ_PID=$!

echo "airplay-aa-bridge running aa=${AA_PID} pipe=${PIPE_PID} inject=${INJ_PID}"
echo "AirPlay name: ${AIRPLAY_AA_NAME}"
echo "USB: plug Pi USB-C/OTG data port into the car (or Mac running OpenAuto)."
wait -n "$AA_PID" "$PIPE_PID" "$INJ_PID"
