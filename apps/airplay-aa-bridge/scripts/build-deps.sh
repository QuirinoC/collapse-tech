#!/usr/bin/env bash
# Build third-party deps on the Raspberry Pi (UxPlay + patched AAServer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${AIRPLAY_AA_PREFIX:-/opt/airplay-aa}"
SRC="${ROOT}/third_party"
JOBS="$(nproc)"
CERT_SRC="${AIRPLAY_AA_CERT_DIR:-$ROOT/certs}"

# AAServer is the PHONE side. DHU's long-lived HEADUNIT certificate is not
# accepted as a phone identity, even though its expiry is in the future.
"$ROOT/scripts/check-phone-certs.sh" "$CERT_SRC"
CERT_SRC="$(cd "$CERT_SRC" && pwd)"

mkdir -p "$SRC"

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "==> Installing build packages"
run_root apt-get update
run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential cmake pkg-config git autoconf automake libtool \
  libssl-dev libplist-dev libavahi-compat-libdnssd-dev \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav gstreamer1.0-tools \
  libboost-all-dev libprotobuf-dev protobuf-compiler libfmt-dev \
  libpcap-dev libconfig-dev libusb-1.0-0-dev \
  python3 python3-gi

echo "==> libusbgx (USB gadget helpers for AAServer)"
if [[ ! -d "$SRC/libusbgx" ]]; then
  git clone --depth 1 https://github.com/libusbgx/libusbgx.git "$SRC/libusbgx"
fi
(
  cd "$SRC/libusbgx"
  autoreconf -i
  ./configure --prefix="$PREFIX"
  make -j"$JOBS"
  run_root make install
  run_root ldconfig
)

echo "==> UxPlay (AirPlay2 receiver)"
if [[ ! -d "$SRC/UxPlay" ]]; then
  git clone --depth 1 https://github.com/FDH2/UxPlay.git "$SRC/UxPlay"
fi
# YouTube HLS: keep the reverse (PTTH) socket when the phone answers FCUP
# with HTTP/1.1. Otherwise the next playlist fetch dies with send error 88.
if ! grep -q ptth_established "$SRC/UxPlay/lib/httpd.c"; then
  patch -p0 -d "$SRC/UxPlay" < "$ROOT/patches/uxplay-ptth-keep.patch"
fi
# Preserve the deployed mirror/HLS headless sink bins for the shared-memory
# encoder. Stock UxPlay -vs accepts an element name, not a complete pipeline.
if ! grep -q AIRPLAY_AA_VIDEO_SINK_BIN "$SRC/UxPlay/renderers/video_renderer.c"; then
  patch -p1 -d "$SRC/UxPlay" < "$ROOT/patches/uxplay-headless-sinks.patch"
fi
(
  cd "$SRC/UxPlay"
  mkdir -p build && cd build
  cmake .. -DCMAKE_INSTALL_PREFIX="$PREFIX"
  make -j"$JOBS"
  # Stage CMake's install output, then replace runtime files durably instead of
  # allowing an interrupted in-place install to truncate the live executable.
  uxplay_stage="$(mktemp -d)"
  trap 'rm -rf "$uxplay_stage"' EXIT
  DESTDIR="$uxplay_stage" make install
  run_root python3 "$ROOT/scripts/atomic_install.py" "$uxplay_stage$PREFIX" "$PREFIX" --tree --owner 0 --group 0
)

echo "==> AACS AAServer (phone-side Android Auto over USB)"
if [[ ! -d "$SRC/AACS" ]]; then
  git clone --recurse-submodules --depth 1 https://github.com/tomasz-grobelny/AACS.git "$SRC/AACS"
fi
# Preserve bounded channel-open/setup waits from the deployed video handler.
cp "$ROOT/patches/AaCommunicator.h" "$ROOT/patches/UsbEndpointState.h" \
  "$ROOT/patches/VideoChannelDescriptor.h" \
  "$SRC/AACS/AAServer/include/"
cp "$ROOT/patches/AaCommunicator.cpp" \
  "$SRC/AACS/AAServer/src/AaCommunicator.cpp"
cp "$ROOT/patches/ChannelHandler.h" \
  "$SRC/AACS/AAServer/include/ChannelHandler.h"
cp "$ROOT/patches/ChannelHandler.cpp" \
  "$SRC/AACS/AAServer/src/ChannelHandler.cpp"
cp "$ROOT/patches/VideoChannelHandler.h" \
  "$SRC/AACS/AAServer/include/VideoChannelHandler.h"
