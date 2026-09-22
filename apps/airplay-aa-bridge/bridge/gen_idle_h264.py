#!/usr/bin/env python3
"""Generate a short Annex-B baseline H.264 black IDR for idle AA video.

Tries gst-launch-1.0 at runtime; falls back to a tiny baked SPS/PPS/IDR if
GStreamer is unavailable (unit-test environments).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path


# Minimal 16x16 black IDR (baseline). Used only when gst-launch is missing.
# AA will scale oddly if used for real projection; production always regenerates.
_FALLBACK_AU = bytes.fromhex(
    "000000016742801e8d680a02dfff8000010005"
    "0000000168ce06e2"
    "0000000165b84d081ffffe4f0f800000"
)


def generate_black_h264(width: int, height: int, fps: int, out: Path) -> Path:
    gst = shutil.which("gst-launch-1.0")
    if not gst:
        out.write_bytes(_FALLBACK_AU)
        return out

    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "black.h264"
        cmd = [
            gst,
            "-q",
            "videotestsrc",
            "num-buffers=1",
            "pattern=black",
            "!",
            f"video/x-raw,format=I420,width={width},height={height},framerate={fps}/1",
            "!",
            "x264enc",
            "tune=zerolatency",
            "speed-preset=ultrafast",
            "key-int-max=1",
            "bframes=0",
            "byte-stream=true",
            "!",
            "video/x-h264,stream-format=byte-stream,alignment=au,profile=baseline",
            "!",
            "h264parse",
            "config-interval=-1",
            "!",
            "filesink",
            f"location={raw}",
        ]
        subprocess.run(cmd, check=True)
        data = raw.read_bytes()
        if not data:
            raise RuntimeError("gst-launch produced empty H.264")
        out.write_bytes(data)
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--width", type=int, default=800)
    p.add_argument("--height", type=int, default=480)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("-o", "--output", type=Path, required=True)
    args = p.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    generate_black_h264(args.width, args.height, args.fps, args.output)
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
