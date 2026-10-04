#!/usr/bin/env bash
# UxPlay AirPlay2 receiver → Annex-B H.264 FIFO.
#
# Two AirPlay video modes share one headless shmsink. shmsrc does not carry
# caps, so both modes convert to the same I420 size/rate before the socket:
#   1) Screen mirroring  — decoded frames → fixed I420 shmsink → companion → FIFO
#   2) YouTube URL/HLS   — requires -hls; playbin → same shmsink → companion → FIFO
#
# Without -hls, the YouTube AirPlay icon only sends ALAC audio (UxPlay upstream).
# -vs 0 sets use_video=false and kills ALL video (mirror + HLS); never use it.
#
# Do NOT exec uxplay: this shell must stay alive as process-group leader so the
# gst companion + FIFO relay are not SIGHUP'd.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
if [[ -f /etc/airplay-aa/bridge.env ]]; then source /etc/airplay-aa/bridge.env; else source "${ROOT}/config/bridge.env"; fi

mkdir -p "$(dirname "$AIRPLAY_AA_H264")" "$AIRPLAY_AA_LOGDIR"
# Prefer the FIFO already held open by inject_h264; only create if missing.
if [[ ! -p "$AIRPLAY_AA_H264" ]]; then
  rm -f "$AIRPLAY_AA_H264"
  mkfifo "$AIRPLAY_AA_H264"
fi

SHM_SOCKET="${AIRPLAY_AA_SHM_SOCKET:-/var/run/airplay-aa/uxplay.shm}"
rm -f "$SHM_SOCKET"

UX_PID=""
COMPANION_PID=""

cleanup() {
  if [[ -n "$UX_PID" ]] && kill -0 "$UX_PID" 2>/dev/null; then
    kill "$UX_PID" 2>/dev/null || true
  fi
  if [[ -n "$COMPANION_PID" ]] && kill -0 "$COMPANION_PID" 2>/dev/null; then
    kill "$COMPANION_PID" 2>/dev/null || true
  fi
  jobs -p | xargs -r kill 2>/dev/null || true
  rm -f "$SHM_SOCKET"
}
trap cleanup EXIT INT TERM

# Read Annex-B from stdin; write to FIFO when a reader is present, else drop.
# Must use python3 -c (not python3 - <<EOF): stdin is the gst pipe.
fifo_relay() {
  python3 -c '
import errno, os, sys
fifo = sys.argv[1]
fd = None
stdin = sys.stdin.buffer
while True:
    data = stdin.read(65536)
    if not data:
        break
    if fd is None:
        try:
            fd = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
        except OSError:
            continue
    try:
        os.write(fd, data)
    except OSError as e:
        if e.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
            continue
        if e.errno in (errno.EPIPE, errno.EINVAL, errno.EBADF):
            try:
                os.close(fd)
            except OSError:
                pass
            fd = None
            continue
        raise
' "$AIRPLAY_AA_H264"
}

wait_for_shm() {
  local i
  for i in $(seq 1 100); do
    [[ -e "$SHM_SOCKET" ]] && return 0
    kill -0 "$UX_PID" 2>/dev/null || return 1
    sleep 0.1
  done
  return 1
}

# shmsrc does not carry caps (GStreamer 1.26): its pad is ANY, and a
# videoconvert/videoscale/videorate immediately after shmsrc returns
# not-negotiated (-4). That was the 13:50 companion death. HLS and mirror
# caps are normalized in SINK_BIN (those elements) before the socket.
# The companion only declares this exact raw video, and restarts if it exits.
# 800x480 I420 is 576000 bytes/frame; the shm area is page-aligned.
SHM_SIZE=33554432
RAW_CAPS="video/x-raw,format=I420,width=${AIRPLAY_AA_WIDTH},height=${AIRPLAY_AA_HEIGHT},framerate=${AIRPLAY_AA_FPS}/1"
SINK_BIN="videoconvert ! videoscale ! videorate skip-to-first=true ! ${RAW_CAPS} ! shmsink socket-path=${SHM_SOCKET} wait-for-connection=false sync=false shm-size=${SHM_SIZE}"
# HLS playbin (AIRPLAY_AA_HLS_SINK) and mirror/jpeg (AIRPLAY_AA_VIDEO_SINK_BIN).
export AIRPLAY_AA_HLS_SINK="${SINK_BIN}"
export AIRPLAY_AA_VIDEO_SINK_BIN="${SINK_BIN}"
# -vs element name only keeps autovideosink off. The bins above are the real sink.
# Do not pass -vs 0 (that disables all video, including HLS).
VSINK="shmsink"

echo "starting UxPlay as '${AIRPLAY_AA_NAME}' (AirPlay mirror + YouTube HLS, no local display)"
echo "H.264 shm caps ${RAW_CAPS}"
stdbuf -oL -eL uxplay \
  -n "${AIRPLAY_AA_NAME}" \
  -nh \
  -hls 2 \
  -s "${AIRPLAY_AA_WIDTH}x${AIRPLAY_AA_HEIGHT}@${AIRPLAY_AA_FPS}" \
  -vsync no \
  -as fakesink \
  -vs "${VSINK}" \
  -nohold \
  -d \
  >>"$AIRPLAY_AA_LOGDIR/uxplay.log" 2>&1 &
UX_PID=$!

# UxPlay unlinks the socket when HLS replaces mirror (and the reverse).
# shmsrc then errors; this loop starts a new encoder on the new socket.
(
  set +e
  while kill -0 "$UX_PID" 2>/dev/null; do
    if ! wait_for_shm; then
      sleep 0.2
      continue
    fi
    echo "$(date -Is) starting H.264 companion ${RAW_CAPS} shm ${SHM_SOCKET} → ${AIRPLAY_AA_H264}" \
      >>"$AIRPLAY_AA_LOGDIR/uxplay.log"
    gst-launch-1.0 -q \
      shmsrc socket-path="${SHM_SOCKET}" is-live=true do-timestamp=true ! \
      "${RAW_CAPS}" ! \
      queue max-size-buffers=2 max-size-bytes=0 max-size-time=0 leaky=downstream ! \
      x264enc tune=zerolatency speed-preset=ultrafast key-int-max="${AIRPLAY_AA_FPS}" bframes=0 byte-stream=true ! \
      video/x-h264,stream-format=byte-stream,alignment=au,profile=baseline ! \
      h264parse config-interval=-1 ! fdsink fd=1 sync=false \
      2>>"$AIRPLAY_AA_LOGDIR/uxplay.log" \
      | fifo_relay
    echo "$(date -Is) H.264 companion exited status ${PIPESTATUS[0]} (restarting while UxPlay is up)" \
      >>"$AIRPLAY_AA_LOGDIR/uxplay.log"
    sleep 0.3
  done
) &
COMPANION_PID=$!

wait "$UX_PID"
exit $?