# Apply AirPlay-AA video handler (no Snowmix; socket H.264 inject).
cp "$ROOT/patches/VideoChannelHandler.cpp" \
  "$SRC/AACS/AAServer/src/VideoChannelHandler.cpp"
# Current DHU omits the optional codec on its video media descriptor.
for proto in MediaStreamType MediaChannel VideoConfig MediaChannelSetupResponse VideoFocusIndication; do
  cp "$ROOT/patches/$proto.proto" "$SRC/AACS/proto/$proto.proto"
done
# AACS enumerates generated schemas explicitly rather than globbing proto files.
if ! grep -q '^[[:space:]]*../proto/VideoFocusIndication.proto' "$SRC/AACS/proto/CMakeLists.txt"; then
  sed -i '/^[[:space:]]*\.\.\/proto\/MediaChannelSetupResponse.proto/a\    ../proto/VideoFocusIndication.proto' \
    "$SRC/AACS/proto/CMakeLists.txt"
fi
grep -q '^[[:space:]]*../proto/VideoFocusIndication.proto' "$SRC/AACS/proto/CMakeLists.txt" || {
  echo "Cannot register VideoFocusIndication.proto in AACS proto/CMakeLists.txt" >&2
  exit 1
}
# CD-ROM mass-storage LUN must be ro=1 on modern kernels (else Invalid parameter).
cp "$ROOT/patches/MassStorageFunction.cpp" \
  "$SRC/AACS/AAServer/src/MassStorageFunction.cpp"

# Newer libstdc++ no longer transitively pulls <set>; AACS upstream misses it.
cp "$ROOT/patches/InputChannelHandler.h" \
  "$SRC/AACS/AAServer/include/InputChannelHandler.h"

# AAClient/GetEvents pull X11/XTest; we only need AAServer for the USB path.
# Comment them out so cmake configure succeeds without libxtst-dev.
sed -i \
  -e 's/^[[:space:]]*add_subdirectory(AAClient)/# add_subdirectory(AAClient)/' \
  -e 's/^[[:space:]]*add_subdirectory(GetEvents)/# add_subdirectory(GetEvents)/' \
  "$SRC/AACS/CMakeLists.txt"

# pkg-config for prefix-installed libusbgx
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
export LD_LIBRARY_PATH="$PREFIX/lib:${LD_LIBRARY_PATH:-}"

(
  cd "$SRC/AACS"
  # Fresh configure after CMakeLists edit (stale cache may still require XTest).
  rm -rf build
  mkdir -p build && cd build
  cmake .. -DCMAKE_PREFIX_PATH="$PREFIX"
  # Only need AAServer for the phone-side USB path.
  cmake --build . --target AAServer -j"$JOBS"
  run_root python3 "$ROOT/scripts/atomic_install.py" AAServer/AAServer "$PREFIX/libexec/aaserver/AAServer" --mode 755 --owner 0 --group 0
  run_root python3 "$ROOT/scripts/atomic_install.py" "$CERT_SRC/android_auto.crt" "$PREFIX/libexec/aaserver/android_auto.crt" --mode 644 --owner 0 --group 0
  run_root python3 "$ROOT/scripts/atomic_install.py" "$CERT_SRC/android_auto.key" "$PREFIX/libexec/aaserver/android_auto.key" --mode 600 --owner 0 --group 0
  if [[ -d ../AAServer/ssl ]]; then
    run_root python3 "$ROOT/scripts/atomic_install.py" "$CERT_SRC/android_auto.crt" ../AAServer/ssl/android_auto.crt --mode 644 --owner 0 --group 0
    run_root python3 "$ROOT/scripts/atomic_install.py" "$CERT_SRC/android_auto.key" ../AAServer/ssl/android_auto.key --mode 600 --owner 0 --group 0
  fi
  if [[ -f AAServer/dhparam.pem ]]; then
    run_root python3 "$ROOT/scripts/atomic_install.py" AAServer/dhparam.pem "$PREFIX/libexec/aaserver/dhparam.pem" --mode 644 --owner 0 --group 0
  else
    openssl dhparam -out /tmp/dhparam.pem 2048
    run_root python3 "$ROOT/scripts/atomic_install.py" /tmp/dhparam.pem "$PREFIX/libexec/aaserver/dhparam.pem" --mode 644 --owner 0 --group 0
  fi
)

echo "Build complete → $PREFIX"
