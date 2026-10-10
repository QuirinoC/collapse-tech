#!/usr/bin/env bash
# Exercise the injector, FIFO, Linux AA framing, decoded video and HLS clock.
# macOS needs Linux for AF_UNIX SOCK_SEQPACKET; no Pi/USB/DHU is involved.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE=airplay-aa-local-video-test

if [[ "$(uname -s)" == Linux ]] && command -v python3 >/dev/null && \
   command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && \
   command -v gst-launch-1.0 >/dev/null && \
   python3 -c 'import socket; socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET).close()'; then
  cd "$ROOT"
  exec env AIRPLAY_AA_REQUIRE_VIDEO_TESTS=1 PYTHONDONTWRITEBYTECODE=1 \
    python3 -m unittest discover -s tests -v
fi

if ! command -v docker >/dev/null; then
  echo "Video integration requires Linux with FFmpeg and GStreamer, or a running Docker engine." >&2
  exit 1
fi

docker build --file "$ROOT/tests/local-video.Dockerfile" --tag "$IMAGE" "$ROOT/tests"
exec docker run --rm --network none \
  --env AIRPLAY_AA_REQUIRE_VIDEO_TESTS=1 \
  --mount "type=bind,src=$ROOT,dst=/project,readonly" \
  "$IMAGE"
