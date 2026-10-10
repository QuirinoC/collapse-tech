#!/usr/bin/env bash
# Generate distinctive moving content for the real Mac AirPlay round trip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/.local/mac-airplay-loop.mp4}"
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to generate the AirPlay test clip." >&2
  exit 1
fi
if [[ -e "$OUTPUT" ]]; then
  echo "Refusing to overwrite existing clip: $OUTPUT" >&2
  exit 1
fi
mkdir -p "$(dirname "$OUTPUT")"
ffmpeg -hide_banner -loglevel error -n \
  -f lavfi -i 'testsrc2=size=800x480:rate=30' -t 30 \
  -an -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -movflags +faststart "$OUTPUT"
echo "Clip: $OUTPUT"
echo "Open it in QuickTime, select View > Loop, and play it."
echo "Use Screen Mirroring > Pi AirPlay AA to share this window or a test display."
