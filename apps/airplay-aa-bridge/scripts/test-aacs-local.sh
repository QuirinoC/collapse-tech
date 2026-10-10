#!/usr/bin/env bash
# Test actual USB startup/AOA/video/input handlers and production discovery schemas.
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
boost_cflags=()
if command -v brew >/dev/null && [[ -f "$(brew --prefix)/include/boost/signals2.hpp" ]]; then
  boost_cflags=(-isystem "$(brew --prefix)/include")
fi
if ! printf '#include <boost/signals2.hpp>\n' | \
  "$CXX" -std=c++14 "${boost_cflags[@]}" -x c++ -fsyntax-only -; then
  echo "AACS handler tests require the Boost headers (libboost-dev or brew boost)" >&2
  exit 1
fi

"$CXX" -std=c++14 "${strict[@]}" -I"$ROOT/patches" \
  "$ROOT/tests/usb_endpoint_startup_test.cpp" -o "$OUT/usb-startup-test"
"$OUT/usb-startup-test"

# Compile the production initial USB control dispatcher and descriptor builder.
# Scripted ep0 completions plus a real blocking pipe cover switch authorization
# and transfer deadlines; these tests never enumerate or modify a USB gadget.
"$CXX" -std=c++14 "${strict[@]}" -I"$ROOT/patches" \
  "$ROOT/tests/aoa_control_test.cpp" -o "$OUT/aoa-control-test"
"$OUT/aoa-control-test"
"$CXX" -std=c++14 "${strict[@]}" -I"$ROOT/tests/support/aoa" \
  -I"$ROOT/patches" "$ROOT/tests/mode_switcher_test.cpp" -o "$OUT/mode-switcher-test"
"$OUT/mode-switcher-test"

# Parse the actual accessory descriptor writer's bytes after a real pipe. Use
# the platform's Linux UAPI when available; non-Linux hosts get ABI-only stubs.
# C++20 accepts upstream's designated initializers under the strict test flags.
descriptor_cflags=(-I"$ROOT/tests/support/descriptors")
if [[ "$(uname -s)" != Linux ]]; then
  descriptor_cflags+=(-I"$ROOT/tests/support/descriptors/nonlinux")
fi
"$CXX" -std=c++20 "${strict[@]}" "${descriptor_cflags[@]}" \
  "$ROOT/tests/accessory_descriptors_test.cpp" -o "$OUT/accessory-descriptors-test"
"$OUT/accessory-descriptors-test"

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
  "$ROOT/patches/MediaChannelSetupResponse.proto" \
  "$ROOT/patches/InputBinding.proto" "$ROOT/patches/InputChannel.proto" \
  "$ROOT/tests/proto/TouchConfig.proto" \
  "$ROOT/patches/VideoFocusIndication.proto" "$ROOT/tests/proto/ChannelOpenRequest.proto" \
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
"$CXX" "-std=$protobuf_standard" -pthread "$OUT/service-discovery-test.o" "$OUT"/*.pb.o \
  "${protobuf_libs[@]}" -o "$OUT/service-discovery-test"
"$OUT/service-discovery-test" "$ROOT/tests/fixtures/dhu-discovery.hex"

# Compile the real handlers. Narrow local stubs abort if optional SHM is used;
# no GStreamer install, AACS checkout, USB device, or hardware mocks are needed.
for source in "$ROOT/patches/VideoChannelHandler.cpp" "$ROOT/patches/ChannelHandler.cpp" \
    "$ROOT/tests/video_focus_handler_test.cpp"; do
  "$CXX" "-std=$protobuf_standard" "${strict[@]}" -Wno-unused-parameter \
    "${protobuf_cflags[@]}" "${boost_cflags[@]}" \
    -I"$ROOT/tests/support/aacs" -I"$ROOT/patches" -I"$OUT" \
    -c "$source" -o "$OUT/$(basename "${source%.cpp}").o"
done
"$CXX" "-std=$protobuf_standard" -pthread "$OUT/VideoChannelHandler.o" \
  "$OUT/ChannelHandler.o" "$OUT/video_focus_handler_test.o" "$OUT"/*.pb.o \
  "${protobuf_libs[@]}" -o "$OUT/video-focus-handler-test"
"$OUT/video-focus-handler-test"

# Input startup uses the same actual base class and generated production protos.
for source in "$ROOT/patches/InputChannelHandler.cpp" "$ROOT/tests/input_handler_test.cpp"; do
  "$CXX" "-std=$protobuf_standard" "${strict[@]}" -Wno-unused-parameter \
    "${protobuf_cflags[@]}" "${boost_cflags[@]}" \
    -I"$ROOT/tests/support/aacs" -I"$ROOT/patches" -I"$OUT" \
    -c "$source" -o "$OUT/$(basename "${source%.cpp}").o"
done
"$CXX" "-std=$protobuf_standard" -pthread "$OUT/InputChannelHandler.o" \
  "$OUT/ChannelHandler.o" "$OUT/input_handler_test.o" "$OUT"/*.pb.o \
  "${protobuf_libs[@]}" -o "$OUT/input-handler-test"
"$OUT/input-handler-test"
