FROM debian:trixie-slim

# Keep dependency and upstream layers cached when only a patch/test changes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake pkg-config git ca-certificates openssl coreutils \
      libssl-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
      libboost-filesystem-dev libboost-program-options-dev libprotobuf-dev \
      protobuf-compiler libfmt-dev libpcap-dev libusbgx-dev libconfig-dev \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --quiet https://github.com/tomasz-grobelny/AACS.git /project/aacs \
    && git -C /project/aacs checkout --quiet faa1cf208feb5dfe1cb9535be16daeac4f08da0c \
    && git -C /project/aacs submodule update --init --depth 1 \
    && printf '%s\n' faa1cf208feb5dfe1cb9535be16daeac4f08da0c > /project/aacs/UPSTREAM_REVISION \
    && rm -rf /project/aacs/AAServer/ssl /project/aacs/.git

# The CLI supplies only these credential-free production overlays and TLS tests.
COPY patches/ /project/patches/
COPY tests/aacs_tls_transport_test.cpp tests/aacs_tls_transport.cmake /project/tests/
COPY tests/prepare-aacs-tls.sh tests/run-aacs-tls.sh /project/tests/
# Build and test at container runtime, so the CLI performs the regression even
# when every image layer was cached. Credentials exist only in a removed temp.
RUN sh /project/tests/prepare-aacs-tls.sh

WORKDIR /project
CMD ["sh", "/project/tests/run-aacs-tls.sh"]
