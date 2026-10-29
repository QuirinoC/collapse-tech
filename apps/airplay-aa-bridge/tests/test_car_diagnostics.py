"""Passive recorder boundaries: real files, rotation, stale logs and privacy."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import signal
import socket
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "car_diagnostics.py"
spec = importlib.util.spec_from_file_location("car_diagnostics", SCRIPT)
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class EvidenceTests(unittest.TestCase):
    def test_suspend_resume_stages_distinguish_current_and_historical_log_formats(self):
        self.assertEqual(diagnostics.stage_event(
            "USB suspended: retaining session/configuration until RESUME or newer FUNCTIONFS_ENABLE"),
            {"stage": "usb_suspended"})
        self.assertEqual(diagnostics.stage_event(
            "USB startup suspended: retaining configured state until RESUME or newer FUNCTIONFS_ENABLE"),
            {"stage": "usb_startup_suspended"})
        self.assertEqual(diagnostics.stage_event(
            "USB resumed: waiting for actual FUNCTIONFS_ENABLE if configuration was invalidated"),
            {"stage": "usb_resumed"})

    def test_actual_mazda_startup_failure_is_distinct_from_projection_wait(self):
        trace = ["Initial AOA request 51 handled",
                 "Initial AOA request 53 completed; switch to accessory mode",
                 "ep0 event 2 ", "ep0 event 3 ",
                 "USB startup ESHUTDOWN: waiting for newer FUNCTIONFS_ENABLE",
                 "Error: USB startup deadline expired before session bytes"]
        events = [diagnostics.stage_event(line.strip()) for line in trace]
        self.assertEqual(events[-1]["stage"], "usb_startup_timeout")
        self.assertFalse(any(e["stage"] == "version_negotiated" for e in events))
        self.assertEqual(diagnostics.stage_event(
            "VideoChannelHandler: setup status=2 max_unacked=4 config0=1 accepted=1"),
            {"stage": "video_setup_response", "status": 2, "max_unacked": 4,
             "config0": 1, "accepted": 1})
        focus = diagnostics.stage_event("VideoChannelHandler: requesting PROJECTED focus on channel 1")
        self.assertEqual(focus["stage"], "video_focus_requested")
        self.assertNotEqual(focus["stage"], "video_focus_received")

    def test_no_raw_identifiers_credentials_urls_or_media_are_retained(self):
        for value in ['adapter_address: "12:34:56:78:90:AB"',
                      '3: "private-vehicle-id"', 'Authorization: Bearer SECRET',
                      'HTTP POST https://example.invalid/?token=SECRET',
                      'raop_rtp video: SECRET', 'dumpfile: /secret/path',
                      '-----BEGIN PRIVATE KEY-----', 'got ping request']:
            self.assertIsNone(diagnostics.stage_event(value))
        event = diagnostics.stage_event("VideoChannelHandler: VideoFocusIndication mode=1 secret=SECRET")
        self.assertNotIn("SECRET", json.dumps(event))
        self.assertEqual(event, {"stage": "video_focus_received", "mode": 1})

    def test_kernel_events_keep_source_monotonic_time_and_omit_source_text(self):
        source = {"MESSAGE": "dwc2 1000480000.usb: new device is high-speed",
                  "__MONOTONIC_TIMESTAMP": "880120000", "_HOSTNAME": "private-host"}
        self.assertEqual(diagnostics.kernel_event(source),
                         {"event": "usb_negotiated_speed", "speed": "high-speed",
                          "kernel_monotonic_seconds": 880.12})
        for value in [None, [], "secret", {"MESSAGE": "WiFi SSID SECRET"},
                      {"MESSAGE": ["secret"]}]:
            self.assertIsNone(diagnostics.kernel_event(value))
        self.assertEqual(diagnostics.kernel_event({"MESSAGE": "hwmon: Undervoltage detected!"}),
                         {"event": "undervoltage_detected"})

    def test_rejected_binding_stays_rejected(self):
        event = diagnostics.stage_event(
            "InputChannelHandler: channel 2 InputBindingResponse parsed=1 status=-1 accepted=0")
        self.assertEqual(event["accepted"], 0)
        self.assertEqual(event["status"], -1)

    def test_media_session_credit_stop_and_open_status_remain_visible(self):
        self.assertEqual(diagnostics.stage_event(
            "VideoChannelHandler: StartIndication on channel 1 session=2 max_unacked=4"),
            {"stage": "video_start_sent", "channel": 1, "media_session": 2, "max_unacked": 4})
        self.assertEqual(diagnostics.stage_event(
            "VideoChannelHandler: StopIndication on channel 1 session=2"),
            {"stage": "video_stop_sent", "channel": 1, "media_session": 2})
        self.assertEqual(diagnostics.stage_event(
            "VideoChannelHandler: media credit exhausted on channel 1; holding video until ACK and IDR"),
            {"stage": "video_credit_exhausted", "channel": 1})
        self.assertEqual(diagnostics.stage_event(
            "ChannelHandler: channel 1 ChannelOpenResponse parsed=1 status=3 accepted=0")["accepted"], 0)

    def test_transport_failures_are_classified_without_raw_exception_data(self):
        for line, category in [
            ("Error: AA continuation does not match an active message", "aa_framing"),
            ("Error: AA message on an undiscovered channel", "unknown_channel"),
            ("Error: SSL_read failed: -1 1", "tls_read"),
            ("Error: SSL_write failed: -1 1", "tls_write"),
            ("Error: TLS handshake BIO_write failed", "tls_handshake"),
            ("Error: ep0 disable after session bytes", "usb_transport"),
            ("disconnect client: 4 head unit rejected channel open", "channel_open_rejected"),
            ("Error: unknown thing with credential SECRET", "unclassified"),
        ]:
            event = diagnostics.stage_event(line)
            self.assertEqual(event, {"stage": "transport_error", "category": category})
            self.assertNotIn("SECRET", json.dumps(event))


class FileTests(unittest.TestCase):
    def test_follow_only_fresh_lines_then_follow_replacement_from_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "aaserver.log"
            path.write_text("auth complete\n")
            reader = diagnostics.LogTail(path)
            self.assertEqual(reader.read()[0], [])
            with path.open("a") as out:
                out.write("got version req")
            self.assertEqual(reader.read()[0], [])
            with path.open("a") as out:
                out.write("uest\n")
            self.assertEqual(reader.read()[0], ["got version request"])
            path.rename(path.with_suffix(".previous"))
            path.write_text("Initial AOA request 51 handled\n")
            lines, changed = reader.read()
            self.assertTrue(changed)
            self.assertEqual(lines, ["Initial AOA request 51 handled"])

    def test_missing_file_at_boot_then_creation_and_truncation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "aaserver.log"
            reader = diagnostics.LogTail(path)
            self.assertEqual(reader.read()[0], [])
            path.write_text("a long first session line\n")
            self.assertEqual(reader.read()[0], ["a long first session line"])
            path.write_text("new\n")
            self.assertEqual(reader.read(), (["new"], True))

    def test_rotation_is_bounded_private_and_remains_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "private" / "events.jsonl"
            log = diagnostics.BoundedLog(path, max_bytes=256, backups=2)
            for sequence in range(100):
                log.write({"sequence": sequence, "payload": "x" * 30})
            log.close()
            files = list(path.parent.glob("events.jsonl*"))
            self.assertEqual(len(files), 3)
            self.assertLessEqual(sum(file.stat().st_size for file in files), 3 * 256)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            for file in files:
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
                self.assertTrue(all(isinstance(json.loads(line), dict) for line in file.read_text().splitlines()))
            self.assertEqual(json.loads(path.read_text().splitlines()[-1])["sequence"], 99)

    def test_log_does_not_follow_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "target"
            target.write_text("preserve")
            link = Path(tmp) / "events"
            link.symlink_to(target)
            with self.assertRaises(OSError):
                diagnostics.BoundedLog(link)
            self.assertEqual(target.read_text(), "preserve")

    def test_usb_sampling_never_opens_configfs_or_endpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            controller = root / "1000480000.usb"
            controller.mkdir()
            (controller / "state").write_text("configured\n")
            (controller / "current_speed").write_text("high-speed\n")
            (controller / "maximum_speed").write_text("high-speed\n")
            result = diagnostics.sample_usb(root)
            self.assertEqual(result[0]["state"], "configured")
            self.assertEqual(result[0]["current_speed"], "high-speed")
            self.assertEqual((controller / "state").read_text(), "configured\n")

    def test_pid_reuse_is_distinguished_by_kernel_start_ticks(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = Path(tmp) / "120"
            proc.mkdir()
            (proc / "comm").write_text("AAServer\n")
            fields = ["S"] + ["0"] * 18 + ["1234"]
            (proc / "stat").write_text("120 (AAServer) " + " ".join(fields))
            first = diagnostics.sample_processes(Path(tmp))
            fields[-1] = "9999"
            (proc / "stat").write_text("120 (AAServer) " + " ".join(fields))
            second = diagnostics.sample_processes(Path(tmp))
            self.assertNotEqual(first, second)
            self.assertEqual(second, [{"pid": 120, "start_ticks": 9999}])

    @patch.object(diagnostics.subprocess, "run", side_effect=subprocess.TimeoutExpired("vcgencmd", 1))
    def test_power_commands_are_bounded_and_unavailable_is_not_zero(self, run):
        self.assertEqual(diagnostics.sample_power(),
                         {"get_throttled_unavailable": True, "pmic_read_adc_unavailable": True})
        self.assertTrue(all(call.kwargs["timeout"] == 1 for call in run.call_args_list))

    def test_real_process_ready_before_fresh_attempt_and_stops_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            notify_path = str(root / "notify.sock")
            output, bridge = root / "events.jsonl", root / "aaserver.log"
            bridge.write_text("auth complete\n")
            with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as notify:
                notify.bind(notify_path)
                notify.settimeout(3)
                process = subprocess.Popen([sys.executable, str(SCRIPT), "--output", str(output),
                                            "--bridge-log", str(bridge)],
                                           env={**os.environ, "NOTIFY_SOCKET": notify_path},
                                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                try:
                    self.assertIn(b"READY=1", notify.recv(1024))
                    bridge.rename(root / "previous.log")
                    bridge.write_text("2026-10-22T12:00:00-07:00\ngot version request\n")
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        if '"stage":"version_request_received"' in output.read_text():
                            break
                        time.sleep(0.05)
                    process.send_signal(signal.SIGTERM)
                    stdout, stderr = process.communicate(timeout=5)
                    self.assertEqual(process.returncode, 0, stderr.decode())
                    events = [json.loads(line) for line in output.read_text().splitlines()]
                    protocols = [event for event in events if event["kind"] == "protocol"]
                    self.assertEqual([event["stage"] for event in protocols],
                                     ["aaserver_attempt", "version_request_received"])
                    self.assertTrue(all(event["attempt"] == 1 for event in protocols))
                    self.assertEqual(events[-1]["kind"], "recorder_stop")
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.communicate(timeout=3)


if __name__ == "__main__":
    unittest.main()
