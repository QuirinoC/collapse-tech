"""Acceptance policy with log fixtures and real PTY child processes; no hardware claim."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bench_dhu", ROOT / "bridge" / "bench_dhu.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)

# These are the current production markers, including the DHU's valid initial
# unrequested grant followed by its requested response. Setup/grant markers do
# not themselves contain a channel; their preceding opener provides context.
SERVER = """auth complete
InputChannelHandler: channel 3 ChannelOpenResponse parsed=1 status=0 accepted=1
InputChannelHandler: channel 3 InputBindingResponse parsed=1 status=0 accepted=1
VideoChannelHandler: openChannel channel 2 (waiting up to 5s for ChannelOpenResponse, then SetupResponse)
VideoChannelHandler: setup status=2 max_unacked=2 config0=1 accepted=1
VideoChannelHandler: requesting PROJECTED focus on channel 2
VideoChannelHandler: VideoFocusIndication mode=1 unrequested=1
VideoChannelHandler: StartIndication on channel 2
VideoChannelHandler: VideoFocusIndication mode=1 unrequested=0
"""
INJECTOR = """2026-10-10 12:15:00 INFO airplay-aa-inject: automatically binding input channel id=3
2026-10-10 12:15:00 INFO airplay-aa-inject: input binding accepted on channel 3
"""


class AutomaticStartupEvidenceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.server = self.directory / "aaserver.log"
        self.injector = self.directory / "inject.log"
        self.server.write_text("unrelated prior log line\n")
        self.injector.write_text("unrelated prior injector line\n")
        self.before = self.snapshot()
        self.session = {"console_video_focus_override": False,
                        "console_commands": [{"command": "screenshot frame-1.png"}, {"command": "quit"}]}

    def snapshot(self):
        code = bench.SSH_STARTUP_READ_ONLY.split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
        code = code.replace("Path('/var/log/airplay-aa/' + name + '.log')",
                            f"Path({str(self.directory)!r}) / (name + '.log')")
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                                check=True, timeout=3)
        return {"collected": True, "log": "fixture-snapshot.json", "startup": json.loads(result.stdout)}

    def evaluate(self, server=SERVER, injector=INJECTOR, session=None):
        with self.server.open("a") as stream:
            stream.write(server)
        with self.injector.open("a") as stream:
            stream.write(injector)
        return bench.evaluate_auto_start(self.before, self.snapshot(), self.session if session is None else session)

    def test_actual_markers_and_valid_unrequested_grant(self):
        result = self.evaluate()
        self.assertEqual(result["input"]["status"], "PASSED")
        self.assertEqual(result["automatic_focus"]["status"], "PASSED")
        self.assertEqual(result["input"]["channel"], 3)
        self.assertEqual(result["automatic_focus"]["channel"], 2)
        self.assertEqual(result["automatic_focus"]["records"][3]["unrequested"], 1)
        self.assertTrue(result["automatic_focus"]["records"][1]["channel_from_open"])

    def test_projected_no_input_mode_is_a_valid_grant(self):
        result = self.evaluate(SERVER.replace("mode=1 unrequested=1", "mode=4 unrequested=0"))
        self.assertEqual(result["automatic_focus"]["status"], "PASSED")

    def test_native_focus_between_projected_grant_and_start_fails(self):
        server = SERVER.replace("VideoChannelHandler: StartIndication on channel 2",
                                "VideoChannelHandler: VideoFocusIndication mode=2 unrequested=1\nVideoChannelHandler: StartIndication on channel 2")
        self.assertEqual(self.evaluate(server)["automatic_focus"]["status"], "FAILED")

    def test_old_success_markers_never_pass(self):
        self.server.write_text(SERVER)
        self.injector.write_text(INJECTOR)
        before = self.snapshot()
        result = bench.evaluate_auto_start(before, self.snapshot(), self.session)
        self.assertTrue(all(stage["status"] == "FAILED" for stage in result.values()))

    def test_missing_or_rejected_input_does_not_infer_success_from_video(self):
        for replacement in ("", "InputChannelHandler: channel 3 InputBindingResponse parsed=1 status=1 accepted=0",
                            "InputChannelHandler: channel 3 InputBindingResponse parsed=0 status=-1 accepted=0",
                            "InputChannelHandler: channel 3 InputBindingResponse parsed=1 status=0 accepted=0"):
            with self.subTest(replacement=replacement):
                self.server.write_text("old\n")
                self.injector.write_text("old\n")
                self.before = self.snapshot()
                result = self.evaluate(SERVER.replace("InputChannelHandler: channel 3 InputBindingResponse parsed=1 status=0 accepted=1", replacement))
                self.assertEqual(result["input"]["status"], "FAILED")
                self.assertEqual(result["automatic_focus"]["status"], "PASSED")

    def test_input_injector_acceptance_and_matching_channel_are_required(self):
        for injector in (INJECTOR.splitlines()[0] + "\n", INJECTOR.replace("accepted on channel 3", "accepted on channel 4")):
            with self.subTest(injector=injector):
                self.server.write_text("old\n")
                self.injector.write_text("old\n")
                self.before = self.snapshot()
                self.assertEqual(self.evaluate(injector=injector)["input"]["status"], "FAILED")

    def test_timeout_marker_does_not_count_as_binding_success(self):
        result = self.evaluate(injector=INJECTOR + "input binding did not complete within 4.5s; continuing video\n")
        self.assertEqual(result["input"]["status"], "FAILED")

    def test_input_binding_after_video_is_not_input_first_startup(self):
        lines = SERVER.splitlines()
        reordered = "\n".join([lines[0], *lines[3:], *lines[1:3]]) + "\n"
        self.assertEqual(self.evaluate(reordered)["input"]["status"], "FAILED")

    def test_missing_focus_or_start_and_wrong_order_fail(self):
        variations = [SERVER.replace(line + "\n", "") for line in SERVER.splitlines()
                      if "requesting PROJECTED" in line or "StartIndication" in line]
        variations.append(SERVER.replace("VideoChannelHandler: VideoFocusIndication mode=1 unrequested=1\n", ""))
        variations.append(SERVER.replace("VideoChannelHandler: StartIndication on channel 2\n", "").replace(
            "VideoChannelHandler: requesting PROJECTED", "VideoChannelHandler: StartIndication on channel 2\nVideoChannelHandler: requesting PROJECTED"))
        for server in variations:
            with self.subTest(server=server):
                self.server.write_text("old\n")
                self.injector.write_text("old\n")
                self.before = self.snapshot()
                self.assertEqual(self.evaluate(server)["automatic_focus"]["status"], "FAILED")

    def test_rejected_setup_native_focus_and_wrong_channel_fail(self):
        for server in (SERVER.replace("status=2 max_unacked=2 config0=1 accepted=1", "status=1 max_unacked=2 config0=1 accepted=0"),
                       SERVER.replace("mode=1 unrequested=1", "mode=2 unrequested=1"),
                       SERVER.replace("StartIndication on channel 2", "StartIndication on channel 4"),
                       SERVER.replace("requesting PROJECTED focus on channel 2", "requesting PROJECTED focus on channel 4")):
            with self.subTest(server=server):
                self.server.write_text("old\n")
                self.injector.write_text("old\n")
                self.before = self.snapshot()
                self.assertEqual(self.evaluate(server)["automatic_focus"]["status"], "FAILED")

    def test_channel_less_markers_without_unambiguous_opener_fail(self):
        for server in ("\n".join(line for line in SERVER.splitlines() if "openChannel channel" not in line) + "\n",
                       SERVER + "VideoChannelHandler: openChannel channel 4\n"):
            with self.subTest(server=server):
                self.server.write_text("old\n")
                self.injector.write_text("old\n")
                self.before = self.snapshot()
                self.assertEqual(self.evaluate(server)["automatic_focus"]["status"], "FAILED")

    def test_separate_aa_sessions_cannot_supply_each_others_initialization(self):
        server = SERVER.replace("VideoChannelHandler: openChannel", "auth complete\nVideoChannelHandler: openChannel")
        result = self.evaluate(server)
        self.assertEqual(result["input"]["status"], "FAILED")

    def test_prior_session_injector_records_cannot_validate_second_session_binding(self):
        result = self.evaluate(SERVER + SERVER)
        self.assertTrue(all(stage["status"] == "FAILED" for stage in result.values()))

    def test_rotation_truncation_and_missing_collection_fail(self):
        self.evaluate()
        after = self.snapshot()
        for changed in (None, {"collected": False}):
            self.assertTrue(all(stage["status"] == "FAILED" for stage in bench.evaluate_auto_start(self.before, changed, self.session).values()))
        for name in ("aaserver", "inject"):
            for field, value in (("inode", -1), ("inode", self.before["startup"]["logs"][name]["inode"] + 1), ("size", 0)):
                changed = copy.deepcopy(after)
                changed["startup"]["logs"][name][field] = value
                result = bench.evaluate_auto_start(self.before, changed, self.session)
                self.assertTrue(all(stage["status"] == "FAILED" for stage in result.values()))

    def test_any_console_focus_override_invalidates_proof(self):
        self.evaluate()
        after = self.snapshot()
        for session in ({}, {"console_video_focus_override": True, "console_commands": []},
                        {"console_video_focus_override": False, "console_commands": [{"command": "focus video on"}]},
                        {"console_video_focus_override": False, "console_commands": [{"command": "quit\nFOCUS video on"}]}):
            result = bench.evaluate_auto_start(self.before, after, session)
            self.assertTrue(all(stage["status"] == "FAILED" for stage in result.values()))

    def test_collector_bounds_and_filters_private_content(self):
        self.server.write_text("device_serial=never-collect-device-id hls=https://private.invalid/token\n" * 15000 + SERVER)
        self.injector.write_text("private_key=never-collect-private-key\n" + INJECTOR)
        snapshot = self.snapshot()
        serialized = json.dumps(snapshot)
        self.assertNotIn("never-collect", serialized)
        self.assertNotIn("private.invalid", serialized)
        for log in snapshot["startup"]["logs"].values():
            self.assertLessEqual(log["tail_bytes_read"], 262144)
            self.assertLessEqual(len(log["records"]), 128)
        self.assertLess(len(serialized), 15000)

    def test_combined_source_and_startup_collection_is_one_python_command(self):
        command = bench.structured_collection_command(airplay=True, startup=True)
        self.assertEqual(command.count("python3 - <<'PY'"), 1)
        code = command.split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
        code = code.replace("Path('/var/log/airplay-aa/' + name + '.log')",
                            f"Path({str(self.directory)!r}) / (name + '.log')")
        config = self.directory / "bridge.env"
        config.write_text("AIRPLAY_AA_SOURCE=airplay\nPASSWORD=never-collect-password\n")
        uxplay = self.directory / "uxplay.log"
        uxplay.write_text("raop_rtp video: now = 1000.0, ntp = 0, ts = 2000.0, 00 h264, size: 60\n")
        code = code.replace("Path('/etc/airplay-aa/bridge.env')", f"Path({str(config)!r})")
        code = code.replace("Path('/var/log/airplay-aa/uxplay.log')", f"Path({str(uxplay)!r})")
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=3)
        snapshot = json.loads(result.stdout)
        self.assertEqual(set(snapshot), {"airplay", "startup"})
        self.assertFalse(snapshot["airplay"]["errors"])
        self.assertFalse(snapshot["startup"]["errors"])
        self.assertNotIn("never-collect-password", result.stdout)

    def test_cli_requires_pi_for_auto_start(self):
        result = subprocess.run([sys.executable, str(ROOT / "bridge" / "bench_dhu.py"), "--expect-auto-start"],
                                capture_output=True, text=True, timeout=3)
        self.assertEqual(result.returncode, 2)
        self.assertIn("--expect-auto-start requires --pi-host", result.stderr)


class SustainedVideoProcessTests(unittest.TestCase):
    """Run the actual supervision loop against a scripted process and decoded pixels.

    The child really consumes screenshot/quit commands and can stop producing
    output, freeze, go blank, emit transport errors, or disconnect. Only the DHU
    executable and FFmpeg decoding are substituted; elapsed time uses a scaled
    monotonic clock. These tests prove acceptance logic, not USB or codec support.
    """
    def run_session(self, scenario, minimum=9, duration=23):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name)
        fake = directory / "fake_dhu.py"
        fake.write_text('''import os, pathlib, signal, sys, time
scenario = sys.argv[1]
if scenario == "ignores_quit":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
count = 0
print("Found device TAGAAS in accessory mode (vid=18d1, pid=2d00)", flush=True)
print("Phone reported protocol version 1.5", flush=True)
print("Verify returned: ok", flush=True)
for line in sys.stdin:
    words = line.strip().split()
    if not words:
        continue
    if words[0] == "quit":
        if scenario == "ignores_quit":
            while True:
                os.write(1, b"continuous output after ignored quit\\n" * 512)
        sys.exit(0)
    if words[0] != "screenshot":
        sys.exit(5)
    count += 1
    if scenario == "disconnect" and count >= 4:
        sys.exit(0)
    if scenario == "stopped" and count >= 3:
        continue
    if scenario == "slow" and count == 3:
        time.sleep(0.3)
    value = 60 if count % 2 else 180
    if scenario == "frozen" and count >= 3:
        value = 180
    if scenario == "blank" and count >= 3 or scenario == "interrupted" and count == 3:
        value = 0
    if scenario == "initial_blank" and count == 1:
        value = 0
    data = bytes([value]) * (160 * 96 * 3)
    if scenario == "undecodable" and count == 3:
        data = b"invalid captured image"
    pathlib.Path(words[1]).write_bytes(data)
    if scenario == "late_error" and count >= 3:
        print("Ping timeout", flush=True)
''')
        args = argparse.Namespace(dhu_dir=directory, config=directory / "profile.ini",
                                  usb_serial="TAGAAS", headless=True, duration=duration,
                                  screenshot_interval=3, expect_smpte=False,
                                  min_video_seconds=minimum)
        summary = {"run_id": "fixture", "stages": {
            name: {"status": "UNKNOWN"} for name in bench.STAGES}}
        real_clock, real_select, real_popen = time.monotonic, bench.select.select, subprocess.Popen
        base, speed = real_clock(), 12
        children = []
        watchdog_fired = threading.Event()

        def popen(command, **kwargs):
            child = real_popen([sys.executable, str(fake), scenario], **kwargs)
            children.append(child)
            return child

        def watchdog():
            watchdog_fired.set()
            for child in children:
                if child.poll() is None:
                    child.kill()

        def decode(path, ffmpeg, **kwargs):
            pixels = path.read_bytes()
            decoded = len(pixels) == 160 * 96 * 3
            return {"path": str(path), "decoded": decoded,
                    "nonblank": decoded and any(value > 16 for value in pixels)}, pixels if decoded else None

        guard = threading.Timer(4, watchdog)
        guard.daemon = True
        guard.start()
        returncode_after_run = None
        try:
            with patch.object(bench, "time", SimpleNamespace(monotonic=lambda: (real_clock() - base) * speed)), \
                    patch.object(bench, "select", SimpleNamespace(select=lambda r, w, x, timeout: real_select(r, w, x, timeout / speed))), \
                    patch.object(bench.subprocess, "Popen", side_effect=popen), \
                    patch.object(bench, "decode_image", side_effect=decode):
                bench.run_dhu(args, summary, directory, "fixture-decoder")
                returncode_after_run = children[0].poll()
        finally:
            guard.cancel()
            for child in children:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=2)
        self.assertFalse(watchdog_fired.is_set(), "The supervision loop exceeded its real-time test deadline")
        summary["fixture_child_returncode_after_run"] = returncode_after_run
        summary["fixture_wall_seconds"] = real_clock() - base
        return summary

    def test_sustained_motion_passes_and_observes_longer_than_smoke(self):
        summary = self.run_session("moving", minimum=18, duration=32)
        evidence = summary["stages"]["sustained_video"]
        self.assertEqual(evidence["status"], "PASSED", evidence)
        self.assertGreaterEqual(evidence["observed_seconds"], 18)
        self.assertGreater(evidence["requested_capture_count"], 4)
        self.assertEqual(evidence["moving_pair_count"], evidence["requested_capture_count"] - 1)
        self.assertLessEqual(evidence["final_capture_age_seconds"], evidence["maximum_capture_gap_seconds"])
        self.assertFalse(summary["session"]["unexpected_process_exit"])
        self.assertEqual(summary["session"]["minimum_video_seconds"], 18)
        self.assertEqual(summary["session"]["console_commands"][-1]["command"], "quit")
        self.assertFalse(any(command["command"].lower().startswith("focus") for command in summary["session"]["console_commands"]))

    def test_early_motion_does_not_mask_later_freeze_or_blank(self):
        for scenario in ("frozen", "blank", "stopped"):
            with self.subTest(scenario=scenario):
                summary = self.run_session(scenario)
                self.assertEqual(summary["stages"]["sustained_video"]["status"], "FAILED")
                self.assertEqual(summary["stages"]["motion"]["status"], "FAILED")
                self.assertTrue(summary["stages"]["sustained_video"]["problems"])

    def test_recovered_motion_does_not_mask_gap_blank_or_decode_failure(self):
        for scenario in ("interrupted", "undecodable", "slow"):
            with self.subTest(scenario=scenario):
                evidence = self.run_session(scenario)["stages"]["sustained_video"]
                self.assertEqual(evidence["status"], "FAILED")
                self.assertTrue(evidence["problems"])

    def test_zero_exit_disconnect_after_early_motion_fails(self):
        summary = self.run_session("disconnect")
        self.assertEqual(summary["session"]["process_returncode"], 0)
        self.assertTrue(summary["session"]["unexpected_process_exit"])
        self.assertEqual(summary["stages"]["video"]["status"], "FAILED")
        self.assertEqual(summary["stages"]["sustained_video"]["status"], "FAILED")

    def test_late_transport_error_invalidates_moving_output(self):
        summary = self.run_session("late_error")
        self.assertTrue(summary["session"]["errors"])
        self.assertEqual(summary["stages"]["sustained_video"]["status"], "FAILED")

    def test_continuous_logging_after_ignored_quit_is_bounded_and_child_is_cleaned_up(self):
        summary = self.run_session("ignores_quit")
        self.assertLess(summary["fixture_wall_seconds"], 4)
        self.assertIsNotNone(summary["fixture_child_returncode_after_run"])
        self.assertEqual(summary["session"]["process_returncode"], 0)
        self.assertTrue(summary["session"]["forced_process_termination"])
        self.assertTrue(summary["session"]["requested_quit"])
        self.assertEqual(summary["stages"]["video"]["status"], "FAILED")
        self.assertEqual(summary["stages"]["sustained_video"]["status"], "FAILED")

    def test_initial_blank_does_not_start_observation_clock(self):
        evidence = self.run_session("initial_blank")["stages"]["sustained_video"]
        self.assertEqual(evidence["status"], "PASSED", evidence)
        self.assertGreater(evidence["first_decoded_elapsed_seconds"], 6)
        self.assertGreaterEqual(evidence["observed_seconds"], 9)

    def test_deadline_before_minimum_video_fails(self):
        summary = self.run_session("moving", minimum=30, duration=16)
        evidence = summary["stages"]["sustained_video"]
        self.assertEqual(evidence["status"], "FAILED")
        self.assertLess(evidence["observed_seconds"], evidence["requested_seconds"])
        self.assertTrue(summary["session"]["requested_quit"])

    def test_default_smoke_still_finishes_early(self):
        summary = self.run_session("moving", minimum=0)
        commands = summary["session"]["console_commands"]
        self.assertEqual(sum(command["command"].startswith("screenshot") for command in commands), 2)
        self.assertEqual(summary["stages"]["motion"]["status"], "PASSED")
        self.assertLess(summary["session"]["elapsed_seconds"], 12)

    def test_cli_rejects_unbounded_or_too_short_observation_budget(self):
        for arguments in (("--min-video-seconds", "nan"), ("--min-video-seconds", "inf"),
                          ("--min-video-seconds", "-1"), ("--min-video-seconds", "60", "--duration", "65"),
                          ("--screenshot-interval", "nan")):
            with self.subTest(arguments=arguments):
                result = subprocess.run([sys.executable, str(ROOT / "bridge" / "bench_dhu.py"), *arguments],
                                        capture_output=True, text=True, timeout=3)
                self.assertEqual(result.returncode, 2)
                self.assertIn("error:", result.stderr)
                self.assertNotIn("Evidence:", result.stdout)


if __name__ == "__main__":
    unittest.main()
