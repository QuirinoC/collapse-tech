#!/usr/bin/env bash
# Build third-party deps on the Raspberry Pi (UxPlay + patched AAServer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${AIRPLAY_AA_PREFIX:-/opt/airplay-aa}"
SRC="${ROOT}/third_party"
JOBS="$(nproc)"

mkdir -p "$SRC" "$PREFIX"/{bin,libexec/aaserver,share}

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
(
  cd "$SRC/UxPlay"
  mkdir -p build && cd build
  cmake .. -DCMAKE_INSTALL_PREFIX="$PREFIX"
  make -j"$JOBS"
  run_root make install
)

echo "==> AACS AAServer (phone-side Android Auto over USB)"
if [[ ! -d "$SRC/AACS" ]]; then
  git clone --recurse-submodules --depth 1 https://github.com/tomasz-grobelny/AACS.git "$SRC/AACS"
fi
# Apply AirPlay-AA video handler (no Snowmix; socket H.264 inject).
cp "$ROOT/patches/VideoChannelHandler.cpp" \
  "$SRC/AACS/AAServer/src/VideoChannelHandler.cpp"
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
  run_root install -d "$PREFIX/libexec/aaserver"
  run_root install -m 755 AAServer/AAServer "$PREFIX/libexec/aaserver/AAServer"
  run_root install -m 644 AAServer/android_auto.crt "$PREFIX/libexec/aaserver/"
  run_root install -m 644 AAServer/android_auto.key "$PREFIX/libexec/aaserver/"
  if [[ -f AAServer/dhparam.pem ]]; then
    run_root install -m 644 AAServer/dhparam.pem "$PREFIX/libexec/aaserver/"
  else
    openssl dhparam -out /tmp/dhparam.pem 2048
    run_root install -m 644 /tmp/dhparam.pem "$PREFIX/libexec/aaserver/"
  fi
)

echo "Build complete → $PREFIX"
