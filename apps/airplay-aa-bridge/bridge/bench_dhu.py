#!/usr/bin/env python3
"""Exercise a real Pi USB Android Auto session with Google's Mac DHU.

Screenshots come from DHU's decoded video surface, never the desktop. A pass
requires accessory mode, protocol negotiation, TLS, and changing nonblank
decoded frames. Missing hardware is reported as a blocked, untested session.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import platform
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]
STAGES = ("preflight", "usb", "aoap", "protocol", "tls", "input", "automatic_focus", "video", "render", "motion", "pattern", "airplay", "pi_collection")
PATTERNS = {
    "aoap": re.compile(r"Found device .*in accessory mode \(vid=18d1, pid=2d0[01]\)", re.I),
    "protocol": re.compile(r"Phone reported protocol version\s+\d+\.\d+", re.I),
    "tls": re.compile(r"Verify returned:\s*ok\b", re.I),
}
FAILURES = re.compile(
    r"certificate has expired|Verify returned: (?!ok\b|success\b|0\b)[^\r\n]+|"
    r"auth failure|SSL_accept failed|handshake failure|Invalid peer certificate|"
    r"Can't init decoder|Failed to start Google Automotive Link|"
    r"The phone isn't responding|Ping timeout|Unrecoverable error|Failed to write (?:to )?transport", re.I
)
SSH_READ_ONLY = """date -u '+%Y-%m-%dT%H:%M:%SZ'
systemctl is-active airplay-aa-bridge || true
openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -subject -dates || true
ps -eo pid,args | grep -E '[A]AServer|[u]xplay|[i]nject_h264|[r]un-airplay-pipeline' || true
tail -n 160 /var/log/airplay-aa/aaserver.log /var/log/airplay-aa/inject.log /var/log/airplay-aa/uxplay.log
"""
AIRPLAY_SOURCE_LINE = re.compile(r"\s*(?:export\s+)?AIRPLAY_AA_SOURCE\s*=\s*(['\"]?)airplay\1\s*(?:#.*)?")
# Read only the source selection and a bounded tail of UxPlay's receive log.
# Exact byte offsets distinguish records appended during this run from a stale
# marker, while receive/packet timestamps establish live advancing H.264 input.
SSH_AIRPLAY_READ_ONLY = r"""python3 - <<'PY'
import json, re, time
from pathlib import Path
snapshot = {'captured_at_epoch': time.time(), 'source_config_lines': [], 'errors': []}
try:
    snapshot['source_config_lines'] = [line[:512] for line in Path('/etc/airplay-aa/bridge.env').read_text().splitlines()
                                     if re.match(r'^\s*(?:export\s+)?AIRPLAY_AA_SOURCE\s*=', line)]
except (OSError, UnicodeError) as error:
    snapshot['errors'].append('Cannot read source selection: ' + str(error))
pattern = re.compile(rb'raop_rtp video:\s*now\s*=\s*(\d+(?:\.\d+)?),[^\r\n]*?\bts\s*=\s*(\d+(?:\.\d+)?),[^\r\n]*?\bh264,\s*size:\s*(\d+)')
try:
    path = Path('/var/log/airplay-aa/uxplay.log')
    with path.open('rb') as stream:
        import os
        metadata = os.fstat(stream.fileno())
        start = max(0, metadata.st_size - 262144)
        stream.seek(start)
        data = stream.read(metadata.st_size - start)
    records, position = [], start
    for line in data.splitlines(keepends=True):
        match = pattern.search(line) if position != start or start == 0 else None
        if match:
            records.append({'offset': position, 'receive_epoch': float(match.group(1)),
                            'packet_timestamp': float(match.group(2)), 'size': int(match.group(3)),
                            'line': match.group(0).decode('ascii')[:320]})
        position += len(line)
    snapshot['uxplay_log'] = {'path': str(path), 'device': metadata.st_dev, 'inode': metadata.st_ino,
                              'size': metadata.st_size, 'mtime_ns': metadata.st_mtime_ns,
                              'tail_bytes_read': len(data), 'packets': records[-16:]}
except OSError as error:
    snapshot['errors'].append('Cannot read UxPlay receive log: ' + str(error))
