#!/usr/bin/env bash
# Test the actual USB startup helper and the production discovery schemas.
# No Pi, USB device, AACS checkout, credentials, or service changes are needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CXX="${CXX:-c++}"
for dependency in "$CXX" protoc pkg-config; do
  command -v "$dependency" >/dev/null || {
    echo "AACS tests require $dependency" >&2
    exit 1
  }
done
pkg-config --exists protobuf || {
  echo "AACS tests require the protobuf C++ development package" >&2
  exit 1
}
OUT="$(mktemp -d "${TMPDIR:-/tmp}/airplay-aa-aacs-test.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT
read -r -a package_cflags <<< "$(pkg-config --cflags protobuf)"
read -r -a protobuf_libs <<< "$(pkg-config --libs protobuf)"
protobuf_cflags=()
for flag in "${package_cflags[@]}"; do
  case "$flag" in
    -I*) protobuf_cflags+=(-isystem "${flag#-I}") ;;
    *) protobuf_cflags+=("$flag") ;;
  esac
done
strict=(-Wall -Wextra -Werror -pedantic -pthread)

"$CXX" -std=c++14 "${strict[@]}" -I"$ROOT/patches" \
  "$ROOT/tests/usb_endpoint_startup_test.cpp" -o "$OUT/usb-startup-test"
"$OUT/usb-startup-test"

# New Homebrew protobuf requires C++17; the USB helper remains C++14-tested.
protobuf_standard=c++14
if ! printf '#include <google/protobuf/message.h>\n' | \
  "$CXX" -std=c++14 "${protobuf_cflags[@]}" -x c++ -fsyntax-only - \
  >"$OUT/protobuf-standard.log" 2>&1; then
  protobuf_standard=c++17
  echo "Installed protobuf requires C++17 for generated-code tests"
fi
protoc -I"$ROOT/patches" -I"$ROOT/tests/proto" --cpp_out="$OUT" \
  "$ROOT/patches/MediaStreamType.proto" "$ROOT/patches/MediaChannel.proto" \
  "$ROOT/patches/VideoConfig.proto" "$ROOT/tests/proto/AudioType.proto" \
  "$ROOT/tests/proto/AudioConfig.proto" "$ROOT/tests/proto/VideoFps.proto" \
  "$ROOT/tests/proto/VideoResolution.proto" "$ROOT/tests/proto/DiscoveryFixture.proto"
"$CXX" "-std=$protobuf_standard" "${strict[@]}" "${protobuf_cflags[@]}" \
  -I"$ROOT/patches" -I"$OUT" -c "$ROOT/tests/service_discovery_test.cpp" \
  -o "$OUT/service-discovery-test.o"
# Generated protobuf expands Abseil's Clang nullability extensions. Keep all
# warnings as errors there, but apply pedantic checks to our own source only.
for generated in "$OUT"/*.pb.cc; do
  "$CXX" "-std=$protobuf_standard" -Wall -Wextra -Werror -pthread \
    "${protobuf_cflags[@]}" -I"$OUT" -c "$generated" -o "${generated%.cc}.o"
done
"$CXX" "-std=$protobuf_standard" -pthread "$OUT"/*.o \
  "${protobuf_libs[@]}" -o "$OUT/service-discovery-test"
"$OUT/service-discovery-test" "$ROOT/tests/fixtures/dhu-discovery.hex"
