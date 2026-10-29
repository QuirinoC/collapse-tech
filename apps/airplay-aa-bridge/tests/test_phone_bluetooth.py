"""Exercise the production phone-side Bluetooth path without Bluetooth hardware."""
from collections import deque
from pathlib import Path
import sys
import json
import socket
import tempfile
import builtins
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
import bluetooth_protocol as protocol
import phone_bluetooth as phone


CAR = "02:11:22:33:44:55"
OTHER = "02:11:22:33:44:66"
PHONE = "02:AA:BB:CC:DD:EE"
CHANNEL = 37
ADAPTER = "/org/bluez/hci0"
DEVICE = ADAPTER + "/dev_02_11_22_33_44_55"
CHALLENGE = 123456


def message(kind, body=b"", channel=CHANNEL):
    return bytes([channel, 0]) + kind.to_bytes(2, "big") + body


def descriptor(channel=CHANNEL, address=CAR, methods=b"\x10\x02"):
    # Independent, small protobuf wire fixture: ChannelDescriptor.bluetooth is 6.
    bluetooth = b"\x0a\x11" + address.encode("ascii") + methods
    service = bytes([8, channel, 50, len(bluetooth)]) + bluetooth
    return bytes([10, len(service)]) + service


class FakeLoop:
    def __init__(self):
        self.quit_count = 0

    def quit(self):
        self.quit_count += 1

    def run(self):
        raise AssertionError("test did not arrange a terminating main loop")


class FakeGLib:
    IO_IN, IO_HUP, IO_ERR, IO_NVAL = 1, 2, 4, 8
    MainLoop = FakeLoop

    def __init__(self):
        self.sources = []
        self.removed = []

    def io_add_watch(self, *args):
        self.sources.append(args)
        return len(self.sources)

    def timeout_add(self, *args):
        self.sources.append(args)
        return len(self.sources)

    def source_remove(self, source):
        self.removed.append(source)


class FakeSocket:
    def __init__(self, *incoming):
        self.incoming = deque(incoming)
        self.sent = []
        self.closed = False
        self.on_send = None

    def recv(self, maximum):
        if not self.incoming:
            raise BlockingIOError()
        return self.incoming.popleft()

    def send(self, data):
        self.sent.append(data)
        if self.on_send:
            self.on_send(data)
        return len(data)

    def close(self):
        self.closed = True

    def setblocking(self, value):
        pass

    def fileno(self):
        return 40


def arguments(**changes):
    values = dict(duration=60, scan_seconds=10, adapter=ADAPTER,
                  discoverable=False, headunit_address=CAR,
                  hfp_wait_seconds=0, aa_socket="/test/AAServer")
    values.update(changes)
    return SimpleNamespace(**values)


def fake_agent():
    return SimpleNamespace(Rejected=protocol.PairingRejected,
                           remove_from_connection=Mock())


