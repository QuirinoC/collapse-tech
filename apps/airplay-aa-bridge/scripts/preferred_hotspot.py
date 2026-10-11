#!/usr/bin/env python3
"""Prefer a saved Wi-Fi profile when its exact SSID appears; keep NM rollback.

GetSettings never returns secrets. NetworkManager retains the existing profile
and its credentials; this helper neither edits profiles nor disables fallback.
"""
import argparse
import configparser
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import uuid


NM = "org.freedesktop.NetworkManager"
MANAGER = "/org/freedesktop/NetworkManager"
DEVICE = NM + ".Device"
WIRELESS = DEVICE + ".Wireless"
ACTIVE = NM + ".Connection.Active"
SCAN_AGE = 30
SCAN_WAIT = 8
ACTIVATION_WAIT = 25
ROLLBACK_TIMEOUT = 45
COOLDOWN = 300


def boottime():
    # NM LastScan (ms) and AP LastSeen (s) use CLOCK_BOOTTIME, including suspend.
    return time.clock_gettime(time.CLOCK_BOOTTIME)


def read_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError("Config must be a private regular file owned by the running user")
        parser = configparser.ConfigParser(interpolation=None)
        parser.read_file(source)
    section = parser["preferred-hotspot"]
    if set(parser.sections()) != {"preferred-hotspot"} or set(section) != {"interface", "profile_uuid"}:
        raise ValueError("Config requires only interface and profile_uuid in [preferred-hotspot]")
    interface = section["interface"].strip()
    profile_uuid = uuid.UUID(section["profile_uuid"].strip())
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,15}", interface) or not profile_uuid.int:
        raise ValueError("Replace the example UUID and specify a valid Wi-Fi interface")
    return interface, str(profile_uuid)


