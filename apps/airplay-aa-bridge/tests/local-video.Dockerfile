FROM postgres:16-alpine

# Linux is required: macOS does not implement AF_UNIX SOCK_SEQPACKET.
RUN apk add --no-cache \
    python3 py3-gobject3 ffmpeg bash git procps-ng \
    gstreamer-tools gst-plugins-base gst-plugins-bad
WORKDIR /project
CMD ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"]
