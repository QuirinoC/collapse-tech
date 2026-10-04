#!/usr/bin/env bash
# Top-level orchestrator: AAServer (USB AOAP) + AirPlay pipeline + H.264 injector.
# Wireless Android Auto is intentionally disabled.
#
# Boot contract for the car:
#   - UxPlay advertises immediately (AirPlay cast ready without USB).
#   - AAServer waits in ModeSwitcher for the car's USB host / AOAP.
#   - Injector attaches once AAServer's Unix socket appears after AOAP.
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
# Pre-create H.264 FIFO so the injector can hold the read-end before UxPlay starts.
if [[ ! -p "$AIRPLAY_AA_H264" ]]; then
  rm -f "$AIRPLAY_AA_H264"
  mkfifo "$AIRPLAY_AA_H264"
fi
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

# AAServer creates ./socket only after a USB host completes AOAP.
(
  while true; do
    date -Is
    ./AAServer ${AIRPLAY_AA_DUMP:+--dumpfile="$AIRPLAY_AA_DUMP"}
    echo "AAServer exited; restarting in 2s" >&2
    sleep 2
  done
) >"$AIRPLAY_AA_LOGDIR/aaserver.log" 2>&1 &
AA_PID=$!

# AirPlay must be cast-ready on boot — do not wait for the car USB socket.
"${ROOT}/scripts/run-airplay-pipeline.sh" &
PIPE_PID=$!

start_injector() {
  PYTHONPATH="${ROOT}/bridge${PYTHONPATH:+:$PYTHONPATH}" \
    python3 "${ROOT}/bridge/inject_h264.py" \
      --aa-socket "$AIRPLAY_AA_SOCKET" \
      --h264-source "$AIRPLAY_AA_H264" \
      >>"$AIRPLAY_AA_LOGDIR/inject.log" 2>&1 &
  INJ_PID=$!
}

# Hold the H.264 FIFO read-end from boot so UxPlay (-vrtp / HLS encode) never
# blocks on filesink. Injector drains while waiting for car AOAP, then pumps AA.
# A second injector on channel 1 re-enters openChannel and can block SetupResponse.
# Match python only — a pgrep -f of this script's own text would match itself.
mapfile -t STALE_INJ < <(ps -eo pid=,args= | awk '/python3/ && /inject_h264\.py/ && !/awk/ {print $1}')
if ((${#STALE_INJ[@]})); then
  echo "stopping leftover H.264 injector(s)" >&2
  kill "${STALE_INJ[@]}" 2>/dev/null || true
  sleep 0.3
fi
INJ_PID=""
INJ_BACKOFF=1
start_injector

echo "airplay-aa-bridge running aa=${AA_PID} pipe=${PIPE_PID} inj=${INJ_PID}"
echo "AirPlay name: ${AIRPLAY_AA_NAME} (cast-ready; waiting for car USB AOAP)"
echo "USB: plug Pi USB-C *data* port into the car (powered hub if car USB is weak)."

# Keep AirPlay + FIFO holder up. Symlink AAServer socket when AOAP appears.
# Only exit when the AAServer supervisor dies (systemd Restart=always).
SOCKET_READY=0
while kill -0 "$AA_PID" 2>/dev/null; do
  if [[ -S ./socket ]]; then
    if (( ! SOCKET_READY )); then
      ln -sfn "$(pwd)/socket" "$AIRPLAY_AA_SOCKET"
      SOCKET_READY=1
      echo "AAServer socket present (AOAP up)" >&2
    fi
  elif ((SOCKET_READY)); then
    echo "AAServer socket gone (USB unplug?)" >&2
    SOCKET_READY=0
    rm -f "$AIRPLAY_AA_SOCKET"
  fi

  if ! kill -0 "$PIPE_PID" 2>/dev/null; then
    echo "AirPlay pipeline exited; restarting..." >&2
    "${ROOT}/scripts/run-airplay-pipeline.sh" &
    PIPE_PID=$!
  fi

  if [[ -z "$INJ_PID" ]] || ! kill -0 "$INJ_PID" 2>/dev/null; then
    # Another injector may already hold the lock (duplicate start). Adopt it
    # instead of launching a second process that would also take channel 1.
    other="$(ps -eo pid=,args= | awk '/python3/ && /inject_h264\.py/ && !/awk/ {print $1; exit}')"
    if [[ -n "$other" ]]; then
      echo "injector already running pid=${other}; not starting a second" >&2
      INJ_PID=$other
      INJ_BACKOFF=1
    else
      echo "injector exited; restarting in ${INJ_BACKOFF}s..." >&2
      sleep "$INJ_BACKOFF"
      INJ_BACKOFF=$(( INJ_BACKOFF < 30 ? INJ_BACKOFF * 2 : 30 ))
      start_injector
    fi
  else
    INJ_BACKOFF=1
  fi

  if [[ -n "$INJ_PID" ]] && kill -0 "$INJ_PID" 2>/dev/null; then
    wait -n "$AA_PID" "$PIPE_PID" "$INJ_PID" 2>/dev/null || true
  else
    sleep 1
  fi
done

echo "AAServer supervisor exited" >&2
exit 1
