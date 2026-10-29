#!/usr/bin/env python3
"""One restricted Bluetooth pairing attempt for each current wired AA session."""
from __future__ import annotations

import argparse
import configparser
import hashlib
import os
import select
import struct
from types import SimpleNamespace
from datetime import datetime, timezone
import json
from pathlib import Path
import signal
import socket
import time

from bluetooth_protocol import (HFP_AG_UUID, MAC_PATTERN, PairingGate,
                                PairingRejected, integer, one, read_fields,
                                protocol_int32, fetch_descriptor,
                                phone_pairing_response, send)

HFP_HF_UUID = "0000111e-0000-1000-8000-00805f9b34fb"
AGENT_PATH = "/airplay_aa/phone_pairing"


def bond_state(properties):
    """Distinguish encrypted pairing from stored bonding information."""
    paired = bool(properties.get("Paired", False))
    bonded = bool(properties["Bonded"]) if "Bonded" in properties else None
    return paired, bonded, paired and bonded is not False


def safe_error(error):
    if hasattr(error, "get_dbus_name"):
        return error.get_dbus_name()
    return str(error) if isinstance(error, (PairingRejected, TimeoutError)) else type(error).__name__


class Controller:
    def __init__(self, args, dbus, GLib, sock=None, descriptor=None):
        self.args, self.dbus, self.GLib = args, dbus, GLib
        self.bus = None
        self.sock = sock
        self.descriptor = descriptor
        self.sources = []
        self.agent = None
        self.agent_registered = False
        self.adapter = None
        self.adapter_properties = None
        self.adapter_initial = None
        self.adapter_changed = set()
        self.device_path = None
        self.device_properties = {}
        self.device = None
        self.gate = None
        self.pending_confirmation = None
        self.scan_owned = False
        self.scan_stopping = False
        self.scan_deadline = 0
        self.pair_pending = False
        self.pair_issued = False
        self.pair_finished = False
        self.hfp_requested = False
        self.auth_result_sent = False
        self.finished = False
        self.closed = False
        self.deadline = time.monotonic() + args.duration
        self.loop = GLib.MainLoop()
        self.report = {
            "mode": "restricted-phone-bluetooth", "created_at": datetime.now(timezone.utc).isoformat(),
            "response_schema": "PHONE Status field1 / optional already_paired field2",
            "paired": False, "bonded": None, "persisted_bond_confirmed": False,
            "hfp_transport_connected": False, "hfp_service_level_ready": "UNKNOWN",
            "aa_projection_ready": "NOT_TESTED", "pairing_diagnostic_passed": False,
            "default_agent_requested": False, "default_agent_selection": "UNKNOWN_BlueZ_may_select_if_none_exists",
            "events": [], "cleanup_errors": [],
            "stages": {name: "UNKNOWN" for name in
                       ("descriptor", "channel_open", "preparation", "comparison", "bond", "hfp_transport")},
        }

    def event(self, name, **values):
        # Only explicit nonsecret metadata reaches the report.
        self.report["events"].append({"elapsed_seconds": round(self.args.duration - max(0, self.deadline - time.monotonic()), 3),
                                      "event": name, **values})

    def fail(self, message):
        if not self.finished and not self.closed:
            if self.gate:
                self.gate.close()
            self.report["error"] = message
            self.event("attempt_failed", reason=message)
            self.finished = True
            self.loop.quit()

    def guarded(self, function, *args):
        if self.finished or self.closed:
            return
        try:
            function(*args)
        except Exception as error:
            self.fail(safe_error(error))

    def preflight(self):
        if self.sock is None:
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
            self.sock.settimeout(2)
            self.sock.connect(self.args.aa_socket)
        if self.descriptor is None:
            self.descriptor = fetch_descriptor(self.sock, self.deadline, self.args.headunit_address)
        if self.descriptor is None:
            self.report["skipped"] = True
            self.report["stages"]["descriptor"] = "NO_BLUETOOTH_SERVICE"
            self.event("no_bluetooth_service_skipped")
            self.finished = True
            return
        channel, car_address, methods = self.descriptor
        if car_address != self.args.headunit_address or not 1 <= channel <= 254 or 2 not in methods:
            raise PairingRejected("current descriptor is outside the configured car policy")
        self.bus = self.dbus.SystemBus(private=True)
        proxy = self.bus.get_object("org.bluez", self.args.adapter, introspect=False)
        self.adapter = self.dbus.Interface(proxy, "org.bluez.Adapter1")
        self.adapter_properties = self.dbus.Interface(proxy, "org.freedesktop.DBus.Properties")
        self.adapter_initial = dict(self.adapter_properties.GetAll("org.bluez.Adapter1", timeout=2))
        phone_address = str(self.adapter_initial["Address"]).upper()
        if not MAC_PATTERN.fullmatch(phone_address):
            raise PairingRejected("invalid current phone adapter address")
        if not bool(self.adapter_initial["Powered"]):
            raise PairingRejected("phone adapter is powered off; this diagnostic never powers it on")
        hfp_deadline = min(self.deadline, time.monotonic() + self.args.hfp_wait_seconds)
        while HFP_AG_UUID not in [str(value).lower() for value in self.adapter_initial.get("UUIDs", [])]:
            if time.monotonic() >= hfp_deadline:
                raise PairingRejected("phone HFP Audio Gateway registration timed out")
            if socket_disconnected(self.sock):
                raise PairingRejected("AA disconnected while waiting for phone HFP registration")
            time.sleep(.1)
            self.adapter_initial = dict(self.adapter_properties.GetAll("org.bluez.Adapter1", timeout=2))
        if not bool(self.adapter_initial["Powered"]) or socket_disconnected(self.sock):
            raise PairingRejected("phone Bluetooth or current AA connection became unavailable")
        self.report["adapter_initial"] = {name.lower(): bool(self.adapter_initial[name])
                                          for name in ("Powered", "Pairable", "Discoverable")}
        self.report["hfp_ag_registered"] = True
        self.report["channel"], self.report["advertised_methods"] = channel, methods
        self.report["stages"]["descriptor"] = "PASSED"
        self.gate = PairingGate(phone_address, car_mac=car_address,
                                channel=channel, timeout=max(.1, self.deadline - time.monotonic()))
        self.open_request = self.gate.begin(car_address, methods)
        self.gate.expires = self.deadline
        self.bus.add_signal_receiver(self.interfaces_added, dbus_interface="org.freedesktop.DBus.ObjectManager",
                                     signal_name="InterfacesAdded", bus_name="org.bluez")
        self.bus.add_signal_receiver(self.properties_changed, dbus_interface="org.freedesktop.DBus.Properties",
                                     signal_name="PropertiesChanged", path_keyword="path", bus_name="org.bluez")
        manager = self.dbus.Interface(self.bus.get_object("org.bluez", "/", introspect=False),
                                       "org.freedesktop.DBus.ObjectManager")
        for path, interfaces in manager.GetManagedObjects(timeout=3).items():
            self.remember_device(str(path), interfaces.get("org.bluez.Device1", {}))
        self.agent = make_agent(self, self.dbus)
        agent_manager = self.dbus.Interface(self.bus.get_object("org.bluez", "/org/bluez", introspect=False),
                                             "org.bluez.AgentManager1")
        self.gate.check(self.args.headunit_address)
        self.agent_registered = True  # NoReply could follow a successful registration.
        agent_manager.RegisterAgent(AGENT_PATH, "DisplayYesNo", signature="os", timeout=2)
        self.event("restricted_application_agent_registered")
        # No RequestDefaultAgent is made. BlueZ may automatically select this
        # agent when none exists; unregister removes it again. Its own Pair()
        # uses this same bus identity so confirmation callbacks reach it.
        if not bool(self.adapter_initial["Pairable"]):
            self.set_adapter("Pairable", True)
        if self.args.discoverable and not bool(self.adapter_initial["Discoverable"]):
            self.set_adapter("Discoverable", True)
        if self.device_path is None:
            self.gate.check(self.args.headunit_address)
            filters = self.dbus.Dictionary({"Transport": self.dbus.String("bredr"),
                                            "Pattern": self.dbus.String(car_address),
                                            "DuplicateData": self.dbus.Boolean(False)}, signature="sv")
            self.adapter.SetDiscoveryFilter(filters, timeout=2)
            self.scan_owned = True  # Also release an applied-but-unanswered request.
            self.adapter.StartDiscovery(timeout=3)
            self.scan_deadline = min(self.deadline, time.monotonic() + self.args.scan_seconds)
            self.event("bounded_car_discovery_started")
        self.sock.setblocking(False)
        self.sources.append(self.GLib.io_add_watch(self.sock.fileno(), self.GLib.IO_IN | self.GLib.IO_HUP | self.GLib.IO_ERR | self.GLib.IO_NVAL,
                               self.aa_ready))
        self.sources.append(self.GLib.timeout_add(100, self.tick))
        self.write(self.open_request)
        self.phase_deadline = min(self.deadline, time.monotonic() + 10)
        self.event("bluetooth_channel_open_requested")

    def set_adapter(self, name, value):
        self.gate.check(self.args.headunit_address)
        # Mark before the call: a timeout may happen after the daemon applied
        # the property. Only this post-verified-preflight path adds mutations.
        self.adapter_changed.add(name)
        self.adapter_properties.Set("org.bluez.Adapter1", name, self.dbus.Boolean(value), signature="ssv", timeout=2)

    def write(self, payload):
        # Small SOCK_SEQPACKET records must remain atomic. Nonblocking EAGAIN
        # fails this bounded diagnostic; no repeated protocol replay is allowed.
        send(self.sock, payload)

    def remember_device(self, path, properties):
        if not path.startswith(self.args.adapter + "/dev_"):
            return
        if str(properties.get("Address", "")).upper() != self.args.headunit_address:
            return
        if "Adapter" in properties and str(properties["Adapter"]) != self.args.adapter:
            raise PairingRejected("car object belongs to another adapter")
        if self.device_path is not None and self.device_path != path:
            raise PairingRejected("multiple BlueZ objects match the pinned car")
        self.device_path = path
        self.device_properties = dict(properties)
        self.device = self.dbus.Interface(self.bus.get_object("org.bluez", path, introspect=False), "org.bluez.Device1")

    def interfaces_added(self, path, interfaces):
        def update():
            self.remember_device(str(path), interfaces.get("org.bluez.Device1", {}))
            self.maybe_pair()
        self.guarded(update)

    def properties_changed(self, interface, changed, invalidated, path=None):
        def update():
            if str(path) == self.args.adapter and str(interface) == "org.bluez.Adapter1":
                if "Powered" in changed and not bool(changed["Powered"]):
                    raise PairingRejected("phone Bluetooth adapter powered off during attempt")
            if str(path) == self.device_path and str(interface) == "org.bluez.Device1":
                self.device_properties.update(changed)
                for name in invalidated:
                    self.device_properties.pop(str(name), None)
                self.maybe_bonded()
        self.guarded(update)

    def aa_ready(self, descriptor, conditions):
        if self.finished or self.closed:
            return False
        if conditions & (self.GLib.IO_HUP | self.GLib.IO_ERR | self.GLib.IO_NVAL):
            self.fail("AA client disconnected; pairing session invalidated")
            return False
        try:
            packet = self.sock.recv(256 * 1024)
            if not packet:
                raise PairingRejected("AA client disconnected")
            if len(packet) < 4:
                raise PairingRejected("truncated AA channel message")
            if packet[0] != self.gate.channel:
                return True
            message, body = int.from_bytes(packet[2:4], "big"), packet[4:]
            self.event("aa_bluetooth_message", message="0x%04x" % message)
            if message == 0x0008:
                # Reject integers that would truncate into a fake success0.
                open_status = protocol_int32(one(read_fields(body), 1, 0))
                request = self.gate.opened(integer(1, open_status))
                self.report["stages"]["channel_open"] = "PASSED"
                self.write(request)
                self.phase_deadline = min(self.deadline, time.monotonic() + 15)
            elif message == 0x8002:
                status, already_paired, accepted = phone_pairing_response(body)
                self.report["pairing_status"] = status
                self.report["hu_already_paired"] = already_paired
                _, _, real_bond = bond_state(self.device_properties)
                if not accepted or (already_paired and not real_bond):
                    self.report["stages"]["preparation"] = "FAILED"
                    raise PairingRejected("car rejected preparation or AA/BlueZ bond states disagree; no schema fallback")
                self.gate.preparation(integer(1, status) + integer(2, int(already_paired)))
                self.report["stages"]["preparation"] = "PASSED"
                self.maybe_pair()
            elif message == 0x8003:
                self.gate.authentication(body)
                self.report["authentication_shape"] = "six-decimal-digits"
                self.try_confirmation()
            else:
                raise PairingRejected("unexpected car Bluetooth message 0x%04x" % message)
        except BlockingIOError:
            pass
        except Exception as error:
            self.fail(safe_error(error))
        return not self.finished

    def maybe_pair(self):
        if self.finished or self.closed:
            return
        if not self.gate or not self.gate.prepared or self.device_path is None or self.pair_pending or self.pair_finished:
            return
        if self.scan_owned:
            if not self.scan_stopping:
                self.scan_stopping = True
                self.adapter.StopDiscovery(reply_handler=self.discovery_stopped,
                                           error_handler=lambda error: self.fail(safe_error(error)), timeout=3)
            return
        _, _, real_bond = bond_state(self.device_properties)
        if real_bond:
            if not self.gate.previously_paired:
                raise PairingRejected("BlueZ has a bond the car denied; refusing automatic removal or replacement")
            self.pair_finished = True
            self.report["stages"]["comparison"] = "NOT_REQUIRED_EXISTING_VERIFIED_BOND"
            self.maybe_bonded()
            return
        self.verify_device(self.device_path)
        self.pair_pending = True
        self.pair_issued = True
        self.event("real_bluez_pair_requested")
        self.device.Pair(reply_handler=self.pair_returned, error_handler=self.pair_error,
                         timeout=max(.1, self.deadline - time.monotonic()))

    def discovery_stopped(self):
        if self.finished or self.closed:
            return
        self.scan_owned, self.scan_stopping = False, False
        self.event("own_discovery_session_stopped")
        self.guarded(self.maybe_pair)

    def pair_returned(self):
        if self.finished or self.closed:
            return
        self.pair_pending = False
        self.pair_finished = True
        self.event("bluez_pair_method_completed")
        self.refresh_device(self.maybe_bonded)

    def pair_error(self, error):
        if self.finished or self.closed:
            return
        self.pair_pending = False
        if hasattr(error, "get_dbus_name") and error.get_dbus_name() in ("org.bluez.Error.InProgress", "org.bluez.Error.AlreadyExists"):
            # These mean this call did not create a pairing operation; don't
            # cancel a pre-existing operation owned by another application.
            self.pair_issued = False
        self.fail(safe_error(error))

    def refresh_device(self, callback):
        properties = self.dbus.Interface(self.bus.get_object("org.bluez", self.device_path, introspect=False),
                                         "org.freedesktop.DBus.Properties")
        def received(values):
            if self.finished or self.closed:
                return
            self.device_properties = dict(values)
            self.guarded(callback)
        properties.GetAll("org.bluez.Device1", reply_handler=received,
                          error_handler=lambda error: self.fail(safe_error(error)), timeout=2)

    def verify_device(self, path):
        if self.finished or self.closed:
            raise PairingRejected("pairing diagnostic no longer accepts agent requests")
        self.gate.check(self.args.headunit_address)
        if socket_disconnected(self.sock):
            raise PairingRejected("AA disconnected before Bluetooth authorization")
        if str(path) != self.device_path or str(self.device_properties.get("Address", "")).upper() != self.args.headunit_address:
            raise PairingRejected("agent request is outside the advertised car session")
        return self.args.headunit_address

    def confirm(self, path, key, reply, error):
        try:
            self.verify_device(path)
            if self.auth_result_sent or self.gate.confirmed:
                raise PairingRejected("current numeric comparison already completed")
            if self.pending_confirmation is not None:
                raise PairingRejected("another numeric comparison is pending")
            self.pending_confirmation = (int(key), reply, error, min(self.deadline, time.monotonic() + 10))
            self.event("bluez_numeric_confirmation_requested")
        except Exception as failure:
            error(self.agent.Rejected("current car authentication rejected"))
            self.fail(safe_error(failure))
            return
        try:
            self.try_confirmation()
        except Exception as failure:
            # try_confirmation has already rejected this one pending request.
            self.fail(safe_error(failure))

    def try_confirmation(self):
        if self.pending_confirmation is None:
            return
        key, reply, error, expires = self.pending_confirmation
        try:
            if time.monotonic() >= expires:
                raise PairingRejected("AA numeric authentication data did not arrive before deadline")
            self.verify_device(self.device_path)
            outcome = self.gate.numeric_confirmation(self.args.headunit_address, key)
        except Exception:
            self.pending_confirmation = None
            error(self.agent.Rejected("AA and Bluetooth numeric authentication rejected"))
            raise
        if outcome:
            self.pending_confirmation = None
            reply()
            self.gate.confirmed = True
            if not self.auth_result_sent:
                self.write(self.gate.auth_result())
                self.auth_result_sent = True
                self.event("aa_authentication_result_sent_after_numeric_confirmation")
            self.report["stages"]["comparison"] = "PASSED"
            self.event("matching_current_aa_bluez_comparison_confirmed")

    def maybe_bonded(self):
        if self.finished or self.closed:
            return
        if not self.gate or not self.gate.prepared:
            return
        paired, bonded, real_bond = bond_state(self.device_properties)
        self.report["paired"], self.report["bonded"] = paired, bonded
        if not real_bond or not self.pair_finished:
            return
        self.gate.paired_property(self.args.headunit_address, real_bond)
        self.report["persisted_bond_confirmed"] = bonded is True
        self.report["stages"]["bond"] = "PASSED" if bonded is True else "PAIRED_BONDED_PROPERTY_UNAVAILABLE"
        if self.hfp_requested:
            return
        # A saved bond may be disconnected, so ServicesResolved can be false.
        # Use its previously discovered UUIDs to initiate only HFP, then verify
        # live Connected/ServicesResolved after ConnectProfile completes.
        remote_uuids = [str(value).lower() for value in self.device_properties.get("UUIDs", [])]
        if HFP_HF_UUID not in remote_uuids:
            raise PairingRejected("bonded car does not expose remote HFP Handsfree service")
        self.verify_device(self.device_path)
        self.hfp_requested = True
        self.event("remote_hfp_handsfree_profile_requested")
        self.device.ConnectProfile(HFP_HF_UUID, signature="s", reply_handler=self.hfp_returned,
                                   error_handler=lambda error: self.fail(safe_error(error)),
                                   timeout=min(15, max(.1, self.deadline - time.monotonic())))

    def hfp_returned(self):
        if self.finished or self.closed:
            return
        self.event("bluez_hfp_profile_method_completed")
        self.refresh_device(self.hfp_verified)

    def hfp_verified(self):
        if self.finished or self.closed:
            return
        self.verify_device(self.device_path)
        paired, bonded, real_bond = bond_state(self.device_properties)
        self.report["paired"], self.report["bonded"] = paired, bonded
        if not real_bond or not bool(self.device_properties.get("Connected", False)) or not bool(self.device_properties.get("ServicesResolved", False)):
            raise PairingRejected("HFP request completed without a current connected verified car bond")
        self.report["hfp_transport_connected"] = True
        self.report["stages"]["hfp_transport"] = "PASSED"
        self.report["pairing_diagnostic_passed"] = True
        self.report["note"] = "Real pairing and remote HFP transport verified; complete HFP AT/SCO readiness and AA video focus require separate evidence."
        self.event("real_pairing_and_hfp_transport_verified")
        self.finished = True
        self.loop.quit()

    def tick(self):
        if self.finished or self.closed:
            return False
        try:
            if time.monotonic() >= self.deadline:
                raise PairingRejected("bounded pairing attempt expired")
            if self.scan_owned and self.device_path is None and time.monotonic() >= self.scan_deadline:
                raise PairingRejected("advertised car was not found during bounded BR/EDR discovery")
            if not self.gate.channel_opened and time.monotonic() >= self.phase_deadline:
                raise PairingRejected("Bluetooth channel open response timed out")
            if self.gate.channel_opened and not self.gate.prepared and time.monotonic() >= self.phase_deadline:
                raise PairingRejected("car pairing preparation response timed out")
            self.try_confirmation()
            self.maybe_pair()
        except Exception as error:
            self.fail(safe_error(error))
        return not self.finished

    def cleanup(self, keep_socket=False):
        if self.closed:
            return
        self.closed = True
        if self.gate:
            self.gate.close()
        def attempt(label, function):
            try:
                function()
            except Exception as error:
                self.report["cleanup_errors"].append({"operation": label, "error": safe_error(error)})
        if self.pending_confirmation:
            _, _, error, _ = self.pending_confirmation
            self.pending_confirmation = None
            attempt("reject_pending_confirmation", lambda: error(self.agent.Rejected("pairing diagnostic ended")))
        if self.pair_issued and not self.pair_finished and self.device is not None:
            attempt("cancel_own_pending_pairing", lambda: self.device.CancelPairing(timeout=2))
        if self.scan_owned and self.adapter is not None:
            attempt("stop_own_discovery", lambda: self.adapter.StopDiscovery(timeout=2))
        if self.agent_registered and self.bus is not None:
            def unregister():
                manager = self.dbus.Interface(self.bus.get_object("org.bluez", "/org/bluez", introspect=False),
                                               "org.bluez.AgentManager1")
                manager.UnregisterAgent(AGENT_PATH, signature="o", timeout=2)
            attempt("unregister_own_agent", unregister)
        if self.adapter_initial is not None:
            for name in sorted(self.adapter_changed):
                attempt("restore_" + name.lower(), lambda name=name: self.adapter_properties.Set(
                    "org.bluez.Adapter1", name, self.dbus.Boolean(self.adapter_initial[name]), signature="ssv", timeout=2))
        for source in self.sources:
            attempt("remove_own_event_source", lambda source=source: self.GLib.source_remove(source))
        self.sources = []
        if self.sock and not keep_socket:
            attempt("close_aa_client", self.sock.close)
        if self.agent:
            attempt("unexport_own_agent", self.agent.remove_from_connection)
        if self.bus:
            attempt("close_private_bus", self.bus.close)
        self.report["cleanup_completed"] = not self.report["cleanup_errors"]
        if self.report["cleanup_errors"]:
            self.report["pairing_diagnostic_passed"] = False

    def run(self, keep_socket=False):
        try:
            self.preflight()
            if not self.finished:
                self.loop.run()
        except Exception as error:
            self.fail(safe_error(error))
        finally:
            self.cleanup(keep_socket=keep_socket)
        return self.report