class ProtocolTests(unittest.TestCase):
    def gate(self):
        gate = protocol.PairingGate(PHONE, CAR, CHANNEL)
        gate.begin(CAR, [2])
        gate.opened(b"\x08\x00")
        gate.preparation(b"\x08\x00")
        return gate

    def test_descriptor_uses_current_channel_and_accepts_packed_or_unpacked_methods(self):
        for methods in (b"\x10\x01\x10\x02", b"\x12\x02\x01\x02"):
            with self.subTest(methods=methods):
                self.assertEqual(protocol.current_bluetooth_descriptor(
                    descriptor(methods=methods), CAR), (CHANNEL, CAR, [1, 2]))

    def test_no_bluetooth_is_a_skip(self):
        self.assertIsNone(protocol.current_bluetooth_descriptor(b"\x0a\x02\x08\x01", CAR))

    def test_descriptor_rejects_wrong_peer_bad_channel_and_unsupported_method(self):
        for body in (descriptor(address=OTHER), descriptor(channel=0),
                     descriptor(methods=b"\x10\x01"), descriptor() + descriptor(),
                     descriptor()[:-1], descriptor(methods=b"\x12\x01\x80")):
            with self.subTest(body=body), self.assertRaises(protocol.PairingRejected):
                protocol.current_bluetooth_descriptor(body, CAR)

    def test_open_and_pair_request_use_advertised_channel_and_phone_address(self):
        gate = protocol.PairingGate(PHONE, CAR, CHANNEL)
        self.assertEqual(gate.begin(CAR, [2]), bytes([1, CHANNEL, 1, 0, 7, 8, 0, 16, CHANNEL]))
        self.assertEqual(gate.opened(b"\x08\x00"),
                         bytes([1, CHANNEL, 0, 0x80, 1, 10, 17]) + PHONE.encode() + b"\x10\x02")

    def test_rejected_channel_and_preparation_never_become_ready(self):
        for status in (-1, 1, 2, 0x100000000):
            gate = protocol.PairingGate(PHONE, CAR, CHANNEL)
            gate.begin(CAR, [2])
            with self.subTest(status=status), self.assertRaises(protocol.PairingRejected):
                gate.opened(protocol.integer(1, status))
            self.assertFalse(gate.channel_opened)
        gate = protocol.PairingGate(PHONE, CAR, CHANNEL)
        gate.begin(CAR, [2])
        gate.opened(b"\x08\x00")
        with self.assertRaises(protocol.PairingRejected):
            gate.preparation(b"\x08\x01")
        self.assertFalse(gate.prepared)

    def test_modern_response_optional_false_and_strict_types(self):
        self.assertEqual(protocol.phone_pairing_response(b"\x08\x00"), (0, False, True))
        self.assertEqual(protocol.phone_pairing_response(b"\x08\x00\x10\x01"), (0, True, True))
        for body in (b"\x08\x00\x08\x00", b"\x08\x00\x10\x02", b"\x0a\x00",
                     protocol.integer(1, 1 << 32), b"\x08\x80"):
            with self.subTest(body=body), self.assertRaises(protocol.PairingRejected):
                protocol.phone_pairing_response(body)

    def test_numeric_match_does_not_itself_claim_callback_success(self):
        gate = self.gate()
        gate.authentication(protocol.text(1, "123456"))
        self.assertTrue(gate.numeric_confirmation(CAR, CHALLENGE))
        self.assertFalse(gate.confirmed)
        with self.assertRaises(protocol.PairingRejected):
            gate.auth_result()
        gate.confirmed = True  # Only the successful D-Bus reply may do this.
        self.assertFalse(gate.bonded)
        self.assertEqual(gate.auth_result(), bytes([1, CHANNEL, 0, 0x80, 4, 8, 0]))

    def test_changing_challenge_and_reused_session_are_rejected(self):
        gate = self.gate()
        gate.authentication(protocol.text(1, "123456"))
        with self.assertRaises(protocol.PairingRejected):
            gate.authentication(protocol.text(1, "654321"))
        gate.close()
        self.assertIsNone(gate.auth_data)
        with self.assertRaises(protocol.PairingRejected):
            gate.begin(CAR, [2])
        with self.assertRaises(protocol.PairingRejected):
            gate.numeric_confirmation(CAR, CHALLENGE)

    def test_fetch_descriptor_waits_for_discovery_and_ignores_forwarded_messages(self):
        sock = FakeSocket()
        packets = [message(0x0008, b"\x08\x00"), b"\xff", b"\x01",
                   message(0x8002, b"\x08\x00"), descriptor()]
        with patch.object(protocol, "receive", side_effect=packets), patch.object(protocol.time, "sleep"):
            result = protocol.fetch_descriptor(sock, protocol.time.monotonic() + 10, CAR)
        self.assertEqual(result, (CHANNEL, CAR, [2]))
        self.assertEqual(sock.sent, [b"\x00\x00\x00", b"\x00\x00\x00", b"\x02\x00\x00"])