snapshot['captured_at_epoch'] = time.time()
print(json.dumps(snapshot))
PY
"""

# Emit only known startup markers, never arbitrary device identifiers, URLs,
# process arguments, or raw logs. Offsets and inode baselines prevent historic
# success markers from satisfying a new physical session.
SSH_STARTUP_READ_ONLY = r"""python3 - <<'PY'
import json, os, re, time
from pathlib import Path
snapshot = {'captured_at_epoch': time.time(), 'logs': {}, 'errors': []}
patterns = [
 ('session_auth', re.compile(rb'^auth complete$'), ()),
 ('video_open', re.compile(rb'VideoChannelHandler: openChannel channel (\d+)'), ('channel',)),
 ('video_setup', re.compile(rb'VideoChannelHandler: setup status=(-?\d+) max_unacked=(-?\d+) config0=([01]) accepted=([01])'), ('status', 'max_unacked', 'config0', 'accepted')),
 ('video_request', re.compile(rb'VideoChannelHandler: requesting PROJECTED focus on channel (\d+)'), ('channel',)),
 ('video_grant', re.compile(rb'VideoChannelHandler: VideoFocusIndication mode=(\d+) unrequested=([01])'), ('mode', 'unrequested')),
 ('video_start', re.compile(rb'VideoChannelHandler: StartIndication on channel (\d+)'), ('channel',)),
 ('input_open', re.compile(rb'InputChannelHandler: channel (\d+) ChannelOpenResponse parsed=([01]) status=(-?\d+) accepted=([01])'), ('channel', 'parsed', 'status', 'accepted')),
 ('input_bind', re.compile(rb'InputChannelHandler: channel (\d+) InputBindingResponse parsed=([01]) status=(-?\d+) accepted=([01])'), ('channel', 'parsed', 'status', 'accepted')),
 ('input_request', re.compile(rb'automatically binding input channel id=(\d+)'), ('channel',)),
 ('input_accepted', re.compile(rb'input binding accepted on channel (\d+)'), ('channel',)),
 ('input_failure', re.compile(rb'InputChannelHandler: channel (\d+) (?:open|binding) timed out'), ('channel',)),
 ('input_failure', re.compile(rb'input (?:channel unavailable|binding rejected or malformed|binding did not complete)'), ()),
 ('video_failure', re.compile(rb'VideoChannelHandler: malformed VideoFocusIndication ignored'), ()),
]
for name in ('aaserver', 'inject'):
    try:
        path = Path('/var/log/airplay-aa/' + name + '.log')
        with path.open('rb') as stream:
            metadata = os.fstat(stream.fileno())
            start = max(0, metadata.st_size - 262144)
            stream.seek(start)
            data = stream.read(metadata.st_size - start)
        records, position, video_channel = [], start, None
        for line in data.splitlines(keepends=True):
            if position != start or start == 0:
                for kind, pattern, attributes in patterns:
                    match = pattern.search(line.rstrip(b'\r\n'))
                    if not match:
                        continue
                    record = {'offset': position, 'kind': kind,
                              'marker': match.group(0).decode('ascii')[:320]}
                    record.update({key: int(value) for key, value in zip(attributes, match.groups())})
                    if kind == 'session_auth':
                        video_channel = None
                    elif kind == 'video_open':
                        video_channel = record['channel']
                    elif kind in ('video_setup', 'video_grant', 'video_failure'):
                        # These production markers omit channel; require the
                        # preceding opener, and reject ambiguous multi-channel
                        # sessions in the host evaluator.
                        record['channel'] = video_channel
                        record['channel_from_open'] = True
                    records.append(record)
                    break
            position += len(line)
        snapshot['logs'][name] = {'path': str(path), 'device': metadata.st_dev,
                                  'inode': metadata.st_ino, 'size': metadata.st_size,
                                  'tail_bytes_read': len(data), 'records': records[-128:]}
    except OSError as error:
        snapshot['errors'].append('Cannot read ' + name + ' startup evidence: ' + str(error))