def make_agent(controller, dbus):
    import dbus.service
    class Rejected(dbus.DBusException):
        _dbus_error_name = "org.bluez.Error.Rejected"
    class Agent(dbus.service.Object):
        def __init__(self):
            super().__init__(controller.bus, AGENT_PATH)
        @dbus.service.method("org.bluez.Agent1", in_signature="ou", out_signature="", async_callbacks=("reply", "error"))
        def RequestConfirmation(self, device, key, reply, error):
            controller.confirm(device, key, reply, error)
        @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="s")
        def RequestPinCode(self, device):
            raise Rejected("current car requires verified numeric comparison")
        @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="u")
        def RequestPasskey(self, device):
            raise Rejected("passkey entry is not current numeric-comparison method")
        @dbus.service.method("org.bluez.Agent1", in_signature="o", out_signature="")
        def RequestAuthorization(self, device):
            raise Rejected("blind just-works confirmation is not allowed")
        @dbus.service.method("org.bluez.Agent1", in_signature="os", out_signature="")
        def AuthorizeService(self, device, uuid):
            try:
                controller.verify_device(device)
                _, _, real_bond = bond_state(controller.device_properties)
                if not real_bond or not (controller.gate.confirmed or controller.gate.previously_paired) or str(uuid).lower() != HFP_AG_UUID:
                    raise PairingRejected("service does not belong to the verified car HFP bond")
            except PairingRejected:
                raise Rejected("unapproved car service")
        @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
        def Cancel(self):
            if not controller.closed:
                controller.fail("BlueZ cancelled the current numeric-comparison request")
        @dbus.service.method("org.bluez.Agent1", in_signature="", out_signature="")
        def Release(self):
            if not controller.closed:
                controller.fail("BlueZ released the application pairing agent")
    Agent.Rejected = Rejected
    return Agent()



