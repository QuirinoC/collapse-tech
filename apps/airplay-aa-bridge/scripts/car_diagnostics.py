#!/usr/bin/env python3
"""Passive, bounded car-session evidence. Never opens or changes USB endpoints.

Stage times are log-reader observations, not protocol emission timestamps. Kernel
records additionally retain journald's source monotonic timestamp. Only allowlisted
events are stored: no packet payloads, discovery identifiers, URLs or credentials.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import subprocess
import time
import uuid


def read_text(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def stage_event(line):
    """Return structured observations, never the unfiltered source line."""
    if re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)", line):
        return {"stage": "aaserver_attempt"}
    exact = {
        "got version request": "version_request_received",
        "version negotiation ok": "version_negotiated",
        "auth complete": "auth_complete_received",
        "got service discovery response": "discovery_received",
        "Initial AOA request 53 completed; switch to accessory mode": "aoa_start_completed",
        "Error: USB startup deadline expired before session bytes": "usb_startup_timeout",
    }
    if line in exact:
        return {"stage": exact[line]}
    patterns = [
        (r"Initial AOA request (51|52) handled", "aoa_request_handled", ("request",)),
        (r"(?:Initial FunctionFS|ep0) event ([0-6])\s*", "functionfs_event", ("event",)),
        (r"AAServer exited status=(\d+); restarting in 2s", "aaserver_exit", ("exit_status",)),
        (r"InputChannelHandler: channel (\d+) ChannelOpenResponse parsed=([01]) status=(-?\d+) accepted=([01])", "input_open_response", ("channel", "parsed", "status", "accepted")),
        (r"InputChannelHandler: channel (\d+) InputBindingResponse parsed=([01]) status=(-?\d+) accepted=([01])", "input_binding_response", ("channel", "parsed", "status", "accepted")),
        (r"ChannelHandler: channel (\d+) ChannelOpenResponse parsed=([01]) status=(-?\d+) accepted=([01])", "channel_open_response", ("channel", "parsed", "status", "accepted")),
        (r"VideoChannelHandler: setup status=(-?\d+) max_unacked=(-?\d+) config0=([01]) accepted=([01])", "video_setup_response", ("status", "max_unacked", "config0", "accepted")),
        (r"VideoChannelHandler: requesting PROJECTED focus on channel (\d+)", "video_focus_requested", ("channel",)),
        (r"VideoChannelHandler: VideoFocusIndication mode=(\d+).*", "video_focus_received", ("mode",)),
        (r"VideoChannelHandler: StartIndication on channel (\d+) session=(\d+) max_unacked=(\d+)", "video_start_sent", ("channel", "media_session", "max_unacked")),
        (r"VideoChannelHandler: StartIndication on channel (\d+).*", "video_start_sent", ("channel",)),
        (r"VideoChannelHandler: StopIndication on channel (\d+) session=(\d+)", "video_stop_sent", ("channel", "media_session")),
        (r"VideoChannelHandler: media credit exhausted on channel (\d+); holding video until ACK and IDR", "video_credit_exhausted", ("channel",)),
    ]
    for pattern, stage, fields in patterns:
        match = re.fullmatch(pattern, line)
        if match:
            return {"stage": stage, **dict(zip(fields, map(int, match.groups())))}
    if line.startswith("USB startup ESHUTDOWN:"):
        return {"stage": "usb_startup_eshutdown"}
    if line.startswith("USB startup suspended:"):
        return {"stage": "usb_startup_suspended"}
    if line.startswith("USB resumed:"):
        return {"stage": "usb_resumed"}
    if line == "VideoChannelHandler: malformed media ACK ignored":
        return {"stage": "media_ack_malformed"}
    if line == "VideoChannelHandler: malformed VideoFocusIndication ignored":
        return {"stage": "video_focus_malformed"}
    error = re.match(r"(?:Error: |disconnect client: \d+ )(.*)", line)
    if error:
        text = error[1]
        if "undiscovered channel" in text or text.startswith(("No handler for channel", "Invalid channelId")):
            category = "unknown_channel"
        elif re.match(r"(?:AA (?:frame|fragment|fragmented|message|continuation)|Plain AA frame|Invalid encrypted AA frame)", text):
            category = "aa_framing"
        elif text.startswith(("SSL_read", "BIO_write failed", "Encrypted AA frame arrived before TLS", "AA TLS plaintext")):
            category = "tls_read"
        elif text.startswith(("SSL_write", "TLS ciphertext", "TLS is not ready")):
            category = "tls_write"
        elif text.startswith(("SSL_accept", "TLS handshake")):
            category = "tls_handshake"
        elif text.startswith(("transport read", "transport write", "open FunctionFS", "ep0 ", "ESHUTDOWN")):
            category = "usb_transport"
        elif text == "head unit rejected channel open":
            category = "channel_open_rejected"
        elif text in ("short AA version request", "unsupported version", "invalid service discovery response"):
            category = "initialization"
        else:
            category = "unclassified"
        return {"stage": "transport_error", "category": category}
    return None


def kernel_event(record):
    if not isinstance(record, dict):
        return None
    message = record.get("MESSAGE")
    if not isinstance(message, str):
        return None
    event = None
    if "Undervoltage detected" in message:
        event = {"event": "undervoltage_detected"}
    elif "Voltage normalised" in message:
        event = {"event": "voltage_normalised"}
    elif "dwc2 " in message:
        speed = re.search(r"new device is (high-speed|full-speed|low-speed|super-speed)\b", message)
        address = re.search(r"new address (\d+)\b", message)
        if speed:
            event = {"event": "usb_negotiated_speed", "speed": speed[1]}
        elif address:
            event = {"event": "usb_address_set", "address": int(address[1])}
        elif "bound driver configfs-gadget." in message:
            event = {"event": "usb_gadget_bound"}
        elif "timeout" in message:
            event = {"event": "usb_controller_timeout"}
        elif re.search(r"\breset\b", message, re.I):
            event = {"event": "usb_reset"}
    if event is None:
        return None
    stamp = record.get("__MONOTONIC_TIMESTAMP")
    if isinstance(stamp, str) and stamp.isdigit():
        event["kernel_monotonic_seconds"] = int(stamp) / 1_000_000
    return event


class BoundedLog:
    def __init__(self, path, max_bytes=2 * 1024 * 1024, backups=4):
        if max_bytes < 128 or backups < 1:
            raise ValueError("diagnostic retention must fit a record and keep a backup")
        self.path, self.max_bytes, self.backups = Path(path), max_bytes, backups
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        self.sync_directory(self.path.parent.parent)
        self.file = None
        self.last_sync = 0.0
        self.open()

    def open(self):
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        os.fchmod(fd, 0o600)
        self.file = os.fdopen(fd, "ab", buffering=0)
        self.directory_dirty = True

    @staticmethod
    def sync_directory(path):
        directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def rotate(self):
        self.sync()
        self.file.close()
        for index in range(self.backups, 0, -1):
            old = self.path if index == 1 else Path(f"{self.path}.{index - 1}")
            new = Path(f"{self.path}.{index}")
            if old.exists():
                os.replace(old, new)
        self.open()
        self.sync_directory(self.path.parent)

    def write(self, event, durable=False):
        data = (json.dumps(event, separators=(",", ":"), sort_keys=True) + "\n").encode()
        if len(data) > self.max_bytes:
            raise ValueError("diagnostic record exceeds rotation size")
        if os.fstat(self.file.fileno()).st_size + len(data) > self.max_bytes:
            self.rotate()
        self.file.write(data)
        if durable or time.monotonic() - self.last_sync >= 5:
            self.sync()

    def sync(self):
        os.fsync(self.file.fileno())
        if self.directory_dirty:
            self.sync_directory(self.path.parent)
            self.directory_dirty = False
        self.last_sync = time.monotonic()

    def close(self):
        self.sync()
        self.file.close()


class LogTail:
    """Follow replacement/truncation. Ignore existing contents at first attach."""
    def __init__(self, path):
        self.path, self.identity, self.offset, self.partial = Path(path), None, 0, b""
        self.initialized = False

    def read(self):
        try:
            with self.path.open("rb") as source:
                stat = os.fstat(source.fileno())
                identity = (stat.st_dev, stat.st_ino)
                changed = self.identity != identity or stat.st_size < self.offset
                if not self.initialized:
                    self.offset = stat.st_size
                elif changed:
                    self.offset, self.partial = 0, b""
                self.identity, self.initialized = identity, True
                source.seek(self.offset)
                data = source.read(65536)
                self.offset = source.tell()
        except FileNotFoundError:
            # No file at initial startup: consume a subsequently created file.
            self.initialized = True
            return [], False
        lines = (self.partial + data).split(b"\n")
        self.partial = lines.pop()
        if len(self.partial) > 8192:
            self.partial = b""
        return [line.decode("utf-8", errors="replace").strip() for line in lines if len(line) <= 8192], changed


def sample_usb(root=Path("/sys/class/udc")):
    return [{"controller": path.name, "state": read_text(path / "state"),
             "current_speed": read_text(path / "current_speed"),
             "maximum_speed": read_text(path / "maximum_speed")}
            for path in sorted(root.glob("*"))]


def sample_processes(root=Path("/proc")):
    found = []
    for path in root.glob("[0-9]*"):
        if read_text(path / "comm") != "AAServer":
            continue
        stat = read_text(path / "stat")
        if stat and ") " in stat:
            fields = stat.rsplit(") ", 1)[1].split()
            if len(fields) > 19 and fields[19].isdigit():
                found.append({"pid": int(path.name), "start_ticks": int(fields[19])})
    return sorted(found, key=lambda item: item["pid"])


def sample_power():
    result = {}
    for argument in ("get_throttled", "pmic_read_adc"):
        try:
            value = subprocess.run(["vcgencmd", argument], capture_output=True,
                                   text=True, timeout=1, check=True).stdout
            if argument == "get_throttled":
                match = re.search(r"throttled=(0x[0-9a-fA-F]+)", value)
                if match:
                    result["throttled"] = match[1]
                else:
                    result[argument + "_unavailable"] = True
            else:
                match = re.search(r"EXT5V_V\s+volt\(\d+\)=([0-9.]+)V", value)
                if match:
                    result["ext5v_volts"] = float(match[1])
                else:
                    result[argument + "_unavailable"] = True
        except (OSError, subprocess.SubprocessError):
            result[argument + "_unavailable"] = True
    return result


def notify_ready():
    address = os.environ.get("NOTIFY_SOCKET")
    if address:
        if address.startswith("@"):
            address = "\0" + address[1:]
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
            channel.sendto(b"READY=1\nSTATUS=Passive car recorder ready", address)


class Recorder:
    def __init__(self, log, bridge_log):
        self.log, self.tail = log, LogTail(bridge_log)
        self.tail.read()  # Establish a fresh baseline before launching any reader.
        self.boot_id = read_text("/proc/sys/kernel/random/boot_id")
        uptime = read_text("/proc/uptime")
        self.started_uptime = float(uptime.split()[0]) if uptime else None
        self.run_id, self.attempt = uuid.uuid4().hex, 0
        self.previous, self.processes = {}, []
        self.stopping, self.journal = False, None
        self.selector, self.kernel_partial = selectors.DefaultSelector(), b""
        self.journal_retry_at = 0

    def emit(self, kind, data, durable=False):
        uptime = read_text("/proc/uptime")
        event = {"schema": 1, "kind": kind, "boot_id": self.boot_id,
                 "recorder_id": self.run_id, "attempt": self.attempt or None,
                 "observed_uptime_seconds": float(uptime.split()[0]) if uptime else None,
                 "observed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 **data}
        self.log.write(event, durable)

    def stop_journal(self):
        if self.journal is None:
            return
        self.selector.unregister(self.journal.stdout)
        self.journal.terminate()
        try:
            self.journal.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.journal.kill()
            self.journal.wait(timeout=1)
        self.journal.stdout.close()
        self.journal = None

    def read_kernel(self):
        now = time.monotonic()
        if self.journal is not None and self.journal.poll() is not None:
            self.emit("recorder_error", {"operation": "journal_exited"}, True)
            self.stop_journal()
            self.journal_retry_at = now + 30
        if self.journal is None and now >= self.journal_retry_at:
            try:
                self.journal = subprocess.Popen(
                    ["journalctl", "-k", "-b", "-f", "-n", "500", "-o", "json", "--no-pager"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                os.set_blocking(self.journal.stdout.fileno(), False)
                self.selector.register(self.journal.stdout, selectors.EVENT_READ)
                self.kernel_partial = b""
            except OSError:
                self.emit("recorder_error", {"operation": "journal_unavailable"}, True)
                self.journal_retry_at = now + 30
                self.journal = None
        for key, _ in self.selector.select(0):
            data = os.read(key.fileobj.fileno(), 65536)
            if not data:
                continue
            lines = (self.kernel_partial + data).split(b"\n")
            self.kernel_partial = lines.pop()
            if len(self.kernel_partial) > 65536:
                self.kernel_partial = b""
            for line in lines:
                try:
                    event = kernel_event(json.loads(line))
                except (ValueError, TypeError):
                    continue
                if event:
                    stamp = event.get("kernel_monotonic_seconds")
                    historical = stamp is not None and self.started_uptime is not None and stamp < self.started_uptime
                    event["replayed_from_before_recorder_start"] = historical
                    self.emit("kernel", event, not historical)

    def run(self):
        self.emit("recorder_start", {"source_time_semantics": "stage times are reader observations; kernel events include source monotonic time", "aaserver": sample_processes()}, True)
        power_at, heartbeat_at, state_at = 0, 0, 0
        try:
            self.read_kernel()
            notify_ready()
            while not self.stopping:
                self.read_kernel()
                if time.monotonic() >= state_at:
                    for name, value in (("usb", sample_usb()), ("aaserver", sample_processes())):
                        if name not in self.previous or self.previous[name] != value:
                            self.previous[name] = value
                            self.emit("state_change", {name: value}, True)
                    state_at = time.monotonic() + 1
                lines, changed = self.tail.read()
                if changed:
                    self.emit("source_log_changed", {"inode": self.tail.identity[1], "offset": self.tail.offset}, True)
                for line in lines:
                    event = stage_event(line)
                    if event:
                        if event["stage"] == "aaserver_attempt":
                            self.attempt += 1
                        self.emit("protocol", event, True)
                now = time.monotonic()
                if now >= power_at:
                    self.emit("power_sample", sample_power())
                    power_at = now + 10
                if now >= heartbeat_at:
                    self.emit("heartbeat", {"usb": self.previous.get("usb"), "aaserver": self.previous.get("aaserver")})
                    heartbeat_at = now + 30
                time.sleep(0.25)
        finally:
            self.stop_journal()
            self.selector.close()
            self.emit("recorder_stop", {}, True)
            self.log.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/var/log/airplay-aa/diagnostics/car-events.jsonl"))
    parser.add_argument("--bridge-log", type=Path, default=Path("/var/log/airplay-aa/aaserver.log"))
    args = parser.parse_args()
    recorder = Recorder(BoundedLog(args.output), args.bridge_log)
    def stop(_signum, _frame):
        recorder.stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    recorder.run()


if __name__ == "__main__":
    main()
