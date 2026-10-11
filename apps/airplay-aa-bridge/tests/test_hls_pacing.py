"""Measure real production-sink rendering, independently of SHM teardown."""
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SHM_DIRECTORY = Path("/dev/shm")
GSTREAMER_AVAILABLE = bool(
    shutil.which("gst-launch-1.0") and shutil.which("bash")
    and importlib.util.find_spec("gi") and sys.platform.startswith("linux")
    and SHM_DIRECTORY.is_dir()
)
if os.environ.get("AIRPLAY_AA_REQUIRE_VIDEO_TESTS") == "1" and not GSTREAMER_AVAILABLE:
    raise RuntimeError("Required HLS pacing test needs Linux GStreamer, PyGObject and bash")


def _cleanup_owned_shm(pid, baseline):
    """Unlink only new regular POSIX SHM objects from the already-reaped child.

    Upstream shmpipe uses space-padded /shmpipe.%5d.%5d names. An abrupt exit
    releases mappings but leaves these names; never sweep another process's SHM.
    """
    removed = []
    for path in SHM_DIRECTORY.iterdir():
        match = re.fullmatch(r"shmpipe\. *([0-9]+)\. *([0-9]+)", path.name)
        if not match or int(match[1]) != pid or path.name in baseline:
            continue
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid():
            raise RuntimeError(f"Refusing to remove unowned or nonregular SHM object: {path}")
        path.unlink()
        removed.append(path.name)
    return removed


def measure_pipeline(pipeline, expected_frames=60):
    """Require real EOS/render counts and a clean child result; always reap it."""
    baseline = {path.name for path in SHM_DIRECTORY.iterdir()}
    process = subprocess.Popen(
        [sys.executable, str(ROOT / "tests" / "gst_sink_pacing.py"),
         pipeline, str(expected_frames)], stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True,
    )
    try:
        try:
            stdout, stderr = process.communicate(timeout=9)
        except subprocess.TimeoutExpired as error:
            process.kill()
            stdout, stderr = process.communicate(timeout=2)
            raise RuntimeError(f"Sink pacing child timed out: {stderr}") from error
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=2)
        removed = _cleanup_owned_shm(process.pid, baseline)
    if process.returncode:
        raise RuntimeError(f"Sink pacing child failed ({process.returncode}): {stdout}\n{stderr}")
    records = [line.removeprefix("AIRPLAY_AA_PACING=") for line in stdout.splitlines()
               if line.startswith("AIRPLAY_AA_PACING=")]
    if len(records) != 1:
        raise RuntimeError(f"Sink pacing child returned no unique measurement: {stdout}\n{stderr}")
    measurement = json.loads(records[0])
    if (measurement.get("complete") != "EOS"
            or measurement.get("source_frames") != expected_frames
            or measurement.get("sink_frames", 0) < expected_frames
            or measurement.get("rendered") != measurement.get("sink_frames")
            or measurement.get("dropped") != 0):
        raise RuntimeError(f"Sink pacing child returned incomplete rendering: {measurement}")
    measurement["cleaned_shm_segments"] = len(removed)
    return measurement


def production_sinks(directory):
    """Read only the actual production definitions, without starting services."""
    lines = (ROOT / "scripts" / "run-airplay-pipeline.sh").read_text().splitlines()
    start = next(index for index, line in enumerate(lines) if line.startswith("SHM_SIZE="))
    end = next(index for index, line in enumerate(lines[start:], start) if line.startswith("VSINK="))
    definitions = "\n".join(lines[start:end + 1])
    environment = {**os.environ, "AIRPLAY_AA_WIDTH": "800", "AIRPLAY_AA_HEIGHT": "480",
                   "AIRPLAY_AA_FPS": "30", "SHM_SOCKET": str(Path(directory) / "video.shm")}
    definitions += '\nprintf "%s\\n%s\\n" "$AIRPLAY_AA_HLS_SINK" "$AIRPLAY_AA_VIDEO_SINK_BIN"\n'
    result = subprocess.run(["bash", "-c", definitions], env=environment,
                            capture_output=True, text=True, check=True, timeout=3)
    return result.stdout.splitlines()


def source_pipeline(sink, frames=60, extra=""):
    return (f"videotestsrc name=pacing_source num-buffers={frames} is-live=false ! "
            "video/x-raw,format=I420,width=800,height=480,framerate=30/1 ! "
            f"{extra}{sink} name=pacing_sink")


def measure_sink_pacing():
    """Measure PLAYING to EOS, excluding the known upstream NULL-stop race.

    This checks clocked rendering, not graceful SHM shutdown. The helper exits
    its owned process at EOS without setting NULL; the parent reaps it and
    removes only its new SHM objects. Every observed streaming ERROR fails.
    Source and sink counts are independent: videorate may close EOS by repeating
    its last frame, so this does not assert one-to-one frame conversion.
    """
    with tempfile.TemporaryDirectory(prefix="airplay-aa-pacing-") as directory:
        hls_sink, mirror_sink = production_sinks(directory)
        measurements = {}
        for name, sink in (("hls", hls_sink), ("mirror", mirror_sink)):
            record = measure_pipeline(source_pipeline(sink))
            measurements[name] = record["elapsed_seconds"]
            measurements[f"{name}_rendering"] = record
        measurements.update(frames=60, fps=30, expected_video_seconds=2.0,
                            scope="clocked rendering through EOS; excludes NULL teardown")
        return measurements


@unittest.skipUnless(GSTREAMER_AVAILABLE, "Linux GStreamer, PyGObject and bash are required")
class SinkPacingTests(unittest.TestCase):
    def test_hls_uses_playback_clock_while_mirror_can_finish_immediately(self):
        measurements = measure_sink_pacing()
        print("Finite production-sink pacing:", measurements)
        self.assertGreaterEqual(measurements["hls"], 1.8, measurements)
        self.assertLess(measurements["hls"], 4.0, measurements)
        self.assertLess(measurements["mirror"], 1.2, measurements)
        self.assertGreater(measurements["hls"] - measurements["mirror"], 1.2, measurements)

    def test_streaming_error_before_eos_fails_and_cleans_owned_shm(self):
        with tempfile.TemporaryDirectory(prefix="airplay-aa-pacing-error-") as directory:
            _, mirror_sink = production_sinks(directory)
            before = {path.name for path in SHM_DIRECTORY.iterdir()}
            with self.assertRaisesRegex(RuntimeError, "GStreamer ERROR"):
                measure_pipeline(source_pipeline(mirror_sink, extra="identity error-after=5 ! "))
            self.assertEqual({path.name for path in SHM_DIRECTORY.iterdir()}, before)

    def test_eos_with_fewer_source_frames_fails(self):
        with tempfile.TemporaryDirectory(prefix="airplay-aa-pacing-short-") as directory:
            _, mirror_sink = production_sinks(directory)
            with self.assertRaisesRegex(RuntimeError, "Source emitted 59 of 60"):
                measure_pipeline(source_pipeline(mirror_sink, frames=59))


if __name__ == "__main__":
    unittest.main()
