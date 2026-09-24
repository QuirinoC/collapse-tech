#!/usr/bin/env bash
# Launch Steam Balatro with Lovely injector (required on macOS).
# Do not use Steam's Play button — Lovely will not load.
set -euo pipefail
GAME_DIR="${BALATRO_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Balatro}"
cd "$GAME_DIR"
if [[ ! -f liblovely.dylib || ! -f run_lovely_macos.sh ]]; then
  echo "Lovely not found in: $GAME_DIR" >&2
  echo "See apps/balatro-jev/README.md (macOS: Steamodded + Lovely)." >&2
  exit 1
fi
exec sh run_lovely_macos.sh "$@"