class ControllerTests(unittest.TestCase):
    def setUp(self):
        guard = patch.object(phone, "socket_disconnected", side_effect=lambda sock: sock.closed)
        guard.start()
        self.addCleanup(guard.stop)

    def controller(self):
        controller = phone.Controller(arguments(), SimpleNamespace(Boolean=bool), FakeGLib(), sock=FakeSocket())
        controller.gate = protocol.PairingGate(PHONE, CAR, CHANNEL)
        controller.gate.begin(CAR, [2])
        controller.gate.opened(b"\x08\x00")
        controller.gate.preparation(b"\x08\x00")
        controller.agent = fake_agent()
        controller.device_path = DEVICE
        controller.device_properties = {"Address": CAR, "Paired": False, "Bonded": False}
        return controller

    def authenticate(self, controller):
        controller.gate.authentication(protocol.text(1, "123456"))

    def test_auth_result_releases_hu_waiting_for_auth_before_bond_completion(self):
        """A HU requiring 0x8004 before it confirms SSP must not deadlock."""
        controller = self.controller()
        events = []
        pairing = {}
        def pair(**callbacks):
            events.append("pair_requested")
            pairing.update(callbacks)
        controller.device = SimpleNamespace(Pair=pair, ConnectProfile=Mock())
        controller.refresh_device = lambda callback: callback()
        def hu_receive(data):
            self.assertEqual(data, bytes([1, CHANNEL, 0, 0x80, 4, 8, 0]))
            self.assertTrue(controller.gate.confirmed)
            self.assertFalse(controller.gate.bonded)
            self.assertFalse(controller.device_properties["Paired"])
            events.append("auth_result")
            controller.device_properties.update(Paired=True, Bonded=True, UUIDs=[phone.HFP_HF_UUID])
            pairing["reply_handler"]()
            events.append("bond_completed")
        controller.sock.on_send = hu_receive
        controller.maybe_pair()
        self.authenticate(controller)
        controller.confirm(DEVICE, CHALLENGE, lambda: events.append("ssp_reply"),
                           lambda error: self.fail("matching SSP was rejected"))
        self.assertEqual(events, ["pair_requested", "ssp_reply", "auth_result", "bond_completed"])
        self.assertTrue(controller.auth_result_sent)
        self.assertTrue(controller.report["persisted_bond_confirmed"])
        self.assertFalse(controller.report["hfp_transport_connected"])
        self.assertEqual(controller.report["aa_projection_ready"], "NOT_TESTED")
        self.assertNotIn(str(CHALLENGE), json.dumps(controller.report))

    def test_challenge_may_arrive_before_or_after_bluez_confirmation(self):
        for challenge_first in (True, False):
            with self.subTest(challenge_first=challenge_first):
                controller = self.controller()
                outcomes = []
                if challenge_first:
                    self.authenticate(controller)
                controller.confirm(DEVICE, CHALLENGE, lambda: outcomes.append("reply"),
                                   lambda error: outcomes.append("error"))
                if not challenge_first:
                    self.assertEqual(outcomes, [])
                    self.assertEqual(controller.sock.sent, [])
                    self.authenticate(controller)
                    controller.try_confirmation()
                controller.try_confirmation()
                self.assertEqual(outcomes, ["reply"])
                self.assertEqual(controller.sock.sent, [bytes([1, CHANNEL, 0, 0x80, 4, 8, 0])])
                self.assertFalse(controller.report["paired"])

    def test_mismatch_wrong_peer_and_expired_session_reject_without_auth_success(self):
        for fault in ("key", "path", "address", "expired", "failed"):
            with self.subTest(fault=fault):
                controller = self.controller()
                self.authenticate(controller)
                outcomes = []
                if fault == "address":
                    controller.device_properties["Address"] = OTHER
                if fault == "expired":
                    controller.gate.expires = 0
                if fault == "failed":
                    controller.fail("session ended")
                controller.confirm(DEVICE + "other" if fault == "path" else DEVICE,
                                   CHALLENGE + 1 if fault == "key" else CHALLENGE,
                                   lambda: outcomes.append("reply"), lambda error: outcomes.append("error"))
                controller.cleanup()
                self.assertEqual(outcomes, ["error"])
                self.assertEqual(controller.sock.sent, [])
                self.assertFalse(controller.gate.confirmed)
                self.assertIsNone(controller.gate.auth_data)

    def test_failed_dbus_confirmation_reply_cannot_send_auth_success(self):
        controller = self.controller()
        self.authenticate(controller)
        reply = Mock(side_effect=ConnectionError("private D-Bus disconnected"))
        controller.confirm(DEVICE, CHALLENGE, reply, Mock())
        reply.assert_called_once_with()
        self.assertFalse(controller.gate.confirmed)
        self.assertFalse(controller.auth_result_sent)
        self.assertEqual(controller.sock.sent, [])
        self.assertTrue(controller.finished)
        controller.cleanup()
        self.assertTrue(controller.sock.closed)

    def test_missing_challenge_times_out_then_rejects_pending_confirmation_once(self):
        controller = self.controller()
        outcomes = []
        controller.confirm(DEVICE, CHALLENGE, lambda: outcomes.append("reply"),
                           lambda error: outcomes.append("error"))
        key, reply, error, _ = controller.pending_confirmation
        controller.pending_confirmation = (key, reply, error, 0)
        self.assertFalse(controller.tick())
        controller.cleanup()
        self.assertEqual(outcomes, ["error"])
        self.assertEqual(controller.sock.sent, [])

    def test_disconnect_invalidates_pending_authentication(self):
        for packet in (b"", None):
            controller = self.controller()
            outcomes = []
            controller.confirm(DEVICE, CHALLENGE, lambda: outcomes.append("reply"),
                               lambda error: outcomes.append("error"))
            if packet is not None:
                controller.sock.incoming.append(packet)
            self.assertFalse(controller.aa_ready(0, FakeGLib.IO_HUP if packet is None else FakeGLib.IO_IN))
            controller.cleanup()
            self.assertEqual(outcomes, ["error"])
            self.assertFalse(controller.gate.active)
            self.assertEqual(controller.sock.sent, [])

    def test_disconnect_between_pending_confirmation_and_auth_rejects_without_reply(self):
        controller = self.controller()
        outcomes = []
        controller.confirm(DEVICE, CHALLENGE, lambda: outcomes.append("reply"),
                           lambda error: outcomes.append("error"))
        controller.sock.closed = True
        self.authenticate(controller)
        controller.guarded(controller.try_confirmation)
        controller.cleanup()
        self.assertEqual(outcomes, ["error"])
        self.assertFalse(controller.gate.confirmed)
        self.assertEqual(controller.sock.sent, [])

    def test_auth_on_other_channel_does_not_confirm_current_session(self):
        controller = self.controller()
        controller.sock.incoming.append(message(0x8003, protocol.text(1, "123456"), channel=CHANNEL + 1))
        self.assertTrue(controller.aa_ready(0, FakeGLib.IO_IN))
        self.assertIsNone(controller.gate.auth_data)
        self.assertEqual(controller.sock.sent, [])

    def test_paired_without_bonded_never_claims_persisted_bond_or_hfp(self):
        controller = self.controller()
        controller.device_properties.update(Paired=True, Bonded=False, Connected=True, ServicesResolved=True)
        controller.pair_finished = True
        controller.maybe_bonded()
        self.assertFalse(controller.gate.bonded)
        self.assertFalse(controller.report["persisted_bond_confirmed"])
        with self.assertRaises(protocol.PairingRejected):
            controller.hfp_verified()
        self.assertFalse(controller.report["hfp_transport_connected"])

    def test_car_existing_bond_claim_must_match_local_bluez_state(self):
        controller = self.controller()
        controller.gate.prepared = False
        controller.sock.incoming.append(message(0x8002, b"\x08\x00\x10\x01"))
        self.assertFalse(controller.aa_ready(0, FakeGLib.IO_IN))
        self.assertFalse(controller.gate.prepared)
        self.assertFalse(controller.report["pairing_diagnostic_passed"])

    def test_preexisting_verified_bond_connects_remote_handsfree_uuid_without_repair(self):
        controller = self.controller()
        controller.gate.previously_paired = True
        controller.device_properties.update(Paired=True, Bonded=True, ServicesResolved=False,
                                            UUIDs=[phone.HFP_HF_UUID])
        controller.device = SimpleNamespace(Pair=Mock(), ConnectProfile=Mock())
        controller.maybe_pair()
        controller.device.Pair.assert_not_called()
        args, kwargs = controller.device.ConnectProfile.call_args
        self.assertEqual(args, ("0000111e-0000-1000-8000-00805f9b34fb",))
        self.assertEqual(kwargs["signature"], "s")
        self.assertFalse(controller.report["hfp_transport_connected"])
        self.assertEqual(controller.sock.sent, [])

    def test_hfp_completion_after_aa_disconnect_cannot_report_current_success(self):
        controller = self.controller()
        controller.device_properties.update(Paired=True, Bonded=True, Connected=True, ServicesResolved=True)
        controller.gate.previously_paired = True
        controller.sock.closed = True
        controller.guarded(controller.hfp_verified)
        self.assertFalse(controller.report["hfp_transport_connected"])
        self.assertFalse(controller.report["pairing_diagnostic_passed"])

    def test_late_pair_and_hfp_callbacks_after_cleanup_do_nothing(self):
        controller = self.controller()
        controller.refresh_device = Mock()
        controller.cleanup()
        controller.pair_returned()
        controller.hfp_returned()
        controller.hfp_verified()
        controller.refresh_device.assert_not_called()
        self.assertFalse(controller.report["hfp_transport_connected"])

    def test_local_bond_that_car_denied_is_not_silently_removed_or_replaced(self):
        controller = self.controller()
        controller.device_properties.update(Paired=True, Bonded=True)
        controller.device = Mock()
        with self.assertRaises(protocol.PairingRejected):
            controller.maybe_pair()
        controller.device.Pair.assert_not_called()

    def test_cleanup_restores_only_owned_mutations_and_preserves_shared_socket(self):
        controller = self.controller()
        controller.adapter_initial = {"Discoverable": False, "Pairable": True}
        controller.adapter_changed = {"Discoverable"}
        controller.adapter_properties = SimpleNamespace(Set=Mock())
        controller.device = SimpleNamespace(CancelPairing=Mock())
        controller.pair_issued = True
        controller.sources = [7, 8]
        controller.cleanup(keep_socket=True)
        controller.cleanup()
        controller.device.CancelPairing.assert_called_once_with(timeout=2)
        controller.adapter_properties.Set.assert_called_once_with(
            "org.bluez.Adapter1", "Discoverable", False, signature="ssv", timeout=2)
        self.assertEqual(controller.GLib.removed, [7, 8])
        self.assertFalse(controller.sock.closed)
        self.assertTrue(controller.closed)

    def test_cleanup_never_cancels_another_app_pair_or_sets_untouched_properties(self):
        controller = self.controller()
        controller.adapter_initial = {"Discoverable": False, "Pairable": True}
        controller.adapter_properties = SimpleNamespace(Set=Mock())
        controller.device = SimpleNamespace(CancelPairing=Mock())
        controller.pair_issued = True
        controller.pair_error(SimpleNamespace(get_dbus_name=lambda: "org.bluez.Error.InProgress"))
        controller.cleanup()
        controller.device.CancelPairing.assert_not_called()
        controller.adapter_properties.Set.assert_not_called()

    def test_applied_but_unanswered_set_is_restored(self):
        controller = self.controller()
        controller.adapter_initial = {"Discoverable": False, "Pairable": True}
        controller.adapter_properties = SimpleNamespace(Set=Mock(side_effect=[TimeoutError(), None]))
        with self.assertRaises(TimeoutError):
            controller.set_adapter("Discoverable", True)
        controller.cleanup()
        self.assertEqual([call.args[1:] for call in controller.adapter_properties.Set.call_args_list],
                         [("Discoverable", True), ("Discoverable", False)])

    def test_cleanup_continues_when_rejecting_pending_confirmation_fails(self):
        controller = self.controller()
        controller.pending_confirmation = (0, Mock(), Mock(side_effect=ConnectionError()), controller.deadline)
        controller.pair_issued = True
        controller.device = SimpleNamespace(CancelPairing=Mock())
        controller.cleanup()
        controller.device.CancelPairing.assert_called_once()
        self.assertTrue(controller.sock.closed)
        self.assertFalse(controller.report["cleanup_completed"])
        self.assertFalse(controller.report["pairing_diagnostic_passed"])

    def test_cleanup_rejects_reentrant_confirmation(self):
        controller = self.controller()
        self.authenticate(controller)
        outcomes = []
        controller.device = SimpleNamespace(CancelPairing=lambda **kwargs: controller.confirm(
            DEVICE, CHALLENGE, lambda: outcomes.append("reply"), lambda error: outcomes.append("error")))
        controller.pair_issued = True
        controller.cleanup()
        self.assertEqual(outcomes, ["error"])
        self.assertEqual(controller.sock.sent, [])