def socket_disconnected(sock):
    """Non-consuming liveness check, including HUP hidden by queued broadcasts."""
    if hasattr(select, "poll"):
        poller = select.poll()
        poller.register(sock, select.POLLHUP | select.POLLERR | select.POLLNVAL)
        if poller.poll(0):
            return True
    if not select.select([sock], [], [], 0)[0]:
        return False
    return sock.recv(1, socket.MSG_PEEK) == b""


def session_identity(sock, proc_root=Path("/proc")):
    """Stable across sidecar restarts; new AAServer process means new AA session.

    AAServer exits on USB detach. PID plus start ticks and boot ID prevents PID
    reuse or socket inode reuse from reopening pairing in an old live session.
    """
    pid, _, _ = struct.unpack("3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    process = (proc_root / str(pid) / "stat").read_text().rpartition(")")[2].split()
    start_ticks = process[19]
    boot = (proc_root / "sys/kernel/random/boot_id").read_text().strip()
    return hashlib.sha256(f"{boot}:{pid}:{start_ticks}".encode()).hexdigest()


class SessionGuard:
    """Persist claim before any Bluetooth operation; failure never retries."""
    def __init__(self, path):
        self.path = Path(path)

    def claim(self, identity):
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text())
                sessions = data["sessions"]
                if not isinstance(sessions, list) or any(not isinstance(x, str) for x in sessions):
                    raise ValueError("invalid session list")
            except (ValueError, KeyError, TypeError) as error:
                raise PairingRejected("session guard is invalid; refusing automatic retry") from error
        else:
            sessions = []
        if identity in sessions:
            return False
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump({"sessions": (sessions + [identity])[-32:]}, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, self.path)
        return True


