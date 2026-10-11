"""Offline activation scenarios: no Wi-Fi, services, credentials or SSH calls."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "preferred_hotspot.py"
spec = importlib.util.spec_from_file_location("preferred_hotspot", SCRIPT)
hotspot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hotspot)
PREFERRED = "11111111-1111-4111-8111-111111111111"
HOME = "22222222-2222-4222-8222-222222222222"
DEVICE, PROFILE, AP = "/device/wifi", "/profile/preferred", "/ap/preferred"


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now

    def sleep(self, duration):
        self.now += duration


def connected(profile_uuid, path="/active/home"):
    return {"state": 100, "active_state": 2, "uuid": profile_uuid,
            "path": path, "devices": [DEVICE]}


class FakeManager:
    """Simulate asynchronous connection/scan outcomes rather than echo results."""
    def __init__(self, clock):
        self.clock, self.deadline = clock, 115
        self.current = connected(HOME)
        self.ssid = b"Test hotspot"
        self.ap_ssid, self.ap_seen = self.ssid, 99
        self.scan_ms, self.scanning = 99000, False
        self.scan_blocked, self.checkpoint_blocked = False, False
        self.activation_at, self.activation_outcome = None, "success"
        self.discovery_race = None
        self.confirm_error, self.rollback_error = False, False
        self.events = []

    def device(self, _interface):
        return DEVICE

    def profile(self, profile_uuid, _interface):
        if profile_uuid != PREFERRED:
            raise ValueError("unknown fixture profile")
        return PROFILE, self.ssid

    def snapshot(self, _device):
        if self.activation_at is not None and self.clock() >= self.activation_at:
            if self.activation_outcome == "success":
                self.current = connected(PREFERRED, "/active/new")
            elif self.activation_outcome == "wrong-uuid":
                self.current = connected(HOME, "/active/new")
            elif self.activation_outcome == "wrong-path":
                self.current = connected(PREFERRED, "/active/other")
        return dict(self.current)

    def last_scan(self, _device):
        if self.scanning and self.clock() >= self.scan_ready_at:
            self.scan_ms, self.ap_seen = int(self.clock() * 1000), int(self.clock())
            self.scanning = False
        return self.scan_ms

    def request_scan(self, _device):
        self.events.append("scan")
        if self.scan_blocked:
            raise RuntimeError("rate limited")
        self.scanning = True
        self.scan_ready_at = self.clock() + 2

    def access_points(self, _device):
        if self.discovery_race is not None:
            self.current = self.discovery_race
        yield AP, {"Ssid": self.ap_ssid, "LastSeen": self.ap_seen}

    def checkpoint(self, _device):
        self.events.append("checkpoint")
        if self.checkpoint_blocked:
            raise RuntimeError("another checkpoint covers this device")
        self.saved = dict(self.current)
        return "/checkpoint/owned"

    def activate(self, profile, device, access_point):
        if (profile, device, access_point) != (PROFILE, DEVICE, AP):
            raise AssertionError("Activation must use the discovered AP and saved profile")
        self.events.append("activate")
        self.activation_at = self.clock() + 2
        self.current = {"state": 50, "active_state": 1, "uuid": PREFERRED,
                        "path": "/active/new", "devices": [DEVICE]}
        return "/active/new"

    def confirm(self, _checkpoint):
        self.events.append("confirm")
        if self.confirm_error:
            raise RuntimeError("confirmation not accepted")

    def rollback(self, _checkpoint):
        self.events.append("rollback")
        if self.rollback_error:
            raise RuntimeError("bus unavailable")
        self.activation_at, self.current = None, dict(self.saved)
        return {DEVICE: 0}


class PreferredHotspotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.clock = Clock()
        self.network = FakeManager(self.clock)
        self.retry = hotspot.RetryState(self.temporary.name, PREFERRED, "fixture-boot", self.clock)

    def run_check(self):
        return hotspot.prefer_hotspot(self.network, "wlan0", PREFERRED, self.retry,
                                      self.clock, self.clock.sleep)

    def test_hotspot_appears_while_home_active_and_commit_requires_activation(self):
        self.network.scan_ms, self.network.ap_seen = 0, 0
        self.assertEqual(self.run_check(), "connected-preferred")
        self.assertEqual(self.network.events, ["scan", "checkpoint", "activate", "confirm"])
        self.assertGreaterEqual(self.clock(), 104)
        self.assertFalse(self.retry.cooling_down())

    def test_already_preferred_is_not_reconnected(self):
        self.network.current = connected(PREFERRED)
        self.assertEqual(self.run_check(), "already-preferred")
        self.assertEqual(self.network.events, [])

    def test_discovery_race_does_not_reconnect_newly_active_preferred(self):
        self.network.discovery_race = connected(PREFERRED, "/active/manual")
        self.assertEqual(self.run_check(), "already-preferred")
        self.assertEqual(self.network.events, [])

    def test_discovery_race_does_not_replace_a_connecting_network(self):
        self.network.discovery_race = {**connected(HOME), "state": 70, "active_state": 1}
        self.assertEqual(self.run_check(), "device-busy")
        self.assertEqual(self.network.events, [])

    def test_exact_ssid_and_recent_scan_are_required(self):
        for ssid, seen in [(b"Test hotspot extra", 99), (b"test hotspot", 99), (self.network.ssid, 0)]:
            with self.subTest(ssid=ssid, seen=seen):
                self.network.ap_ssid, self.network.ap_seen = ssid, seen
                self.assertEqual(self.run_check(), "preferred-not-visible")
                self.assertEqual(self.network.events, [])
                self.assertEqual(self.network.current["uuid"], HOME)

    def test_scan_rejection_leaves_home_connected(self):
        self.network.scan_ms, self.network.scan_blocked = 0, True
        self.assertEqual(self.run_check(), "scan-deferred")
        self.assertEqual(self.network.events, ["scan"])
        self.assertEqual(self.network.current["uuid"], HOME)

    def test_another_checkpoint_is_not_overridden(self):
        self.network.checkpoint_blocked = True
        with self.assertRaises(RuntimeError):
            self.run_check()
        self.assertEqual(self.network.events, ["checkpoint"])
        self.assertFalse(self.retry.cooling_down())

    def test_failed_activation_restores_home_and_persists_five_minute_cooldown(self):
        self.network.activation_outcome = "never"
        self.assertEqual(self.run_check(), "activation-failed-previous-network-restored")
        self.assertEqual(self.clock(), 125)
        self.assertEqual(self.network.events, ["checkpoint", "activate", "rollback"])
        self.assertEqual(self.network.current["uuid"], HOME)
        self.retry = hotspot.RetryState(self.temporary.name, PREFERRED, "fixture-boot", self.clock)
        self.assertEqual(self.run_check(), "cooldown")
        self.clock.now = 400
        self.network.activation_outcome = "success"
        self.assertEqual(self.run_check(), "connected-preferred")

    def test_wrong_uuid_or_other_activation_cannot_confirm_checkpoint(self):
        for outcome in ["wrong-uuid", "wrong-path"]:
            with self.subTest(outcome=outcome):
                self.network.activation_outcome = outcome
                self.assertEqual(self.run_check(), "activation-failed-previous-network-restored")
                self.assertNotIn("confirm", self.network.events)
                self.retry.clear()

    def test_confirmation_error_rolls_back_instead_of_claiming_success(self):
        self.network.confirm_error = True
        self.assertEqual(self.run_check(), "activation-failed-previous-network-restored")
        self.assertEqual(self.network.current["uuid"], HOME)
        self.assertTrue(self.retry.cooling_down())

    def test_failed_rollback_leaves_daemon_timeout_protection(self):
        self.network.activation_outcome, self.network.rollback_error = "never", True
        self.assertEqual(self.run_check(), "activation-failed-automatic-rollback-pending")
        self.assertNotIn("confirm", self.network.events)
        self.assertTrue(self.retry.cooling_down())

    def test_old_boot_cooldown_does_not_block_new_boot(self):
        self.retry.mark_attempt()
        self.retry = hotspot.RetryState(self.temporary.name, PREFERRED, "new-fixture-boot", self.clock)
        self.assertFalse(self.retry.cooling_down())

    def test_private_config_rejects_placeholder_and_public_permissions(self):
        path = Path(self.temporary.name) / "config"
        text = "[preferred-hotspot]\ninterface=wlan0\nprofile_uuid={}\n"
        path.write_text(text.format(PREFERRED))
        path.chmod(0o600)
        self.assertEqual(hotspot.read_config(path), ("wlan0", PREFERRED))
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            hotspot.read_config(path)
        path.chmod(0o600)
        path.write_text(text.format("00000000-0000-0000-0000-000000000000"))
        with self.assertRaises(ValueError):
            hotspot.read_config(path)


if __name__ == "__main__":
    unittest.main()