class PreflightTests(unittest.TestCase):
    def setUp(self):
        guard = patch.object(phone, "socket_disconnected", side_effect=lambda sock: sock.closed)
        guard.start()
        self.addCleanup(guard.stop)

    def test_no_bt_session_does_not_open_system_bus_or_mutate_bluez(self):
        dbus = SimpleNamespace(SystemBus=Mock(side_effect=AssertionError("no Bluetooth on this HU")))
        controller = phone.Controller(arguments(), dbus, FakeGLib(), sock=FakeSocket())
        with patch.object(phone, "fetch_descriptor", return_value=None) as fetch:
            report = controller.run(keep_socket=True)
        fetch.assert_called_once_with(controller.sock, controller.deadline, CAR)
        dbus.SystemBus.assert_not_called()
        self.assertTrue(report["skipped"])
        self.assertEqual(report["stages"]["descriptor"], "NO_BLUETOOTH_SERVICE")
        self.assertTrue(report["cleanup_completed"])
        self.assertFalse(controller.sock.closed)

    def test_untrusted_descriptor_is_rejected_before_any_system_bus(self):
        dbus = SimpleNamespace(SystemBus=Mock())
        controller = phone.Controller(arguments(), dbus, FakeGLib(), sock=FakeSocket(),
                                      descriptor=(CHANNEL, OTHER, [2]))
        report = controller.run()
        dbus.SystemBus.assert_not_called()
        self.assertIn("outside", report["error"])
        self.assertTrue(controller.sock.closed)

    def test_valid_preflight_uses_private_bus_explicit_signatures_and_current_channel(self):
        operations = []
        ready = {"Address": PHONE, "Powered": True, "Pairable": False,
                 "Discoverable": False, "UUIDs": [protocol.HFP_AG_UUID]}
        props = SimpleNamespace(
            GetAll=Mock(side_effect=[{**ready, "UUIDs": []}, ready]),
            Set=lambda *args, **kwargs: operations.append(("set", args, kwargs)))
        manager = SimpleNamespace(GetManagedObjects=lambda **kwargs: {
            DEVICE: {"org.bluez.Device1": {"Address": CAR, "Adapter": ADAPTER}}})
        agents = SimpleNamespace(
            RegisterAgent=lambda *args, **kwargs: operations.append(("register", args, kwargs)),
            UnregisterAgent=lambda *args, **kwargs: operations.append(("unregister", args, kwargs)))
        bus = SimpleNamespace(get_object=lambda name, path, **kwargs: path,
                              add_signal_receiver=Mock(), close=Mock())
        def interface(proxy, name):
            return {"org.freedesktop.DBus.Properties": props,
                    "org.freedesktop.DBus.ObjectManager": manager,
                    "org.bluez.AgentManager1": agents,
                    "org.bluez.Adapter1": SimpleNamespace(),
                    "org.bluez.Device1": SimpleNamespace()}[name]
        dbus = SimpleNamespace(SystemBus=Mock(return_value=bus), Interface=interface, Boolean=bool)
        controller = phone.Controller(arguments(hfp_wait_seconds=1), dbus, FakeGLib(), sock=FakeSocket(),
                                      descriptor=(CHANNEL, CAR, [2]))
        with patch.object(phone, "make_agent", return_value=fake_agent()), patch.object(phone.time, "sleep"):
            controller.preflight()
        self.assertEqual(props.GetAll.call_count, 2)
        dbus.SystemBus.assert_called_once_with(private=True)
        self.assertEqual(controller.gate.channel, CHANNEL)
        self.assertEqual(controller.sock.sent, [bytes([1, CHANNEL, 1, 0, 7, 8, 0, 16, CHANNEL])])
        self.assertEqual(operations[0][0:2], ("register", (phone.AGENT_PATH, "DisplayYesNo")))
        self.assertEqual(operations[0][2]["signature"], "os")
        self.assertEqual(operations[1][1][1:], ("Pairable", True))
        self.assertEqual(operations[1][2]["signature"], "ssv")
        controller.cleanup()
        self.assertEqual([op[0] for op in operations], ["register", "set", "unregister", "set"])
        self.assertEqual(operations[2][2]["signature"], "o")
        self.assertEqual(operations[3][1][1:], ("Pairable", False))
        bus.close.assert_called_once()

    def test_hfp_registration_deadline_fails_before_any_bluez_mutations(self):
        props = SimpleNamespace(GetAll=Mock(return_value={
            "Address": PHONE, "Powered": True, "Pairable": False, "Discoverable": False, "UUIDs": []}),
            Set=Mock())
        bus = SimpleNamespace(get_object=Mock(), close=Mock())
        dbus = SimpleNamespace(SystemBus=Mock(return_value=bus), Interface=Mock(return_value=props))
        controller = phone.Controller(arguments(hfp_wait_seconds=0), dbus, FakeGLib(), sock=FakeSocket(),
                                      descriptor=(CHANNEL, CAR, [2]))
        with patch.object(phone, "make_agent") as make_agent:
            report = controller.run()
        self.assertIn("registration timed out", report["error"])
        props.Set.assert_not_called()
        make_agent.assert_not_called()
        self.assertEqual(controller.sock.sent, [])
        bus.close.assert_called_once()


