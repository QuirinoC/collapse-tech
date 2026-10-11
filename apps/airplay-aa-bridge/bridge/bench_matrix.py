#!/usr/bin/env python3
"""Run strict real-USB DHU profiles and retain the scope of their evidence."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROFILES = ("touch", "rotary", "hybrid")
COMMON_STAGES = ("preflight", "usb", "aoap", "protocol", "tls", "input",
                 "automatic_focus", "video", "render", "motion", "pi_collection",
                 "sustained_video")


def child_outcome(returncode: int, summary: dict | None, source: str, *,
                  minimum_seconds: float = 60, config: Path | None = None,
                  usb_serial: str = "TAGAAS") -> str:
    """A zero process exit cannot substitute for every required evidence stage."""
    if not isinstance(summary, dict):
        return "BLOCKED" if returncode == 2 else "FAILED"
    overall = summary.get("overall")
    stages = summary.get("stages")
    session = summary.get("session")
    if not isinstance(overall, dict) or not isinstance(stages, dict):
        return "FAILED"
    preflight = stages.get("preflight")
    if session is None and isinstance(preflight, dict) and preflight.get("status") == "FAILED":
        # DHU never launched: missing USB, SSH or prerequisites are a blocked
        # hardware test, not evidence that the phone failed interoperability.
        return "BLOCKED"
    if overall.get("outcome") == "BLOCKED" and returncode == 2:
        return "BLOCKED"
    required = (*COMMON_STAGES, "airplay" if source == "airplay" else "pattern")
    if not isinstance(session, dict):
        return "FAILED"
    if (returncode != 0 or overall.get("outcome") != "PASSED"
            or any(not isinstance(stages.get(name), dict)
                   or stages[name].get("status") != "PASSED" for name in required)
            or session.get("console_video_focus_override") is not False
            or session.get("tls_bypass_enabled") is not False
            or session.get("unexpected_process_exit") is not False
            or session.get("forced_process_termination") is not False
            or session.get("process_returncode") != 0
            or type(session.get("process_returncode")) is not int
            or session.get("requested_quit") is not True):
        return "FAILED"
    sustained = stages["sustained_video"]
    values = [sustained.get("requested_seconds"), sustained.get("observed_seconds"),
              session.get("minimum_video_seconds"), sustained.get("final_capture_age_seconds"),
              sustained.get("capture_interval_seconds"), sustained.get("capture_grace_seconds")]
    if any(type(value) not in (int, float) or not math.isfinite(value) for value in values):
        return "FAILED"
    if (values[0] != minimum_seconds or values[2] != minimum_seconds
            or values[1] < minimum_seconds or values[4] != 5 or values[5] != 2
            or not 0 <= values[3] <= values[4] + values[5]):
        return "FAILED"
    comparisons = sustained.get("comparisons")
    if not isinstance(comparisons, list) or not comparisons:
        return "FAILED"
    counts = [sustained.get("requested_capture_count"), sustained.get("moving_pair_count")]
    if (any(type(value) is not int for value in counts)
            or counts[0] != len(comparisons) + 1 or counts[1] != len(comparisons)):
        return "FAILED"
    timing = [sustained.get("first_decoded_elapsed_seconds"),
              sustained.get("last_capture_elapsed_seconds"), sustained.get("ended_elapsed_seconds")]
    if any(type(value) not in (int, float) or not math.isfinite(value) for value in timing):
        return "FAILED"
    if (not 0 <= timing[0] <= timing[1] <= timing[2]
            or abs((timing[1] - timing[0]) - values[1]) > .003
            or abs((timing[2] - timing[1]) - values[3]) > .003):
        return "FAILED"
    previous = None
    paths = set()
    span = 0.0
    for pair in comparisons:
        if not isinstance(pair, dict) or pair.get("motion") is not True:
            return "FAILED"
        first, second = pair.get("first"), pair.get("second")
        if (not isinstance(first, str) or not first or not isinstance(second, str) or not second
                or first == second or (previous is not None and first != previous)
                or second in paths):
            return "FAILED"
        paths.update((first, second))
        previous = second
        metrics = [pair.get("mean_absolute_rgb_difference"), pair.get("changed_pixel_fraction"),
                   pair.get("separation_seconds")]
        if (any(type(value) not in (int, float) or not math.isfinite(value) for value in metrics)
                or metrics[0] < .75 or not .01 <= metrics[1] <= 1
                or not values[4] - .001 <= metrics[2] <= values[4] + values[5]):
            return "FAILED"
        span += metrics[2]
    # Observation starts at decoding, shortly after the first capture request.
    # Rounded consecutive capture intervals must cover the claimed duration.
    rounding = .003 + .001 * len(comparisons)
    if not -rounding <= span - values[1] <= values[5] + rounding:
        return "FAILED"
    command = session.get("command")
    if not isinstance(command, list) or any(not isinstance(value, str) for value in command):
        return "FAILED"
    try:
        if command[command.index("--usb") + 1] != usb_serial:
            return "FAILED"
        if config is not None and command[command.index("-c") + 1] != str(config):
            return "FAILED"
    except (ValueError, IndexError):
        return "FAILED"
    return "PASSED"


def process_snapshot() -> list[tuple[int, int, int, str, str]]:
    result = subprocess.run(["ps", "-axo", "pid=,ppid=,pgid=,stat=,lstart="], capture_output=True,
                            text=True, timeout=3, check=True)
    rows = []
    for line in result.stdout.splitlines():
        pid, parent, group, state, started = line.split(maxsplit=4)
        rows.append((int(pid), int(parent), int(group), state, started))
    return rows


def descendant_snapshot(proc: subprocess.Popen) -> dict[int, tuple[int, str]]:
    rows = process_snapshot()
    owned = {proc.pid}
    changed = True
    while changed:
        changed = False
        for pid, parent, _, _, _ in rows:
            if parent in owned and pid not in owned:
                owned.add(pid)
                changed = True
    return {pid: (group, started) for pid, _, group, _, started in rows if pid in owned}


def force_cleanup(proc: subprocess.Popen, before: dict[int, tuple[int, str]]) -> None:
    """Kill only current process groups belonging to this isolated bench tree."""
    try:
        rows = process_snapshot()
        # Preserve verified descendants even if cooperative shutdown reparented
        # them. Start times prevent recycled PIDs from becoming ownership proof.
        owned = {pid for pid, _, group, _, started in rows if before.get(pid) == (group, started)}
        changed = True
        while changed:
            changed = False
            for pid, parent, _, _, _ in rows:
                if parent in owned and pid not in owned:
                    owned.add(pid)
                    changed = True
        groups = {group for pid, _, group, state, _ in rows if pid in owned and not state.startswith("Z")}
        # Isolated child groups must never include our own terminal/UI group.
        groups.discard(os.getpgrp())
        for group in groups:
            try:
                os.killpg(group, signal.SIGKILL)
            except ProcessLookupError:
                pass
    except (OSError, ValueError, subprocess.SubprocessError):
        if proc.poll() is None:
            proc.kill()
        raise RuntimeError("Forced cleanup could not inspect the bench's DHU descendants.")


def run_child(command: list[str], timeout: float, cleanup_grace: float = 35) -> tuple[int, str, str | None]:
    """Ask the bench to clean up its DHU before any forced timeout termination."""
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, start_new_session=True)
    try:
        output, _ = proc.communicate(timeout=timeout)
        return proc.returncode, output, None
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        # bench_dhu handles KeyboardInterrupt in its existing finally block,
        # which closes DHU and collects bounded final Pi evidence. Killing the
        # bench immediately would bypass that owner-controlled cleanup.
        before = descendant_snapshot(proc)
        if proc.poll() is None:
            proc.send_signal(signal.SIGINT)
        try:
            output, _ = proc.communicate(timeout=cleanup_grace)
        except subprocess.TimeoutExpired:
            force_cleanup(proc, before)
            output, _ = proc.communicate(timeout=5)
        else:
            # Real DHU writes to its own PTY, so an orphan does not necessarily
            # keep this pipe open. Check saved descendants even after the bench
            # exits cooperatively and communicate returns promptly.
            force_cleanup(proc, before)
        if isinstance(error, KeyboardInterrupt):
            raise
        return 1, output, "Child exceeded its bounded session plus collection allowance."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pi-host", required=True, help="Reachable SSH host; used for read-only evidence.")
    parser.add_argument("--source", choices=("test-pattern", "airplay"), default="test-pattern",
                        help="The source already running on the Pi; this runner never changes it.")
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=list(PROFILES))
    parser.add_argument("--min-video-seconds", type=float, default=60,
                        help="Minimum sustained video interval per profile (default 60).")
    parser.add_argument("--duration", type=float, default=90,
                        help="Maximum DHU session interval per profile (default 90).")
    parser.add_argument("--dhu-dir", type=Path, default=ROOT / ".local" / "dhu")
    parser.add_argument("--usb-serial", default="TAGAAS")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args(argv)
    if (not re.fullmatch(r"[A-Za-z0-9_.@:\[\]-]+", args.pi_host)
            or args.pi_host.startswith("-")):
        parser.error("--pi-host must be a plain SSH host or user@host")
    if (not math.isfinite(args.min_video_seconds) or not math.isfinite(args.duration)
            or args.min_video_seconds < 15 or not 15 <= args.duration <= 300
            or args.min_video_seconds + 15 > args.duration):
        parser.error("Require minimum video >=15s, duration <=300s, and at least 15s startup margin")
    if len(set(args.profiles)) != len(args.profiles):
        parser.error("--profiles must not contain duplicates")
    run_id = uuid.uuid4().hex[:8]
    out = (args.output_dir or ROOT / ".local" / "matrix" /
           (dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + run_id)).expanduser().resolve()
    try:
        out.mkdir(parents=True, mode=0o700, exist_ok=False)
    except FileExistsError:
        parser.error("--output-dir must be new; refusing stale evidence")
    out.chmod(0o700)
    report = {
        "schema_version": 1, "run_id": run_id,
        "scope": "Real USB/DHU profile startup and sustained decoded moving video at 800x480/30.",
        "source": args.source, "minimum_video_seconds_per_profile": args.min_video_seconds,
        "not_tested": ["Google certification", "Mazda interoperability", "Bluetooth bonding/HFP",
                       "actual input delivery", "sensor event handling", "audio", "clean power", "USB speed negotiation",
                       "cold boot", "physical cable reconnect", "higher-resolution video",
                       "complete AA transport/credit conformance"],
        "cases": [],
    }
    stopped = False
    for index, profile in enumerate(args.profiles):
        if stopped:
            report["cases"].append({"profile": profile, "outcome": "NOT_RUN",
                                    "reason": "An earlier case was blocked or failed."})
            continue
        case_dir = out / profile
        # Let the existing supervisor return to the initial gadget after DHU
        # exits. This is a bounded local wait, not a Pi restart or gadget rebind.
        if index:
            time.sleep(3)
        config = ROOT / "config" / "dhu" / (profile + ".ini")
        command = [sys.executable, str(ROOT / "bridge" / "bench_dhu.py"),
                   "--config", str(config),
                   "--headless", "--expect-auto-start", "--pi-host", args.pi_host,
                   "--expect-airplay" if args.source == "airplay" else "--expect-smpte",
                   "--min-video-seconds", str(args.min_video_seconds),
                   "--duration", str(args.duration), "--dhu-dir", str(args.dhu_dir.expanduser().resolve()),
                   "--usb-serial", args.usb_serial, "--output-dir", str(case_dir)]
        try:
            returncode, output, error = run_child(command, args.duration + 90)
            (out / (profile + "-runner.log")).write_text(output)
        except (OSError, RuntimeError) as exc:
            returncode = 1
            error = "Bench execution or cleanup failed: " + str(exc)
        summary_file = case_dir / "summary.json"
        try:
            summary = json.loads(summary_file.read_text())
        except (OSError, ValueError):
            summary = None
        outcome = child_outcome(returncode, summary, args.source,
                                minimum_seconds=args.min_video_seconds, config=config,
                                usb_serial=args.usb_serial)
        case = {"profile": profile, "outcome": outcome, "exit_code": returncode,
                "summary": str(summary_file), "command": command}
        if error:
            case["reason"] = error
        elif isinstance(summary, dict) and isinstance(summary.get("overall"), dict):
            case["reason"] = summary["overall"].get("reason", "Missing child outcome.")
        else:
            case["reason"] = "No valid current child evidence was produced."
        report["cases"].append(case)
        print(profile + ": " + outcome, flush=True)
        stopped = outcome != "PASSED"
    outcomes = [case["outcome"] for case in report["cases"]]
    report["outcome"] = ("PASSED" if all(value == "PASSED" for value in outcomes)
                         else "FAILED" if "FAILED" in outcomes else "BLOCKED")
    (out / "summary.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report["outcome"] + ": DHU interoperability only; certification and Mazda acceptance remain untested.")
    print("Evidence: " + str(out / "summary.json"))
    return {"PASSED": 0, "FAILED": 1, "BLOCKED": 2}[report["outcome"]]


if __name__ == "__main__":
    sys.exit(main())