snapshot['captured_at_epoch'] = time.time()
print(json.dumps(snapshot))
PY
"""


def structured_collection_command(*, airplay: bool, startup: bool) -> str:
    if not (airplay and startup):
        return SSH_AIRPLAY_READ_ONLY if airplay else SSH_STARTUP_READ_ONLY
    # Both collectors remain directly executable/testable. Combining their
    # fixed Python bodies keeps a snapshot to one bounded SSH connection.
    def body(command: str) -> str:
        return command.split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
    airplay_body = body(SSH_AIRPLAY_READ_ONLY).replace("print(json.dumps(snapshot))", "airplay_snapshot = snapshot")
    startup_body = body(SSH_STARTUP_READ_ONLY).replace("print(json.dumps(snapshot))", "startup_snapshot = snapshot")
    return ("python3 - <<'PY'\n" + airplay_body + "\n" + startup_body +
            "\nprint(json.dumps({'airplay': airplay_snapshot, 'startup': startup_snapshot}))\nPY\n")


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def set_stage(summary: dict, name: str, status: str, detail: str, **evidence) -> None:
    summary["stages"][name] = {"status": status, "detail": detail, **evidence}


def write_summary(summary: dict, out: Path) -> None:
    summary["finished_at"] = utc_now()
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


def command_result(command: list[str], timeout: float, *, input_text: str | None = None) -> dict:
    try:
        result = subprocess.run(command, input=input_text, capture_output=True, text=True, timeout=timeout)
        return {"returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"returncode": None, "stdout": "", "stderr": str(exc)}


def compatible_usb(text: str) -> list[dict]:
    matches = []
    for block in re.split(r"(?m)^[^\n]*\+-o\s+", text):
        vendor = re.search(r'"idVendor"\s*=\s*(\d+)', block)
        product = re.search(r'"idProduct"\s*=\s*(\d+)', block)
        ids = (int(vendor.group(1)), int(product.group(1))) if vendor and product else None
        name = block.splitlines()[0] if block.splitlines() else ""
        serial = re.search(r'"USB Serial Number"\s*=\s*"([^"\n]+)"', block)
        if "AAServer" in name or (serial and serial.group(1) == "TAGAAS") or ids in (
            (0x12D1, 0x107E), (0x18D1, 0x2D00), (0x18D1, 0x2D01)
        ):
            matches.append({"name": name, "vid_pid": f"{ids[0]:04x}:{ids[1]:04x}" if ids else None,
                            "serial": serial.group(1) if serial else None})
    return matches


def collect_pi(host: str, out: Path, label: str, *, airplay: bool = False, startup: bool = False) -> dict:
    result = command_result(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "ConnectionAttempts=1",
         host, "bash -s"], 12, input_text=structured_collection_command(airplay=airplay, startup=startup)
         if airplay or startup else SSH_READ_ONLY
    )
    path = out / f"pi-{label}.log"
    path.write_text(result["stdout"] + result["stderr"])
    evidence = {"log": str(path), "returncode": result["returncode"],
                "collected": result["returncode"] == 0, "read_only": True}
    if (airplay or startup) and evidence["collected"]:
        try:
            snapshot = json.loads(result["stdout"])
            if not isinstance(snapshot, dict):
                raise ValueError("snapshot was not an object")
            if airplay:
                evidence["airplay"] = snapshot["airplay"] if startup else snapshot
            if startup:
                evidence["startup"] = snapshot["startup"] if airplay else snapshot
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            evidence.update(collected=False, error="Cannot parse structured Pi snapshot: " + str(error))
    elif not evidence["collected"]:
        evidence["error"] = result["stderr"][-1000:] or "Read-only SSH collection failed."
    return evidence


def airplay_snapshot_problem(evidence: dict | None) -> str | None:
    if not evidence or not evidence.get("collected"):
        return "Read-only Pi collection is unavailable or failed."
    if not isinstance(evidence.get("log"), str) or not evidence["log"]:
        return "Pi snapshot evidence file is missing."
    snapshot = evidence.get("airplay")
    if not isinstance(snapshot, dict):
        return "Structured Pi AirPlay receive evidence is missing."
    if snapshot.get("errors"):
        return " ".join(str(error) for error in snapshot["errors"])
    lines = snapshot.get("source_config_lines", [])
    if not isinstance(lines, list) or len(lines) != 1 or not isinstance(lines[0], str) or not AIRPLAY_SOURCE_LINE.fullmatch(lines[0]):
        return "Expected one explicit AIRPLAY_AA_SOURCE=airplay line in /etc/airplay-aa/bridge.env."
    log = snapshot.get("uxplay_log")
    if not isinstance(log, dict) or any(not isinstance(log.get(name), int) or log[name] < 0 for name in ("device", "inode", "size")):
        return "UxPlay log identity/byte baseline is missing or invalid."
    captured = snapshot.get("captured_at_epoch")
    if not isinstance(captured, (int, float)) or not math.isfinite(captured):
        return "Pi collection timestamp is missing or invalid."
    if not isinstance(log.get("packets"), list):
        return "UxPlay packet evidence is missing."
    return None


def evaluate_airplay(before: dict | None, after: dict | None) -> dict:
    """Validate live Pi receive activity; it does not identify screenshot content."""
    result = {"status": "FAILED", "detail": "AirPlay receive activity was not demonstrated.",
              "content_identity": "Requires visual comparison with the Mac source; logs do not identify pixels."}
    for label, evidence in (("before", before), ("after", after)):
        problem = airplay_snapshot_problem(evidence)
        if problem:
            result["detail"] = f"{label.capitalize()} AirPlay evidence failed: {problem}"
            return result
    assert before is not None and after is not None
    first, last = before["airplay"], after["airplay"]
    old_log, new_log = first["uxplay_log"], last["uxplay_log"]
    result.update(before_log=before["log"], after_log=after["log"],
                  source_config_line=last["source_config_lines"][0],
                  before_size=old_log["size"], after_size=new_log["size"])
    if (old_log["device"], old_log["inode"]) != (new_log["device"], new_log["inode"]) or new_log["size"] < old_log["size"]:
        result["detail"] = "UxPlay log rotated or truncated; freshness cannot be proved from this baseline. Rerun the bench."
        return result
    if last["captured_at_epoch"] <= first["captured_at_epoch"]:
        result["detail"] = "Pi collection clock did not advance; receive freshness cannot be proved."
        return result
    fresh = []
    for packet in new_log["packets"]:
        if not isinstance(packet, dict):
            continue
        numbers = [packet.get(name) for name in ("offset", "receive_epoch", "packet_timestamp", "size")]
        if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in numbers):
            continue
        if old_log["size"] <= packet["offset"] < new_log["size"] and packet["size"] > 0 and first["captured_at_epoch"] - 1 <= packet["receive_epoch"] <= last["captured_at_epoch"] + 1:
            fresh.append(packet)
    result["fresh_packet_count"] = len(fresh)
    if len(fresh) < 2:
        result["detail"] = "Fewer than two new mirrored H.264 receive records were appended during this run; historic/stale markers cannot pass."
        return result
    oldest, newest = fresh[0], fresh[-1]
    receive_advance = newest["receive_epoch"] - oldest["receive_epoch"]
    packet_advance = newest["packet_timestamp"] - oldest["packet_timestamp"]
    result.update(first_new_packet=oldest, latest_new_packet=newest,
                  receive_timestamp_advance_seconds=round(receive_advance, 6),
                  packet_timestamp_advance_seconds=round(packet_advance, 6))
    if receive_advance <= 0 or packet_advance <= 0:
        result["detail"] = "New log records did not contain advancing receive and H.264 packet timestamps."
        return result
    if last["captured_at_epoch"] - newest["receive_epoch"] > 5:
        result["detail"] = "The newest mirrored H.264 receive record is older than five seconds at final collection."
        return result
    historical = old_log["packets"]
    if historical and isinstance(historical[-1], dict):
        previous = historical[-1]
        if any(not isinstance(previous.get(name), (int, float)) or newest[name] <= previous[name] for name in ("receive_epoch", "packet_timestamp")):
            result["detail"] = "Mirrored H.264 timestamps did not advance beyond the pre-session baseline."
            return result
    result.update(status="PASSED", detail="Pi selects airplay and received newly appended mirrored H.264 packets with advancing timestamps during this run. Screenshot source identity requires visual comparison.")
    return result


def startup_snapshot_problem(evidence: dict | None) -> str | None:
    if not evidence or not evidence.get("collected") or not evidence.get("log"):
        return "Read-only Pi startup collection is unavailable or failed."
    snapshot = evidence.get("startup")
    if not isinstance(snapshot, dict):
        return "Structured Pi startup evidence is missing."
    if snapshot.get("errors"):
        return " ".join(str(error) for error in snapshot["errors"])
    captured = snapshot.get("captured_at_epoch")
    if not isinstance(captured, (int, float)) or not math.isfinite(captured):
        return "Pi startup collection timestamp is invalid."
    logs = snapshot.get("logs")
    if not isinstance(logs, dict):
        return "Startup log baselines are missing."
    for name in ("aaserver", "inject"):
        log = logs.get(name)
        if (not isinstance(log, dict) or not isinstance(log.get("records"), list)
                or any(not isinstance(log.get(field), int) or log[field] < 0
                       for field in ("device", "inode", "size"))):
            return f"{name} log identity, byte baseline, or records are invalid."
    return None


def evaluate_auto_start(before: dict | None, after: dict | None, session: dict | None) -> dict:
    """Prove initialization from fresh production replies; never infer from pixels."""
    results = {name: {"status": "FAILED", "detail": "Automatic startup was not demonstrated."}
               for name in ("input", "automatic_focus")}

    def fail(detail: str) -> dict:
        for result in results.values():
            result["detail"] = detail
        return results

    for label, evidence in (("before", before), ("after", after)):
        problem = startup_snapshot_problem(evidence)
        if problem:
            return fail(f"{label.capitalize()} startup evidence failed: {problem}")
    if (not isinstance(session, dict) or session.get("console_video_focus_override") is not False
            or not isinstance(session.get("console_commands"), list)):
        return fail("No trustworthy record excluding a console video-focus override.")
    for command in session["console_commands"]:
        if (not isinstance(command, dict) or not isinstance(command.get("command"), str)
                or any(line.split() and line.split()[0].lower() == "focus"
                       for line in command["command"].splitlines())):
            return fail("A console focus override or malformed console record invalidates automatic-start acceptance.")
    assert before is not None and after is not None
    first, last = before["startup"], after["startup"]
    if last["captured_at_epoch"] <= first["captured_at_epoch"]:
        return fail("Pi startup collection clock did not advance.")
    fresh = {}
    for name in ("aaserver", "inject"):
        old, new = first["logs"][name], last["logs"][name]
        if (old["device"], old["inode"]) != (new["device"], new["inode"]) or new["size"] < old["size"]:
            return fail(f"{name} log rotated or truncated; a fresh startup cannot be proved. Rerun the bench.")
        fresh[name] = sorted((record for record in new["records"]
                              if isinstance(record, dict) and isinstance(record.get("offset"), int)
                              and old["size"] <= record["offset"] < new["size"]),
                             key=lambda record: record["offset"])
        for result in results.values():
            result.update(before_log=before["log"], after_log=after["log"])
    auth = [record for record in fresh["aaserver"] if record.get("kind") == "session_auth"]
    if not auth:
        return fail("No fresh authenticated AA session marker; historic or cached initialization cannot pass.")
    if len(auth) != 1:
        return fail("Multiple fresh AA sessions make cross-log input attribution ambiguous. Rerun one clean session.")
    # Do not combine success from one USB connection with focus from another.
    server = [record for record in fresh["aaserver"] if record["offset"] > auth[-1]["offset"]]
    injection = fresh["inject"]

    def valid_channel(value) -> bool:
        return isinstance(value, int) and not isinstance(value, bool) and 0 < value < 255

    def input_ok(record: dict) -> bool:
        return record.get("parsed") == 1 and record.get("status") == 0 and record.get("accepted") == 1

    requests = [record for record in injection if record.get("kind") == "input_request"
                and valid_channel(record.get("channel"))]
    if not requests:
        results["input"]["detail"] = "No fresh automatic input-registration request from the injector."
    else:
        request = requests[-1]
        channel = request["channel"]
        opened = [record for record in server if record.get("kind") == "input_open" and record.get("channel") == channel]
        bound = [record for record in server if record.get("kind") == "input_bind" and record.get("channel") == channel]
        accepted = [record for record in injection if record.get("kind") == "input_accepted"
                    and record.get("channel") == channel and record["offset"] > request["offset"]]
        failed = [record for record in server + injection if record.get("kind") == "input_failure"
                  and record.get("channel") in (None, channel)]
        if failed or any(not input_ok(record) for record in opened + bound):
            results["input"].update(detail="Input initialization timed out or the real HU response was rejected/malformed.",
                                    channel=channel, failures=failed + [record for record in opened + bound if not input_ok(record)])
        elif opened and bound and accepted and opened[0]["offset"] < bound[0]["offset"]:
            results["input"].update(status="PASSED", channel=channel,
                                    detail="Fresh automatic input registration received real channel-open and binding status 0, then injector acceptance.",
                                    server_records=[opened[0], bound[0]], injector_records=[request, accepted[-1]])
        else:
            results["input"].update(channel=channel,
                                    detail="Fresh, ordered input channel-open/binding status 0 and injector acceptance were not all observed.")

    video = [record for record in server if str(record.get("kind", "")).startswith("video_")]
    openers = [record for record in video if record.get("kind") == "video_open"]
    channels = {record.get("channel") for record in openers}
    if len(openers) != 1 or len(channels) != 1 or not all(valid_channel(channel) for channel in channels):
        results["automatic_focus"]["detail"] = "Missing or ambiguous fresh video-channel opener; channel-less setup/focus logs cannot be associated safely."
        return results
    channel = next(iter(channels))
    results["automatic_focus"]["channel"] = channel
    if results["input"]["status"] == "PASSED" and results["input"]["server_records"][1]["offset"] >= openers[0]["offset"]:
        results["input"].update(status="FAILED", detail="Real input binding occurred after video opening; the intended automatic input-first startup was not demonstrated.")
    related = [record for record in video if record.get("channel") == channel]
    rejected = [record for record in related if record.get("kind") == "video_failure"
                or (record.get("kind") == "video_setup" and
                    (record.get("status") != 2 or record.get("accepted") != 1
                     or record.get("config0") != 1 or record.get("max_unacked", 0) <= 0))]
    if rejected:
        results["automatic_focus"].update(detail="Video setup/focus included a rejected or malformed real HU response.", failures=rejected)
        return results
    expected = ("video_open", "video_setup", "video_request", "video_grant", "video_start")
    proof, index = [], 0
    for record in related:
        kind = record.get("kind")
        if kind == "video_grant" and index == 4:
            if record.get("mode") not in (1, 4):
                results["automatic_focus"].update(detail="HU revoked projected focus before StartIndication.", failures=[record])
                return results
            proof[-1] = record  # The latest grant preceding Start must project.
            continue
        if kind != expected[index]:
            continue
        if kind == "video_grant" and record.get("mode") not in (1, 4):
            results["automatic_focus"].update(detail="HU granted native/unsupported focus instead of projection.", failures=[record])
            return results
        proof.append(record)
        index += 1
        if index == len(expected):
            results["automatic_focus"].update(status="PASSED", records=proof,
                                               detail="Fresh accepted setup → Pi PROJECTED request → HU projected grant → StartIndication on one video channel, with no console override.")
            return results
    results["automatic_focus"]["detail"] = "The fresh ordered setup → Pi focus request → HU projected grant → Start sequence is incomplete."
    return results


def decode_image(path: Path, ffmpeg: str) -> tuple[dict, bytes | None]:
    try:
        with path.open("rb") as image:
            header = image.read(24)
        if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("DHU screenshot is not a PNG")
        width, height = struct.unpack(">II", header[16:24])
        if width < 160 or height < 96 or width > 8192 or height > 8192:
            raise ValueError(f"unexpected screenshot dimensions {width}x{height}")
        result = subprocess.run(
            [ffmpeg, "-v", "error", "-i", str(path), "-vf", "scale=160:96:flags=area,format=rgb24",
             "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
            capture_output=True, timeout=10
        )
        if result.returncode != 0 or len(result.stdout) != 160 * 96 * 3:
            raise ValueError(result.stderr.decode(errors="replace") or "incomplete decoded pixels")
        pixels = result.stdout
        luminance = [(pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
                     for i in range(0, len(pixels), 3)]
        mean = sum(luminance) / len(luminance)
        lit_fraction = sum(value > 16 for value in luminance) / len(luminance)
        nonblank = mean > 5 and lit_fraction >= 0.05
        return {"path": str(path), "width": width, "height": height, "decoded": True,
                "mean_luma": round(mean, 3), "nonblack_fraction": round(lit_fraction, 4),
                "nonblank": nonblank}, pixels
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        return {"path": str(path), "decoded": False, "nonblank": False, "error": str(exc)}, None


def compare_frames(first: bytes, second: bytes) -> dict:
    mean_difference = sum(abs(a - b) for a, b in zip(first, second)) / len(first)
    changed = sum(sum(abs(first[i + j] - second[i + j]) for j in range(3)) / 3 >= 8
                  for i in range(0, len(first), 3)) / (len(first) / 3)
    return {"mean_absolute_rgb_difference": round(mean_difference, 4),
            "changed_pixel_fraction": round(changed, 4),
            "motion": mean_difference >= 0.75 and changed >= 0.01,
            "thresholds": {"mean_absolute_rgb_difference": 0.75, "changed_pixel_fraction": 0.01}}


def smpte_bars(pixels: bytes) -> dict:
    """Recognize SMPTE's top seven bars; its bottom-right noise supplies motion."""
    colors = ((1, 1, 1), (1, 1, 0), (0, 1, 1), (0, 1, 0), (1, 0, 1), (1, 0, 0), (0, 0, 1))
    samples = []
    for index, channels in enumerate(colors):
        x = int((index + 0.5) * 160 / 7)
        rgb = []
        for channel in range(3):
            rgb.append(sum(pixels[(y * 160 + xx) * 3 + channel]
                           for y in range(31, 34) for xx in range(x - 1, x + 2)) / 9)
        matched = all(value >= 100 if high else value <= 70 for value, high in zip(rgb, channels))
        samples.append({"bar": index + 1, "rgb": [round(value, 1) for value in rgb], "matched": matched})
    return {"matched": all(sample["matched"] for sample in samples), "samples": samples,
            "expected_order": ["white", "yellow", "cyan", "green", "magenta", "red", "blue"]}


