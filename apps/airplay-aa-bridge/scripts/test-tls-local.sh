#!/usr/bin/env bash
# Compile and exercise the actual patched AACS TLS transport in disposable Linux.
# No Pi, USB devices, deployed credentials, or .local files enter this test.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE=airplay-aa-aacs-tls-test

if [[ "${1:-}" == --help ]] && [[ $# -eq 1 ]]; then
  cat <<'HELP'
Usage: ./scripts/test-tls-local.sh

Requires a running Docker engine. Builds pinned AACS on Debian 13 using the
current production patches, then runs the real TLS/queue regression with
temporary test-only credentials. No Pi or USB access; not DHU certification.
HELP
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: ./scripts/test-tls-local.sh (or --help)" >&2
  exit 2
fi
if ! command -v docker >/dev/null; then
  echo "The production TLS regression requires a running Docker engine." >&2
  exit 1
fi

# Explicitly construct the build context instead of sending the project tree,
# which can contain real identities, private captures and deployment backups.
CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/airplay-aa-tls-context.XXXXXX")"
DOCKER_CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/airplay-aa-tls-docker.XXXXXX")"
trap 'rm -rf "$CONTEXT" "$DOCKER_CONFIG_DIR"' EXIT
# All images/sources are public. An isolated empty auth configuration avoids
# invoking desktop credential helpers (and their interactive prompts) during
# this unattended test. Keep the selected engine and explicit TLS environment.
if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
  DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
else
  DOCKER_ENDPOINT="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
fi
printf '{"auths":{}}\n' > "$DOCKER_CONFIG_DIR/config.json"
DOCKER=(env -u DOCKER_CONTEXT docker --config "$DOCKER_CONFIG_DIR" --host "$DOCKER_ENDPOINT")
mkdir -p "$CONTEXT/patches" "$CONTEXT/tests"
cp "$ROOT/tests/aacs-tls.Dockerfile" "$CONTEXT/tests/"
for header in AaCommunicator UsbEndpointState VideoChannelDescriptor ChannelHandler VideoChannelHandler InputChannelHandler ModeSwitcher AoaControl; do
  cp "$ROOT/patches/$header.h" "$CONTEXT/patches/"
done
for source in AaCommunicator ChannelHandler VideoChannelHandler InputChannelHandler ModeSwitcher descriptors; do
  cp "$ROOT/patches/$source.cpp" "$CONTEXT/patches/"
done
for proto in MediaStreamType MediaChannel VideoConfig MediaChannelSetupResponse VideoFocusIndication InputChannel InputBinding; do
  cp "$ROOT/patches/$proto.proto" "$CONTEXT/patches/"
done
cp "$ROOT/tests/aacs_tls_transport_test.cpp" "$ROOT/tests/aacs_tls_transport.cmake" "$CONTEXT/tests/"

# Ordinary scripts keep the same Dockerfile usable with either builder. They
# are generated inside the explicit temporary context, never from .local.
cat > "$CONTEXT/tests/prepare-aacs-tls.sh" <<'PREPARE'
#!/bin/sh
set -eu
for header in AaCommunicator UsbEndpointState VideoChannelDescriptor ChannelHandler VideoChannelHandler InputChannelHandler ModeSwitcher AoaControl; do
  cp "/project/patches/$header.h" /project/aacs/AAServer/include/
done
for source in AaCommunicator ChannelHandler VideoChannelHandler InputChannelHandler ModeSwitcher descriptors; do
  cp "/project/patches/$source.cpp" /project/aacs/AAServer/src/
done
for proto in MediaStreamType MediaChannel VideoConfig MediaChannelSetupResponse VideoFocusIndication InputChannel InputBinding; do
  cp "/project/patches/$proto.proto" /project/aacs/proto/
done
sed -i '/add_subdirectory(AAClient)/d; /add_subdirectory(GetEvents)/d' /project/aacs/CMakeLists.txt
sed -i '/MediaChannelSetupResponse.proto/a\    ../proto/VideoFocusIndication.proto' /project/aacs/proto/CMakeLists.txt
sed -i '/InputChannel.proto/a\    ../proto/InputBinding.proto' /project/aacs/proto/CMakeLists.txt
sed -i '/add_custom_command(TARGET AAServer POST_BUILD/,$d' /project/aacs/AAServer/CMakeLists.txt
printf '\ninclude(/project/tests/aacs_tls_transport.cmake)\n' >> /project/aacs/AAServer/CMakeLists.txt
PREPARE
cat > "$CONTEXT/tests/run-aacs-tls.sh" <<'TEST'
#!/bin/sh
set -eu
cmake -S /project/aacs -B /project/aacs/build -DCMAKE_BUILD_TYPE=Release
cmake --build /project/aacs/build --target aacs_tls_transport_test -j2
umask 077
fixture="$(mktemp -d /tmp/airplay-aa-tls-fixture.XXXXXX)"
chmod 700 "$fixture"
trap 'rm -rf "$fixture"' EXIT
cd "$fixture"
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -subj '/CN=LOCAL-TLS-TEST-ONLY/O=CarService' \
  -keyout android_auto.key -out android_auto.crt >/dev/null 2>&1
openssl genpkey -genparam -algorithm DH -pkeyopt group:ffdhe2048 \
  -out dhparam.pem >/dev/null 2>&1
timeout 20 /project/aacs/build/AAServer/aacs_tls_transport_test
TEST

"${DOCKER[@]}" build --file "$CONTEXT/tests/aacs-tls.Dockerfile" --tag "$IMAGE" "$CONTEXT"
"${DOCKER[@]}" run --rm --network none "$IMAGE"
