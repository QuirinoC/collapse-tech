"""Synthetic evidence tests, never a mocked successful USB/DHU session."""
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


def snapshot(time, size, packets):
    return {"collected": True, "log": "synthetic-pi.log", "airplay": {
        "captured_at_epoch": time, "source_config_lines": ["AIRPLAY_AA_SOURCE=airplay"], "errors": [],
        "uxplay_log": {"device": 1, "inode": 2, "size": size, "packets": packets}}}


def packet(offset, received, timestamp):
    return {"offset": offset, "receive_epoch": received, "packet_timestamp": timestamp, "size": 60}


class AirPlayEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.before = snapshot(1000, 100, [packet(20, 999.9, 2000)])
        self.after = snapshot(1010, 500, [packet(150, 1008, 2008), packet(300, 1009, 2009)])

    def test_new_advancing_receive_evidence(self):
        result = bench.evaluate_airplay(self.before, self.after)
        self.assertEqual(result["status"], "PASSED")
        self.assertEqual(result["fresh_packet_count"], 2)
        self.assertIn("visual comparison", result["content_identity"])

    def test_stale_tail_does_not_pass(self):
        self.assertEqual(bench.evaluate_airplay(self.before, self.before)["status"], "FAILED")
        stale = copy.deepcopy(self.after)
        stale["airplay"]["uxplay_log"]["packets"] = [packet(20, 999.9, 2000)] * 2
        self.assertEqual(bench.evaluate_airplay(self.before, stale)["status"], "FAILED")

    def test_newly_appended_historic_markers_do_not_pass(self):
        self.after["airplay"]["uxplay_log"]["packets"] = [packet(150, 900, 1900), packet(300, 901, 1901)]
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")

    def test_missing_collection_fails(self):
        for before, after in ((None, self.after), (self.before, None),
                              ({"collected": False}, self.after), (self.before, {"collected": False})):
            self.assertEqual(bench.evaluate_airplay(before, after)["status"], "FAILED")
        del self.after["log"]
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")

    def test_wrong_source_and_missing_receive_log_fail(self):
        self.after["airplay"]["source_config_lines"] = ["AIRPLAY_AA_SOURCE=test-pattern"]
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")
        del self.before["airplay"]["uxplay_log"]
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")

    def test_nonadvancing_packet_timestamp_fails(self):
        self.after["airplay"]["uxplay_log"]["packets"][1]["packet_timestamp"] = 2008
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")

    def test_old_final_receive_or_log_rotation_fails(self):
        self.after["airplay"]["captured_at_epoch"] = 1020
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")
        self.after["airplay"]["uxplay_log"]["inode"] = 3
        self.assertEqual(bench.evaluate_airplay(self.before, self.after)["status"], "FAILED")

    def test_remote_collector_bounds_output_and_excludes_config_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            config, log = directory / "bridge.env", directory / "uxplay.log"
            config.write_text("PASSWORD=never-print-this\nAIRPLAY_AA_SOURCE=airplay\nOTHER_SECRET=also-private\n")
            records = b"".join(
                f"raop_rtp video: now = {1000 + index / 30:.6f}, ntp = 0.000000, ts = {2000 + index / 30:.6f}, 00 00 00 00  h264, size: 60\n".encode()
                for index in range(30))
            log.write_bytes(b"irrelevant debug line\n" * 60000 + records)
            code = bench.SSH_AIRPLAY_READ_ONLY.split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
            code = code.replace("Path('/etc/airplay-aa/bridge.env')", f"Path({str(config)!r})")
            code = code.replace("Path('/var/log/airplay-aa/uxplay.log')", f"Path({str(log)!r})")
            result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True, timeout=3)
            evidence = json.loads(result.stdout)
            self.assertNotIn("never-print", result.stdout)
            self.assertNotIn("also-private", result.stdout)
            self.assertEqual(evidence["source_config_lines"], ["AIRPLAY_AA_SOURCE=airplay"])
            self.assertEqual(len(evidence["uxplay_log"]["packets"]), 16)
            self.assertLessEqual(evidence["uxplay_log"]["tail_bytes_read"], 262144)
            self.assertLess(len(result.stdout), 10000)
            latest = evidence["uxplay_log"]["packets"][-1]
            self.assertTrue(log.read_bytes()[latest["offset"]:].startswith(b"raop_rtp video:"))

    def test_airplay_cli_requires_pi_and_excludes_smpte(self):
        for arguments in (("--expect-airplay",), ("--expect-airplay", "--expect-smpte", "--pi-host", "pi")):
            result = subprocess.run([sys.executable, str(ROOT / "bridge" / "bench_dhu.py"), *arguments],
                                    capture_output=True, text=True, timeout=3)
            self.assertEqual(result.returncode, 2)
            self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
