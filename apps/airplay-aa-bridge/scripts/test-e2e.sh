#!/usr/bin/env bash
# Real Mac DHU + Pi USB bench test; see --help for bounded capture options.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/bridge/bench_dhu.py" "$@"
