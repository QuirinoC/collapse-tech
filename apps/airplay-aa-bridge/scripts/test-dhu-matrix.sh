#!/usr/bin/env bash
# Real USB/DHU interoperability matrix; it does not certify the phone stack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/bridge/bench_matrix.py" "$@"