def hold_until_disconnect(sock):
    """Consume broadcasts without replaying pairing, until this AA session ends."""
    sock.setblocking(False)
    while not socket_disconnected(sock):
        if select.select([sock], [], [], 1)[0]:
            try:
                if not sock.recv(256 * 1024):
                    return
            except BlockingIOError:
                pass


def load_config(path):
    config = configparser.ConfigParser(interpolation=None)
    if not config.read(path) or "bluetooth" not in config:
        raise PairingRejected("missing private Bluetooth configuration")
    section = config["bluetooth"]
    address = section.get("headunit_address", "").strip().upper()
    if not MAC_PATTERN.fullmatch(address):
        raise PairingRejected("configuration requires one pinned head-unit Bluetooth address")
    adapter = section.get("adapter", "/org/bluez/hci0")
    if not adapter.startswith("/org/bluez/hci") or not adapter[len("/org/bluez/hci"):].isdigit():
        raise PairingRejected("configuration requires a BlueZ adapter path")
    args = SimpleNamespace(headunit_address=address, adapter=adapter,
                           aa_socket=section.get("aa_socket", "/var/run/airplay-aa/aaserver.sock"),
                           duration=section.getfloat("duration", 60),
                           scan_seconds=section.getfloat("scan_seconds", 10),
                           hfp_wait_seconds=section.getfloat("hfp_wait_seconds", 10),
                           discoverable=section.getboolean("discoverable", False))
    if not 10 <= args.duration <= 90 or not 1 <= args.scan_seconds <= 15 or not 0 <= args.hfp_wait_seconds <= 20:
        raise PairingRejected("Bluetooth configuration time bounds are invalid")
    if not Path(args.aa_socket).is_absolute():
        raise PairingRejected("AA socket must be an absolute path")
    return args


