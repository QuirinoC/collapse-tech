FROM debian:trixie-slim

# Match the deployed Debian 13 / GStreamer 1.26 environment. This image has no
# application source or identities; CI mounts its checkout read-only at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-gi gir1.2-gstreamer-1.0 openssl ffmpeg bash git gstreamer1.0-tools \
      gstreamer1.0-plugins-base gstreamer1.0-plugins-bad \
    && rm -rf /var/lib/apt/lists/*

ENV AIRPLAY_AA_REQUIRE_VIDEO_TESTS=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/tmp/cache
WORKDIR /project
CMD ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"]