class RetryState:
    def __init__(self, directory, profile_uuid, boot_id, clock=boottime):
        self.path = Path(directory) / "retry.json"
        self.profile_uuid, self.boot_id, self.clock = profile_uuid, boot_id, clock

    def cooling_down(self):
        try:
            data = json.loads(self.path.read_text())
        except FileNotFoundError:
            return False
        return (data["profile_uuid"] == self.profile_uuid and data["boot_id"] == self.boot_id
                and self.clock() < data["retry_after"])

    def mark_attempt(self):
        data = {"profile_uuid": self.profile_uuid, "boot_id": self.boot_id,
                "retry_after": self.clock() + COOLDOWN}
        fd, temporary = tempfile.mkstemp(prefix="retry-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as output:
                json.dump(data, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def clear(self):
        self.path.unlink(missing_ok=True)


class NetworkManager:
    """Bounded, explicitly typed Gio D-Bus calls; never call GetSecrets."""
    def __init__(self, clock=boottime):
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio, GLib
        self.Gio, self.GLib, self.clock = Gio, GLib, clock
        self.bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
        self.deadline = self.clock() + 15

    def call(self, path, interface, method, signature="()", values=(), reply="()"):
        remaining = min(2.0, self.deadline - self.clock())
        if remaining <= 0:
            raise TimeoutError("NetworkManager operation deadline expired")
        return self.bus.call_sync(
            NM, path, interface, method, self.GLib.Variant(signature, values),
            self.GLib.VariantType.new(reply), self.Gio.DBusCallFlags.NONE,
            max(1, int(remaining * 1000)), None,
        ).unpack()

    def properties(self, path, interface):
        return self.call(path, "org.freedesktop.DBus.Properties", "GetAll",
                         "(s)", (interface,), "(a{sv})")[0]

    def device(self, interface):
        path = self.call(MANAGER, NM, "GetDeviceByIpIface", "(s)", (interface,), "(o)")[0]
        properties = self.properties(path, DEVICE)
        manager = self.properties(MANAGER, NM)
        if not properties["Managed"] or properties["DeviceType"] != 2:
            raise ValueError("Configured interface must be managed Wi-Fi")
        if not manager["NetworkingEnabled"] or not manager["WirelessEnabled"] or not manager["WirelessHardwareEnabled"]:
            raise ValueError("NetworkManager Wi-Fi must already be enabled")
        return path

    def profile(self, profile_uuid, interface):
        path = self.call(MANAGER + "/Settings", NM + ".Settings", "GetConnectionByUuid",
                         "(s)", (profile_uuid,), "(o)")[0]
        settings = self.call(path, NM + ".Settings.Connection", "GetSettings",
                             reply="(a{sa{sv}})")[0]
        connection, wireless = settings["connection"], settings["802-11-wireless"]
        if (connection["type"] != "802-11-wireless" or connection["uuid"] != profile_uuid
                or connection.get("interface-name", interface) != interface
                or wireless.get("mode", "infrastructure") != "infrastructure"):
            raise ValueError("Preferred profile must be a client Wi-Fi profile for this interface")
        ssid = bytes(wireless["ssid"])
        if not 1 <= len(ssid) <= 32:
            raise ValueError("Preferred profile has no valid SSID")
        return path, ssid

    def snapshot(self, device):
        properties = self.properties(device, DEVICE)
        active_path = properties["ActiveConnection"]
        active = self.properties(active_path, ACTIVE) if active_path != "/" else {}
        return {"state": properties["State"], "path": active_path,
                "uuid": active.get("Uuid"), "active_state": active.get("State"),
                "devices": active.get("Devices", [])}

    def last_scan(self, device):
        return self.properties(device, WIRELESS)["LastScan"]

    def request_scan(self, device):
        self.call(device, WIRELESS, "RequestScan", "(a{sv})", ({},))

    def access_points(self, device):
        paths = self.call(device, WIRELESS, "GetAllAccessPoints", reply="(ao)")[0]
        for path in paths:
            yield path, self.properties(path, NM + ".AccessPoint")

    def checkpoint(self, device):
        # Flags0 preserves other callers' checkpoints; never destroy all/overlap.
        return self.call(MANAGER, NM, "CheckpointCreate", "(aouu)",
                         ([device], ROLLBACK_TIMEOUT, 0), "(o)")[0]

    def activate(self, profile, device, access_point):
        return self.call(MANAGER, NM, "ActivateConnection", "(ooo)",
                         (profile, device, access_point), "(o)")[0]

    def confirm(self, checkpoint):
        self.call(MANAGER, NM, "CheckpointDestroy", "(o)", (checkpoint,))

    def rollback(self, checkpoint):
        # NM removes the checkpoint itself when CheckpointRollback succeeds.
        return self.call(MANAGER, NM, "CheckpointRollback", "(o)",
                         (checkpoint,), "(a{su})")[0]


def activated(snapshot, profile_uuid, device, active_path=None):
    return (snapshot["state"] == 100 and snapshot["active_state"] == 2
            and snapshot["uuid"] == profile_uuid and device in snapshot["devices"]
            and (active_path is None or snapshot["path"] == active_path))


def prefer_hotspot(network, interface, profile_uuid, retry, clock=boottime, sleep=time.sleep):
    network.deadline = clock() + 15  # Includes profile/device/AP discovery calls.
    device = network.device(interface)
    previous = network.snapshot(device)
    if activated(previous, profile_uuid, device):
        retry.clear()
        return "already-preferred"
    if retry.cooling_down():
        return "cooldown"
    if previous["state"] not in (30, 100, 120):
        return "device-busy"
    profile, ssid = network.profile(profile_uuid, interface)
    last_scan = network.last_scan(device)
    if last_scan < 0 or clock() - last_scan / 1000 > SCAN_AGE:
        try:
            network.request_scan(device)
        except Exception:
            return "scan-deferred"  # NM may reject scans while busy/rate limited.
        scan_deadline = min(network.deadline, clock() + SCAN_WAIT)
        while clock() < scan_deadline:
            refreshed = network.last_scan(device)
            if refreshed > last_scan:
                last_scan = refreshed
                break
            sleep(0.5)
        else:
            return "scan-deferred"
    access_point = None
    for path, properties in network.access_points(device):
        seen = properties["LastSeen"]
        if (bytes(properties["Ssid"]) == ssid and seen >= 0
                and 0 <= clock() - seen <= SCAN_AGE
                and seen >= last_scan / 1000 - SCAN_WAIT - 2):
            access_point = path
            break
    if access_point is None:
        return "preferred-not-visible"
    # Scanning can overlap NetworkManager/manual activation. Never reconnect an
    # already-active preferred profile or replace a connection still starting.
    previous = network.snapshot(device)
    if activated(previous, profile_uuid, device):
        retry.clear()
        return "already-preferred"
    if previous["state"] not in (30, 100, 120):
        return "device-busy"
    checkpoint = network.checkpoint(device)
    try:
        retry.mark_attempt()  # A crash/timeout must retain the failed-attempt cooldown.
        network.deadline = clock() + ACTIVATION_WAIT
        active_path = network.activate(profile, device, access_point)
        while clock() < network.deadline:
            current = network.snapshot(device)
            if activated(current, profile_uuid, device, active_path):
                network.deadline = clock() + 2
                network.confirm(checkpoint)
                retry.clear()
                return "connected-preferred"
            if current["path"] == active_path and current["active_state"] == 4:
                break
            sleep(0.5)
    except Exception:
        pass
    network.deadline = clock() + 8
    try:
        results = network.rollback(checkpoint)
        if results.get(device) != 0:
            return "activation-failed-rollback-incomplete"
        while clock() < network.deadline:
            current = network.snapshot(device)
            if (previous["uuid"] and activated(current, previous["uuid"], device)
                    or previous["path"] == "/" and current["path"] == "/"):
                return "activation-failed-previous-network-restored"
            sleep(0.5)
        return "activation-failed-rollback-requested"
    except Exception:
        return "activation-failed-automatic-rollback-pending"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("/etc/airplay-aa/preferred-hotspot.conf"))
    parser.add_argument("--state-dir", type=Path, default=Path("/run/airplay-aa-preferred-hotspot"))
    parser.add_argument("--check-config", action="store_true", help="Validate private config without using NetworkManager")
    args = parser.parse_args()
    try:
        interface, profile_uuid = read_config(args.config)
        if args.check_config:
            print("preferred hotspot config valid")
            return 0
        args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = args.state_dir.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError("State directory must be private and owned by the running user")
        with contextlib.ExitStack() as stack:
            fd = os.open(args.state_dir / "lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            stack.callback(os.close, fd)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return 0
            boot_id = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
            retry = RetryState(args.state_dir, profile_uuid, boot_id)
            result = prefer_hotspot(NetworkManager(), interface, profile_uuid, retry)
            print(result)
            return 1 if result.startswith("activation-failed") else 0
    except Exception as error:
        # Never put SSID/profile settings or credential-agent error text in logs.
        print(f"preferred hotspot check failed ({type(error).__name__})", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