class SessionTests(unittest.TestCase):
    def test_socket_liveness_does_not_consume_queued_aa_data(self):
        local, remote = socket.socketpair()
        self.addCleanup(local.close)
        self.addCleanup(remote.close)
        self.assertFalse(phone.socket_disconnected(local))
        remote.sendall(b"queued AA frame")
        self.assertFalse(phone.socket_disconnected(local))
        self.assertEqual(local.recv(15), b"queued AA frame")
        remote.close()
        self.assertTrue(phone.socket_disconnected(local))

    def test_guard_persists_attempt_before_restart_and_allows_only_new_session(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sessions.json"
            self.assertTrue(phone.SessionGuard(path).claim("first-session"))
            self.assertFalse(phone.SessionGuard(path).claim("first-session"))
            self.assertTrue(phone.SessionGuard(path).claim("second-session"))
            self.assertFalse(phone.SessionGuard(path).claim("first-session"))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_corrupt_guard_fails_closed_instead_of_replaying_pairing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sessions.json"
            for invalid in ("not json", "{}", '{"sessions":[1]}'):
                path.write_text(invalid)
                with self.subTest(invalid=invalid), self.assertRaises(protocol.PairingRejected):
                    phone.SessionGuard(path).claim("session")
                self.assertEqual(path.read_text(), invalid)

    def test_configuration_requires_one_private_allowlisted_peer_and_bounded_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bluetooth.conf"
            path.write_text("[bluetooth]\nheadunit_address=" + CAR.lower() + "\n")
            args = phone.load_config(path)
            self.assertEqual(args.headunit_address, CAR)
            self.assertFalse(args.discoverable)
            for value in ("headunit_address=*", "headunit_address=" + CAR + "\nduration=999",
                          "headunit_address=" + CAR + "\naa_socket=relative.sock"):
                path.write_text("[bluetooth]\n" + value + "\n")
                with self.subTest(value=value), self.assertRaises(protocol.PairingRejected):
                    phone.load_config(path)

    def test_watcher_no_bt_path_never_imports_dbus_and_holds_same_session(self):
        sock = FakeSocket()
        sock.settimeout = Mock()
        sock.connect = Mock()
        real_import = builtins.__import__
        def refuse_bluetooth_import(name, *args, **kwargs):
            if name == "dbus" or name.startswith("dbus.") or name.startswith("gi."):
                raise AssertionError("no-Bluetooth head unit accessed Bluetooth runtime")
            return real_import(name, *args, **kwargs)
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(phone.socket, "socket", return_value=sock), \
             patch.object(phone, "session_identity", return_value="same-session"), \
             patch.object(phone, "fetch_descriptor", return_value=None) as fetch, \
             patch.object(phone, "Controller") as controller, \
             patch.object(phone, "hold_until_disconnect", side_effect=KeyboardInterrupt) as hold, \
             patch("builtins.print"), patch("builtins.__import__", side_effect=refuse_bluetooth_import):
            state = Path(directory) / "sessions.json"
            for attempt in range(2):
                with self.assertRaises(KeyboardInterrupt):
                    phone.watch(arguments(), state)
            self.assertEqual(fetch.call_count, 1)  # Persisted guard survives worker restarts.
            self.assertEqual(hold.call_count, 2)
            controller.assert_not_called()
        self.assertTrue(sock.closed)


class AgentAuthorizationTests(unittest.TestCase):
    def agent(self, **properties):
        class Object:
            def __init__(self, *args):
                pass
        fake_dbus = ModuleType("dbus")
        fake_service = ModuleType("dbus.service")
        fake_service.Object = Object
        fake_service.method = lambda *args, **kwargs: lambda function: function
        fake_dbus.service = fake_service
        fake_dbus.DBusException = type("DBusException", (Exception,), {})
        controller = SimpleNamespace(bus=object(), verify_device=Mock(return_value=CAR),
                                     device_properties={"Paired": True, "Bonded": True, **properties},
                                     gate=SimpleNamespace(confirmed=True, previously_paired=False))
        with patch.dict(sys.modules, {"dbus": fake_dbus, "dbus.service": fake_service}):
            agent = phone.make_agent(controller, fake_dbus)
        return agent, controller

    def test_service_authorization_is_only_current_verified_local_hfp_gateway(self):
        agent, controller = self.agent()
        agent.AuthorizeService(DEVICE, protocol.HFP_AG_UUID)
        controller.verify_device.assert_called_once_with(DEVICE)
        for uuid in (phone.HFP_HF_UUID, "0000110b-0000-1000-8000-00805f9b34fb"):
            with self.subTest(uuid=uuid), self.assertRaises(agent.Rejected):
                agent.AuthorizeService(DEVICE, uuid)
        controller.verify_device.side_effect = protocol.PairingRejected("wrong current car")
        with self.assertRaises(agent.Rejected):
            agent.AuthorizeService(DEVICE + "other", protocol.HFP_AG_UUID)

    def test_unbonded_or_unconfirmed_device_cannot_authorize_hfp(self):
        for fault in ("bond", "confirmation"):
            agent, controller = self.agent()
            if fault == "bond":
                controller.device_properties["Bonded"] = False
            else:
                controller.gate.confirmed = False
            with self.subTest(fault=fault), self.assertRaises(agent.Rejected):
                agent.AuthorizeService(DEVICE, protocol.HFP_AG_UUID)

    def test_blind_and_unadvertised_pairing_methods_are_never_accepted(self):
        agent, _ = self.agent()
        for method in (agent.RequestPinCode, agent.RequestPasskey, agent.RequestAuthorization):
            with self.subTest(method=method.__name__), self.assertRaises(agent.Rejected):
                method(DEVICE)


if __name__ == "__main__":
    unittest.main()
