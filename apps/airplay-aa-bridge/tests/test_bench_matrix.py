"""Negative evidence fixtures prevent incomplete smoke runs becoming matrix PASS."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bench_matrix", ROOT / "bridge" / "bench_matrix.py")
matrix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matrix)


def complete_fixture():
    fixture = {
        "overall": {"outcome": "PASSED"},
        "stages": {name: {"status": "PASSED"} for name in (*matrix.COMMON_STAGES, "pattern")},
        "session": {"console_video_focus_override": False, "tls_bypass_enabled": False,
                    "unexpected_process_exit": False, "forced_process_termination": False,
                    "process_returncode": 0, "requested_quit": True,
                    "minimum_video_seconds": 60,
                    "command": ["dhu", "-c", "/fixture/touch.ini", "--usb", "TAGAAS"]},
    }
    fixture["stages"]["sustained_video"].update(
        requested_seconds=60, observed_seconds=64.2, final_capture_age_seconds=2.2,
        capture_interval_seconds=5, capture_grace_seconds=2,
        first_decoded_elapsed_seconds=3.8, last_capture_elapsed_seconds=68,
        ended_elapsed_seconds=70.2, requested_capture_count=14, moving_pair_count=13,
        comparisons=[{"first": f"/fixture/frame-{index}.png", "second": f"/fixture/frame-{index+1}.png",
                      "motion": True, "mean_absolute_rgb_difference": 1.0,
                      "changed_pixel_fraction": .04, "separation_seconds": 5} for index in range(13)])
    return fixture


class MatrixEvidenceTests(unittest.TestCase):
    def test_successful_smoke_without_sustained_evidence_cannot_pass(self):
        fixture = complete_fixture()
        del fixture["stages"]["sustained_video"]
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_source_specific_evidence_is_required(self):
        fixture = complete_fixture()
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "PASSED")
        self.assertEqual(matrix.child_outcome(0, fixture, "airplay"), "FAILED")
        fixture["stages"]["airplay"] = {"status": "PASSED"}
        self.assertEqual(matrix.child_outcome(0, fixture, "airplay"), "PASSED")

    def test_rejected_or_missing_real_startup_proof_never_passes(self):
        for name in ("input", "automatic_focus", "tls", "sustained_video"):
            for status in ("FAILED", "UNKNOWN", "NOT_TESTED"):
                fixture = complete_fixture()
                fixture["stages"][name]["status"] = status
                with self.subTest(stage=name, status=status):
                    self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_error_exit_and_overrides_cannot_be_hidden_by_pass_label(self):
        fixture = complete_fixture()
        self.assertEqual(matrix.child_outcome(1, fixture, "test-pattern"), "FAILED")
        for field, value in (("tls_bypass_enabled", True), ("console_video_focus_override", True),
                             ("unexpected_process_exit", True), ("requested_quit", False),
                             ("forced_process_termination", True), ("forced_process_termination", None),
                             ("process_returncode", 1)):
            changed = copy.deepcopy(fixture)
            changed["session"][field] = value
            with self.subTest(field=field):
                self.assertEqual(matrix.child_outcome(0, changed, "test-pattern"), "FAILED")

    def test_missing_hardware_without_a_launched_dhu_is_blocked(self):
        fixture = {"overall": {"outcome": "FAILED"},
                   "stages": {"preflight": {"status": "FAILED"}, "usb": {"status": "FAILED"}}}
        self.assertEqual(matrix.child_outcome(1, fixture, "test-pattern"), "BLOCKED")
        self.assertEqual(matrix.child_outcome(2, None, "test-pattern"), "BLOCKED")

    def test_short_stale_and_mismatched_profile_evidence_cannot_pass(self):
        fixture = complete_fixture()
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern",
                         config=Path('/fixture/touch.ini')), "PASSED")
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern",
                         config=Path('/fixture/rotary.ini')), "FAILED")
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern", usb_serial="OTHER"), "FAILED")
        for name, value in (("observed_seconds", 13.41), ("requested_seconds", 0),
                            ("final_capture_age_seconds", 7.1), ("capture_interval_seconds", 60),
                            ("capture_grace_seconds", 30), ("observed_seconds", float('nan'))):
            changed = copy.deepcopy(fixture)
            changed["stages"]["sustained_video"][name] = value
            with self.subTest(field=name):
                self.assertEqual(matrix.child_outcome(0, changed, "test-pattern"), "FAILED")
        fixture["stages"]["sustained_video"]["comparisons"][0]["motion"] = False
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_capture_gap_cannot_be_hidden_by_moving_frames(self):
        fixture = complete_fixture()
        fixture["stages"]["sustained_video"]["comparisons"][0]["separation_seconds"] = 7.1
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_claimed_duration_requires_complete_consecutive_capture_evidence(self):
        fixture = complete_fixture()
        for field, value in (("comparisons", fixture["stages"]["sustained_video"]["comparisons"][:1]),
                             ("requested_capture_count", 2), ("moving_pair_count", 1),
                             ("observed_seconds", 120), ("first_decoded_elapsed_seconds", 30),
                             ("ended_elapsed_seconds", 120)):
            changed = copy.deepcopy(fixture)
            changed["stages"]["sustained_video"][field] = value
            with self.subTest(field=field):
                self.assertEqual(matrix.child_outcome(0, changed, "test-pattern"), "FAILED")
        fixture["stages"]["sustained_video"]["comparisons"][1]["first"] = '/fixture/unrelated.png'
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_forced_timeout_cleans_a_separately_sessioned_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "descendant.pid"
            child = ("import os,time,sys; from pathlib import Path; "
                     "Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)")
            parent = ("import signal,subprocess,time,sys; signal.signal(signal.SIGINT,signal.SIG_IGN); "
                      "p=subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]],start_new_session=True); "
                      "time.sleep(30)")
            status, _, error = matrix.run_child(
                [sys.executable, "-c", parent, child, str(pidfile)], .5, cleanup_grace=.2)
            self.assertEqual(status, 1)
            self.assertIn("bounded", error)
            pid = int(pidfile.read_text())
            # A reparented zombie can briefly remain in ps after SIGKILL; it
            # must not remain an executing process with the USB session alive.
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='],
                                    capture_output=True, text=True, timeout=2)
            self.assertTrue(not result.stdout.strip() or result.stdout.strip().startswith('Z'))

    def test_malformed_evidence_cannot_raise_or_pass(self):
        for value in (None, [], {"overall": "PASSED"}, {"overall": {}, "stages": []}):
            self.assertEqual(matrix.child_outcome(0, value, "test-pattern"), "FAILED")
        fixture = complete_fixture()
        fixture["stages"]["tls"] = "PASSED"
        self.assertEqual(matrix.child_outcome(0, fixture, "test-pattern"), "FAILED")

    def test_timeout_cleans_descendant_after_cooperative_parent_has_exited(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "descendant.pid"
            child = ("import os,time,sys; from pathlib import Path; "
                     "Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)")
            parent = ("import signal,subprocess,time,sys; signal.signal(signal.SIGINT,lambda *args:sys.exit(0)); "
                      "p=subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]],start_new_session=True); "
                      "time.sleep(30)")
            status, _, error = matrix.run_child(
                [sys.executable, "-c", parent, child, str(pidfile)], .5, cleanup_grace=.2)
            self.assertEqual(status, 1)
            self.assertIn("bounded", error)
            pid = int(pidfile.read_text())
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='],
                                    capture_output=True, text=True, timeout=2)
            self.assertTrue(not result.stdout.strip() or result.stdout.strip().startswith('Z'))

    def test_timeout_cleans_orphan_even_when_its_output_does_not_hold_parent_pipe(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / "descendant.pid"
            child = ("import os,time,sys; from pathlib import Path; "
                     "Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)")
            parent = ("import signal,subprocess,time,sys; signal.signal(signal.SIGINT,lambda *args:sys.exit(0)); "
                      "p=subprocess.Popen([sys.executable,'-c',sys.argv[1],sys.argv[2]],start_new_session=True,"
                      "stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(30)")
            status, _, error = matrix.run_child(
                [sys.executable, "-c", parent, child, str(pidfile)], .5, cleanup_grace=.2)
            self.assertEqual(status, 1)
            self.assertIn("bounded", error)
            pid = int(pidfile.read_text())
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='],
                                    capture_output=True, text=True, timeout=2)
            self.assertTrue(not result.stdout.strip() or result.stdout.strip().startswith('Z'))

    def test_outer_timeout_allows_child_to_perform_signal_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "cleaned"
            code = ("import signal,time,sys; from pathlib import Path; "
                    "signal.signal(signal.SIGINT, lambda *args: (Path(sys.argv[1]).write_text('cleaned'),sys.exit(0))); "
                    "time.sleep(30)")
            status, _, error = matrix.run_child([sys.executable, "-c", code, str(marker)], .5)
            self.assertEqual(status, 1)
            self.assertIn("bounded", error)
            self.assertEqual(marker.read_text(), "cleaned")

    def test_invalid_duration_and_reused_directory_are_rejected_before_hardware(self):
        with tempfile.TemporaryDirectory() as directory:
            for options in (("--duration", "20", "--min-video-seconds", "60"),
                            ("--output-dir", directory)):
                result = subprocess.run([sys.executable, str(ROOT / "bridge" / "bench_matrix.py"),
                                         "--pi-host", "fixture.invalid", *options],
                                        capture_output=True, text=True, timeout=3)
                self.assertEqual(result.returncode, 2)
                self.assertIn("error", result.stderr)


if __name__ == "__main__":
    unittest.main()