def run_dhu(args: argparse.Namespace, summary: dict, out: Path, ffmpeg: str) -> None:
    env = os.environ.copy()
    cleared = []
    for key in ("DYLD_INSERT_LIBRARIES", "DYLD_FORCE_FLAT_NAMESPACE", "LD_PRELOAD"):
        if key in env:
            cleared.append(key)
        env.pop(key, None)
    env["DYLD_LIBRARY_PATH"] = str(args.dhu_dir)
    command = ["arch", "-x86_64", str(args.dhu_dir / "desktop-head-unit"),
               "-c", str(args.config), "--usb", args.usb_serial]
    if args.headless:
        command.append("--headless")
    summary["session"] = {"command": command, "duration_limit_seconds": args.duration,
                          "headless": args.headless,
                          "console_video_focus_override": False,
                          "tls_bypass_environment_cleared": cleared,
                          "tls_bypass_enabled": False, "screenshots": [], "console_commands": []}
    master, slave = pty.openpty()
    proc = None
    requested_quit = False
    early_exit = False
    transcript = ""
    started = time.monotonic()
    deadline = started + args.duration
    ready_at = None
    next_capture = None
    captures = []
    requested = []
    decoded_paths = set()
    log_path = out / "dhu.log"
    summary["session"]["log"] = str(log_path)

    def send(line: str) -> None:
        assert proc is not None and proc.stdin is not None
        proc.stdin.write((line + "\n").encode())
        proc.stdin.flush()
        summary["session"]["console_commands"].append({"elapsed_seconds": round(time.monotonic() - started, 2),
                                                        "command": line})

    def read_output(log, wait: float) -> bool:
        nonlocal transcript
        if select.select([master], [], [], wait)[0]:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                return False
            if chunk:
                log.write(chunk)
                log.flush()
                transcript = (transcript + chunk.decode(errors="replace"))[-8_000_000:]
                return True
        return False

    try:
        proc = subprocess.Popen(command, cwd=out, env=env, stdin=subprocess.PIPE,
                                stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        slave = -1
        with log_path.open("wb") as log:
            while time.monotonic() < deadline:
                read_output(log, 0.2)
                for name, pattern in PATTERNS.items():
                    found = pattern.search(transcript)
                    if found:
                        set_stage(summary, name, "PASSED", "Observed in the current DHU session.",
                                  log=str(log_path), marker=found.group(0))
                authenticated = all(summary["stages"][name]["status"] == "PASSED" for name in PATTERNS)
                if authenticated and ready_at is None:
                    ready_at = time.monotonic()
                    next_capture = ready_at + 3
                    # The phone must request projection itself. Granting focus
                    # here hid a production stall on passive car head units.
                now = time.monotonic()
                if next_capture is not None and now >= next_capture and len(requested) < 4:
                    path = out / f"frame-{len(requested) + 1}-{summary['run_id']}.png"
                    send(f"screenshot {path.name}")
                    requested.append((path, now))
                    next_capture = now + args.screenshot_interval
                for path, at in requested:
                    if path not in decoded_paths and path.exists() and now - at >= 0.6:
                        metric, pixels = decode_image(path, ffmpeg)
                        metric["elapsed_seconds"] = round(at - started, 2)
                        if pixels is not None and args.expect_smpte:
                            metric["smpte"] = smpte_bars(pixels)
                        summary["session"]["screenshots"].append(metric)
                        decoded_paths.add(path)
                        if pixels is not None and metric["nonblank"]:
                            captures.append((metric, pixels))
                if len(captures) >= 2:
                    first, second = captures[-2:]
                    motion = compare_frames(first[1], second[1])
                    if motion["motion"]:
                        summary["session"]["frame_comparison"] = {
                            "first": first[0]["path"], "second": second[0]["path"],
                            "separation_seconds": round(second[0]["elapsed_seconds"] - first[0]["elapsed_seconds"], 2),
                            **motion
                        }
                        # Keep observing briefly so a connection failure is not hidden by an early frame.
                        if now >= requested[-1][1] + 2:
                            break
                if proc.poll() is not None:
                    early_exit = True
                    break
            if proc.poll() is None:
                send("quit")
                requested_quit = True
                for _ in range(10):
                    read_output(log, 0.2)
                    if proc.poll() is not None:
                        break
            else:
                early_exit = True
            while read_output(log, 0):
                pass
    finally:
        if slave >= 0:
            os.close(slave)
        if proc is not None:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)
            summary["session"]["process_returncode"] = proc.returncode
            summary["session"]["requested_quit"] = requested_quit
            summary["session"]["unexpected_process_exit"] = early_exit
        os.close(master)
        summary["session"]["elapsed_seconds"] = round(time.monotonic() - started, 2)

    errors = list(dict.fromkeys(match.group(0) for match in FAILURES.finditer(transcript)))
    summary["session"]["errors"] = errors
    for name in PATTERNS:
        if summary["stages"][name]["status"] != "PASSED":
            set_stage(summary, name, "FAILED", "Required handshake marker was not observed within the bounded session.",
                      log=str(log_path))
    if errors:
        set_stage(summary, "tls" if any(re.search(r"certificate|SSL|auth|handshake", error, re.I) for error in errors)
                  else "video", "FAILED", "DHU reported a session error.", errors=errors, log=str(log_path))
    if early_exit or summary["session"].get("process_returncode") != 0:
        set_stage(summary, "video", "FAILED", "DHU exited unexpectedly or did not shut down cleanly; an exit code of zero alone is insufficient.",
                  unexpected_exit=early_exit, returncode=summary["session"].get("process_returncode"), log=str(log_path))
    set_stage(summary, "render", "PASSED" if len(captures) >= 2 else "FAILED",
              "At least two actual DHU screenshots decoded to nonblank pixels." if len(captures) >= 2
              else "Fewer than two nonblank DHU screenshots were decoded.",
              nonblank_frame_count=len(captures), decoder=ffmpeg)
    if captures:
        handshake_ok = all(summary["stages"][name]["status"] == "PASSED" for name in PATTERNS)
        if summary["stages"]["video"]["status"] != "FAILED":
            set_stage(summary, "video", "PASSED" if handshake_ok else "FAILED",
                      "Decoded head-unit video after accessory mode, protocol negotiation, and TLS."
                      if handshake_ok else "Pixels were captured, but complete handshake evidence is missing.")
    elif summary["stages"]["video"]["status"] != "FAILED":
        set_stage(summary, "video", "FAILED", "No nonblank decoded head-unit video was captured.")
    comparison = summary["session"].get("frame_comparison")
    if comparison is None and len(captures) >= 2:
        comparison = {"first": captures[-2][0]["path"], "second": captures[-1][0]["path"],
                      **compare_frames(captures[-2][1], captures[-1][1])}
        summary["session"]["frame_comparison"] = comparison
    set_stage(summary, "motion", "PASSED" if comparison and comparison["motion"] else "FAILED",
              "Decoded image content changed above both motion thresholds." if comparison and comparison["motion"]
              else "Changing decoded content was not demonstrated; idle black or a static screen cannot pass.",
              comparison=comparison)
    if args.expect_smpte:
        compared_paths = {comparison["first"], comparison["second"]} if comparison else set()
        matching = [metric for metric, _ in captures if metric["path"] in compared_paths and metric.get("smpte", {}).get("matched")]
        set_stage(summary, "pattern", "PASSED" if len(matching) == 2 else "FAILED",
                  "Both compared decoded frames contain the expected SMPTE color bars." if len(matching) == 2
                  else "The expected SMPTE color-bar source was not confirmed in two decoded frames.",
                  matching_frame_count=len(matching))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".local" / "bench" / dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
    parser.add_argument("--duration", type=float, default=45, help="Maximum DHU session seconds (15–300; default 45).")
    parser.add_argument("--screenshot-interval", type=float, default=5, help="Seconds between DHU screenshots (at least 3).")
    parser.add_argument("--dhu-dir", type=Path, default=ROOT / ".local" / "dhu")
    parser.add_argument("--config", type=Path, help="DHU .ini configuration; defaults to dhu-dir/config/aa_bridge.ini.")
    parser.add_argument("--usb-serial", default="TAGAAS", help="Actual USB gadget serial to select (default TAGAAS).")
    parser.add_argument("--ffmpeg", help="Host ffmpeg executable used to decode screenshots.")
    parser.add_argument("--headless", action="store_true", help="Use DHU's native headless mode to hide its preview window (opt-in; useful for whole-Desktop AirPlay mirroring).")
    source_expectation = parser.add_mutually_exclusive_group()
    source_expectation.add_argument("--expect-smpte", action="store_true", help="Also require SMPTE bar identity in both decoded frames (for the Pi test-pattern source).")
    source_expectation.add_argument("--expect-airplay", action="store_true", help="Require airplay source and fresh advancing mirrored H.264 receive evidence on the Pi; requires --pi-host. Visually compare source content separately.")
    parser.add_argument("--expect-auto-start", action="store_true", help="Require fresh real input binding and ordered phone-requested projection without a DHU focus override; requires --pi-host.")
    parser.add_argument("--pi-host", help="User@host for bounded read-only Pi evidence; required with --expect-airplay. No restarts or gadget reads.")
    args = parser.parse_args(argv)
    if args.expect_airplay and not args.pi_host:
        parser.error("--expect-airplay requires --pi-host for current source and fresh receive evidence")
    if args.expect_auto_start and not args.pi_host:
        parser.error("--expect-auto-start requires --pi-host for fresh input/focus response evidence")
    if not 15 <= args.duration <= 300:
        parser.error("--duration must be between 15 and 300 seconds")
    if args.screenshot_interval < 3 or args.screenshot_interval > args.duration / 2:
        parser.error("--screenshot-interval must be at least 3 seconds and no greater than half --duration")
    if args.pi_host and (args.pi_host.startswith("-") or not re.fullmatch(r"[A-Za-z0-9_.@:\[\]-]+", args.pi_host)):
        parser.error("--pi-host must be a plain SSH host or user@host")
    if not args.usb_serial or args.usb_serial.startswith("-") or any(character.isspace() for character in args.usb_serial):
        parser.error("--usb-serial must be a nonempty device serial without whitespace or an initial dash")
    args.dhu_dir = args.dhu_dir.expanduser().resolve()
    args.config = (args.config or args.dhu_dir / "config" / "aa_bridge.ini").expanduser().resolve()
    out = args.output_dir.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    summary = {"schema_version": 3, "run_id": uuid.uuid4().hex[:8], "started_at": utc_now(),
               "overall": {"status": "UNKNOWN", "outcome": "BLOCKED"},
               "scope": "Real Pi USB AOAP + AA protocol + DHU TLS + decoded head-unit video; source content must be supplied separately.",
               "expect_auto_start": args.expect_auto_start,
               "stages": {name: {"status": "UNKNOWN", "detail": "Not exercised."} for name in STAGES}}
    for name in ("input", "automatic_focus"):
        set_stage(summary, name, "UNKNOWN" if args.expect_auto_start else "NOT_TESTED",
                  "Fresh actual input/focus responses are required." if args.expect_auto_start
                  else "Automatic initialization acceptance was not requested; use --expect-auto-start --pi-host user@host.")
    set_stage(summary, "airplay", "UNKNOWN" if args.expect_airplay else "NOT_TESTED",
              "AirPlay source and fresh receive evidence are required." if args.expect_airplay
              else "AirPlay acceptance was not requested; use --expect-airplay --pi-host user@host.")
    problems = []
    if platform.system() != "Darwin":
        problems.append("This runner requires macOS and the bundled Mac DHU.")
    for path in (args.dhu_dir / "desktop-head-unit", args.dhu_dir / "libusb-1.0.so", args.config):
        if not path.is_file():
            problems.append(f"Missing prerequisite: {path}")
    if (args.dhu_dir / "desktop-head-unit").is_file() and not os.access(args.dhu_dir / "desktop-head-unit", os.X_OK):
        problems.append("DHU binary is not executable.")
    ffmpeg = shutil.which(args.ffmpeg or "ffmpeg")
    if not ffmpeg:
        problems.append("Host ffmpeg is unavailable; use --ffmpeg /absolute/path.")
    rosetta = command_result(["arch", "-x86_64", "/usr/bin/true"], 5)
    if rosetta["returncode"] != 0:
        problems.append("The x86_64 DHU runtime is unavailable (Rosetta on Apple Silicon).")
    inventory = command_result(["ioreg", "-p", "IOUSB", "-l", "-w0"], 5)
    usb_log = out / "usb-preflight.log"
    usb_log.write_text(inventory["stdout"] + inventory["stderr"])
    devices = compatible_usb(inventory["stdout"])
    set_stage(summary, "usb", "PASSED" if devices else "FAILED",
              "Compatible Pi gadget is enumerated on this Mac." if devices
              else "No AAServer/TAGAAS or Android accessory gadget is connected to this Mac.",
              devices=devices, log=str(usb_log))
    if inventory["returncode"] != 0:
        problems.append("USB inventory could not be read.")
    if not devices:
        problems.append("Connect Pi USB-C to this Mac with a data-capable cable and adequate power.")
    if args.pi_host:
        pi = collect_pi(args.pi_host, out, "before", airplay=args.expect_airplay, startup=args.expect_auto_start)
        summary["pi"] = {"host": args.pi_host, "before": pi}
        set_stage(summary, "pi_collection", "PASSED" if pi["collected"] else "UNKNOWN",
                  "Read-only Pi evidence collected." if pi["collected"] else "Pi evidence unavailable; DHU can still test the physical path.",
                  before=pi)
        if args.expect_airplay:
            problem = airplay_snapshot_problem(pi)
            if problem:
                set_stage(summary, "airplay", "FAILED", "Before AirPlay evidence failed: " + problem, before=pi)
                set_stage(summary, "pi_collection", "FAILED", "Required AirPlay Pi evidence is unavailable or invalid.", before=pi)
                problems.append("AirPlay acceptance preflight failed: " + problem)
        if args.expect_auto_start:
            problem = startup_snapshot_problem(pi)
            if problem:
                for name in ("input", "automatic_focus"):
                    set_stage(summary, name, "FAILED", "Before startup evidence failed: " + problem, before=pi)
                set_stage(summary, "pi_collection", "FAILED", "Required startup Pi evidence is unavailable or invalid.", before=pi)
                problems.append("Automatic-start acceptance preflight failed: " + problem)
    if problems:
        set_stage(summary, "preflight", "FAILED", "DHU was not launched; the physical test remains unexercised.", problems=problems)
        summary["overall"]["reason"] = " ".join(problems)
        if ((args.expect_airplay and summary["stages"]["airplay"]["status"] == "FAILED")
                or (args.expect_auto_start and summary["stages"]["input"]["status"] == "FAILED")):
            summary["overall"].update(status="FAILED", outcome="FAILED")
        write_summary(summary, out)
        print(f"{summary['overall']['outcome']}: {summary['overall']['reason']}\nEvidence: {out / 'summary.json'}")
        return 1 if summary["overall"]["outcome"] == "FAILED" else 2
    set_stage(summary, "preflight", "PASSED", "Mac DHU, bundled libusb, Rosetta, ffmpeg, configuration, and USB gadget are available.")
    code = 1
    session_completed = False
    try:
        assert ffmpeg is not None
        run_dhu(args, summary, out, ffmpeg)
        session_completed = True
    except KeyboardInterrupt:
        summary["overall"] = {"status": "UNKNOWN", "outcome": "INTERRUPTED", "reason": "Bench session interrupted."}
        code = 130
    except (OSError, subprocess.SubprocessError, BrokenPipeError) as exc:
        summary["overall"] = {"status": "FAILED", "outcome": "FAILED", "reason": str(exc)}
        set_stage(summary, "video", "FAILED", "DHU session could not complete.", error=str(exc))
    finally:
        if args.pi_host:
            pi = collect_pi(args.pi_host, out, "after", airplay=args.expect_airplay, startup=args.expect_auto_start)
            summary["pi"]["after"] = pi
            both_collected = pi["collected"] and summary["pi"]["before"]["collected"]
            required_pi = args.expect_airplay or args.expect_auto_start
            set_stage(summary, "pi_collection", "PASSED" if both_collected else "FAILED" if required_pi else "UNKNOWN",
                      "Read-only Pi evidence collected before and after the session." if both_collected
                      else "Before/after Pi collection failed; requested source/startup acceptance requires both snapshots.",
                      before=summary["pi"]["before"], after=pi)
            if args.expect_airplay:
                summary["stages"]["airplay"] = evaluate_airplay(summary["pi"]["before"], pi)
            if args.expect_auto_start:
                summary["stages"].update(evaluate_auto_start(summary["pi"]["before"], pi, summary.get("session")))
        if session_completed:
            required = [name for name in STAGES if (name != "pi_collection" or args.expect_airplay or args.expect_auto_start)
                        and (name not in ("input", "automatic_focus") or args.expect_auto_start)
                        and (name != "pattern" or args.expect_smpte) and (name != "airplay" or args.expect_airplay)]
            passed = all(summary["stages"][name]["status"] == "PASSED" for name in required)
            reason = "Actual authenticated USB session rendered changing nonblank video."
            if args.expect_airplay and passed:
                reason = "Fresh mirrored H.264 receive activity on the Pi accompanied authenticated USB and changing DHU video. Visually compare Mac source content separately."
            if args.expect_auto_start and passed:
                reason += " Fresh real input binding and phone-requested projection completed without a console focus override."
            if not passed:
                failed = [name for name in required if summary["stages"][name]["status"] != "PASSED"]
                reason = "Required bench stages failed: " + ", ".join(failed) + "."
                if args.expect_airplay and summary["stages"]["airplay"]["status"] != "PASSED":
                    reason += " " + summary["stages"]["airplay"]["detail"]
            summary["overall"] = {"status": "PASSED" if passed else "FAILED", "outcome": "PASSED" if passed else "FAILED", "reason": reason}
            code = 0 if passed else 1
        write_summary(summary, out)
    print(f"{summary['overall']['outcome']}: {summary['overall']['reason']}\nEvidence: {out / 'summary.json'}")
    return code


if __name__ == "__main__":
    sys.exit(main())
