"""Production-log fixtures test acceptance policy; no successful USB is mocked."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


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


if __name__ == "__main__":
    unittest.main()
