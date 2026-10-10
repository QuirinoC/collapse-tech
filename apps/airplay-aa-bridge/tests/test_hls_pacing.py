"""Measure real GStreamer pacing with the production HLS and mirror sink bins."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
GSTREAMER_AVAILABLE = bool(shutil.which("gst-launch-1.0") and shutil.which("bash"))
if os.environ.get("AIRPLAY_AA_REQUIRE_VIDEO_TESTS") == "1" and not GSTREAMER_AVAILABLE:
    raise RuntimeError("Required HLS pacing test needs GStreamer and bash")


def measure_sink_pacing():
    """Run only sink definitions and finite standalone pipelines; no services."""
    lines = (ROOT / "scripts" / "run-airplay-pipeline.sh").read_text().splitlines()
    start = next(index for index, line in enumerate(lines) if line.startswith("SHM_SIZE="))
    end = next(index for index, line in enumerate(lines[start:], start) if line.startswith("VSINK="))
    definitions = "\n".join(lines[start:end + 1])
    with tempfile.TemporaryDirectory(prefix="airplay-aa-pacing-") as directory:
        environment = {**os.environ, "AIRPLAY_AA_WIDTH": "800", "AIRPLAY_AA_HEIGHT": "480",
                       "AIRPLAY_AA_FPS": "30", "SHM_SOCKET": str(Path(directory) / "video.shm")}
        definitions += '\nprintf "%s\\n%s\\n" "$AIRPLAY_AA_HLS_SINK" "$AIRPLAY_AA_VIDEO_SINK_BIN"\n'
        result = subprocess.run(["bash", "-c", definitions], env=environment,
                                capture_output=True, text=True, check=True, timeout=3)
        hls_sink, mirror_sink = result.stdout.splitlines()
        measurements = {}
        for name, sink in (("hls", hls_sink), ("mirror", mirror_sink)):
            command = ["gst-launch-1.0", "-q", "videotestsrc", "num-buffers=60", "is-live=false",
                       "!", "video/x-raw,format=I420,width=800,height=480,framerate=30/1", "!",
                       *shlex.split(sink)]
            started = time.monotonic()
            result = subprocess.run(command, capture_output=True, text=True, timeout=8)
            if result.returncode:
                raise RuntimeError(f"{name} sink failed ({result.returncode}): {result.stderr}")
            measurements[name] = time.monotonic() - started
        measurements.update(frames=60, fps=30, expected_video_seconds=2.0)
        return measurements


@unittest.skipUnless(GSTREAMER_AVAILABLE, "GStreamer and bash are required for the real sink pacing test")
class SinkPacingTests(unittest.TestCase):
    def test_hls_uses_playback_clock_while_mirror_can_finish_immediately(self):
        measurements = measure_sink_pacing()
        print("Finite production-sink pacing:", measurements)
        self.assertGreaterEqual(measurements["hls"], 1.8, measurements)
        self.assertLess(measurements["hls"], 4.0, measurements)
        self.assertLess(measurements["mirror"], 1.2, measurements)
        self.assertGreater(measurements["hls"] - measurements["mirror"], 1.2, measurements)


if __name__ == "__main__":
    unittest.main()