def watch(args, state_file):
    guard = SessionGuard(state_file)
    while True:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        sock.settimeout(2)
        try:
            sock.connect(args.aa_socket)
        except (FileNotFoundError, ConnectionRefusedError, TimeoutError):
            sock.close()
            time.sleep(1)
            continue
        try:
            identity = session_identity(sock)
            if not guard.claim(identity):
                print(json.dumps({"event": "current_session_already_attempted"}), flush=True)
            else:
                descriptor = fetch_descriptor(sock, time.monotonic() + args.duration, args.headunit_address)
                if descriptor is None:
                    print(json.dumps({"event": "no_bluetooth_service_skipped", "bluez_accessed": False}), flush=True)
                else:
                    # DHU and unconfigured peers reach no BlueZ imports or writes.
                    import dbus
                    from dbus.mainloop.glib import DBusGMainLoop
                    from gi.repository import GLib
                    DBusGMainLoop(set_as_default=True)
                    controller = Controller(args, dbus, GLib, sock=sock, descriptor=descriptor)
                    print(json.dumps(controller.run(keep_socket=True), sort_keys=True), flush=True)
            hold_until_disconnect(sock)
        except (PairingRejected, TimeoutError, OSError) as error:
            print(json.dumps({"event": "bluetooth_session_failed", "error": safe_error(error)}), flush=True)
            # A failed attempt is final for the live AA session, including a
            # missing/late Bluetooth service; it cannot restart USB or video.
            try:
                hold_until_disconnect(sock)
            except OSError:
                pass
        finally:
            sock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/airplay-aa/bluetooth.conf")
    parser.add_argument("--state-file", default="/run/airplay-aa-bluetooth/sessions.json")
    parser.add_argument("--check-config", action="store_true", help="validate without touching AA or Bluetooth")
    args = parser.parse_args()
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        options = load_config(args.config)
        if args.check_config:
            print("Bluetooth configuration valid; no device operations performed")
            return 0
        watch(options, args.state_file)
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(json.dumps({"event": "bluetooth_sidecar_failed", "error": safe_error(error)}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
