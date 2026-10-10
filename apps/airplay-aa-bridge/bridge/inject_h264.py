#!/usr/bin/env python3
"""AirPlay → Android Auto video injector.

Reads Annex-B H.264 from a Unix FIFO produced by UxPlay (-vrtp re-encode),
frames AA media messages, and writes them to AAServer's SOCK_SEQPACKET socket.

When the AirPlay producer is idle, injects a looping black IDR so the head unit
keeps a live video surface.
"""

from __future__ import annotations

import argparse
import fcntl
import logging
import os
import select
import socket
import stat
import sys
import time
from pathlib import Path
from typing import Optional

from aa_framing import (
    annex_b_nals,
    get_video_channel_request,
    is_idr_au,
    media_indication,
    nal_type,
    raw_video_packet,
    split_annex_b,
)
from gen_idle_h264 import generate_black_h264

LOG = logging.getLogger("airplay-aa-inject")


# Held for the process lifetime so a second injector cannot connect.
_LOCK_FD: Optional[int] = None


def acquire_injector_lock(path: str) -> None:
    """Exclusive lock. A second process exits and does not open channel 1."""
    global _LOCK_FD
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        LOG.error(
            "another injector holds %s; exiting without opening the video channel",
            path,
        )
        raise SystemExit(0)
    os.ftruncate(fd, 0)
    os.write(fd, f"{os.getpid()}\n".encode())
    _LOCK_FD = fd


def connect_aaserver(
    path: str,
    retries: int = 0,
    delay: float = 1.0,
    *,
    log_failures: bool = True,
) -> socket.socket:
    """Connect to AAServer's SEQPACKET socket.

    retries=0 means wait forever (AOAP/TLS can take a long time on a car HU).
    A positive retries count is used for short reconnects after a drop.
    """
    last_err: Optional[Exception] = None
    attempt = 0
    while True:
        attempt += 1
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        try:
            sock.connect(path)
            LOG.info("connected to AAServer socket %s (attempt %d)", path, attempt)
            return sock
        except OSError as exc:
            sock.close()
            last_err = exc
            if log_failures and (attempt == 1 or attempt % 15 == 0):
                LOG.info("AAServer connect failed (%s); waiting for AOAP socket", exc)
            else:
                LOG.debug("AAServer connect failed (%s); retrying", exc)
            if retries and attempt >= retries:
                raise RuntimeError(f"could not connect to AAServer at {path}: {last_err}") from last_err
            time.sleep(delay)


def resolve_video_channel(sock: socket.socket) -> int:
    sock.send(get_video_channel_request())
    reply = sock.recv(16)
    if not reply:
        raise RuntimeError("AAServer closed while resolving video channel")
    channel = reply[0]
    # AAServer stores unset channel ids as uint8_t(-1) == 255 until the HU
    # finishes service discovery. Treat that as "not ready" so we do not
    # poke channel 255 (which kills the socket client and can tear down the
    # bridge before Desktop Head Unit / OpenAuto re-attaches post-AOAP).
    if channel == 0 or channel == 255:
        raise RuntimeError(f"video channel not ready yet (got {channel})")
    LOG.info("video channel id=%d", channel)
    return channel


def ensure_fifo(path: Path) -> None:
    if path.exists():
        if not stat.S_ISFIFO(path.stat().st_mode):
            raise RuntimeError(f"H.264 source is not a FIFO: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    os.mkfifo(path)
    LOG.info("created FIFO %s", path)


def send_au(aa_sock: socket.socket, channel: int, au: bytes, *, first: bool, pts_us: Optional[int]) -> None:
    payload = media_indication(au, first=first, pts_us=pts_us)
    aa_sock.send(raw_video_packet(channel, payload))


def pump(
    aa_sock: socket.socket,
    channel: int,
    fifo_path: Path,
    idle_au: bytes,
    *,
    fps: int,
    max_au: int = 512 * 1024,
    idle_timeout: float = 1.0,
    fifo_fd: Optional[int] = None,
) -> None:
    ensure_fifo(fifo_path)
    # Open non-blocking so we can idle-feed while UxPlay has no writer yet.
    fd: Optional[int] = fifo_fd
    if fd is None:
        fd = os.open(fifo_path, os.O_RDONLY | os.O_NONBLOCK)
    buf = b""
    first = True
    started = time.monotonic()
    frames = 0
    pending_key = True
    frame_period = 1.0 / max(fps, 1)
    idle_timeout = max(idle_timeout, frame_period)
    next_idle = time.monotonic()
    next_open = next_idle
    idle_mode = True
    parameters: dict[int, list[bytes]] = {}
    sent_first = False
    sent_live = False
    logged_slow = False

    def deliver(au: bytes, *, live: bool) -> None:
        nonlocal first, sent_first, sent_live, logged_slow
        pts_us = None if first else int((time.monotonic() - started) * 1_000_000)
        before = time.monotonic()
        send_au(aa_sock, channel, au, first=first, pts_us=pts_us)
        duration = time.monotonic() - before
        if not sent_first:
            LOG.info("sent first AU (%s)", "live" if live else "idle")
            sent_first = True
        if live and not sent_live:
            LOG.info("sent first live AU (%d bytes, NAL types %s)",
                     len(au), [nal_type(nal) for nal in annex_b_nals(au)])
            sent_live = True
        if duration >= 2.0 and not logged_slow:
            logged_slow = True
            LOG.error("send blocked for %.1fs (AAServer waiting for SetupResponse?)", duration)
        first = False

    def send_live(aus: list[bytes]) -> None:
        nonlocal first, frames, pending_key, next_idle, idle_mode
        for au in aus:
            if len(au) > max_au:
                LOG.warning("dropping oversized AU (%d)", len(au))
                pending_key = True
                continue
            nals = annex_b_nals(au)
            present = {kind: [nal for nal in nals if nal_type(nal) == kind]
                       for kind in (7, 8)}
            parameters.update({kind: values for kind, values in present.items() if values})
            if pending_key:
                if not is_idr_au(au):
                    continue
                if any(not parameters.get(kind) for kind in (7, 8)):
                    LOG.debug("waiting for live SPS/PPS before injecting an IDR")
                    continue
                # Idle has its own SPS/PPS. Restore live decoder configuration
                # even when the producer doesn't repeat headers on every IDR.
                prefix = b"".join(nal for kind in (7, 8) if not present[kind]
                                   for nal in parameters.get(kind, []))
                if nals and nal_type(nals[0]) == 9:
                    au = nals[0] + prefix + b"".join(nals[1:])
                else:
                    au = prefix + au
                if len(au) > max_au:
                    LOG.warning("dropping oversized AU with parameter sets (%d)", len(au))
                    continue
            deliver(au, live=True)
            pending_key = False
            idle_mode = False
            frames += 1
            next_idle = time.monotonic() + idle_timeout
            if frames % 120 == 0:
                LOG.info("injected %d live AUs", frames)

    try:
        while True:
            now = time.monotonic()
            if fd is None and now >= next_open:
                ensure_fifo(fifo_path)
                fd = os.open(fifo_path, os.O_RDONLY | os.O_NONBLOCK)
            timeout = max(0.0, next_idle - time.monotonic())
            readers = [aa_sock.fileno()]
            if fd is None:
                timeout = min(timeout, max(0.0, next_open - time.monotonic()))
            else:
                readers.append(fd)
            r, _, _ = select.select(readers, [], [], timeout)

            if aa_sock.fileno() in r:
                try:
                    reply = aa_sock.recv(2 * 1024 * 1024)
                except OSError:
                    LOG.error("AAServer disconnected")
                    return
                if not reply:
                    LOG.info("AAServer disconnected")
                    return

            if fd is not None and fd in r:
                try:
                    chunk = os.read(fd, 256 * 1024)
                except BlockingIOError:
                    chunk = None
                if chunk == b"":
                    # EOF is the only safe way to flush a final picture without
                    # a following AUD/slice. Do not discard the last frame.
                    aus, buf = split_annex_b(buf, flush=True)
                    send_live(aus)
                    LOG.info("H.264 FIFO EOF; reopening %s", fifo_path)
                    os.close(fd)
                    fd = None
                    next_open = time.monotonic() + 0.05
                    parameters.clear()
                    pending_key = True
                elif chunk:
                    buf += chunk
                    aus, buf = split_annex_b(buf)
                    if len(buf) > max_au * 2:
                        LOG.warning("H.264 buffer overrun (%d bytes); resetting", len(buf))
                        buf = b""
                        pending_key = True
                    send_live(aus)

            if time.monotonic() >= next_idle:
                if not idle_mode:
                    LOG.info("live video silent for %.2fs; switching to idle", idle_timeout)
                    # A partly received picture cannot be completed safely once
                    # idle replaces the live decoder reference pictures.
                    buf = b""
                idle_mode = True
                deliver(idle_au, live=False)
                pending_key = True  # require IDR when live resumes
                next_idle = time.monotonic() + frame_period
    except OSError as exc:
        LOG.error("video pump failed: %s", exc)
    finally:
        if fd is not None:
            os.close(fd)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--aa-socket",
        default=os.environ.get("AIRPLAY_AA_SOCKET", "/var/run/airplay-aa/aaserver.sock"),
    )
    parser.add_argument(
        "--h264-source",
        default=os.environ.get("AIRPLAY_AA_H264", "/var/run/airplay-aa/video.h264"),
    )
    parser.add_argument("--width", type=int, default=int(os.environ.get("AIRPLAY_AA_WIDTH", "800")))
    parser.add_argument("--height", type=int, default=int(os.environ.get("AIRPLAY_AA_HEIGHT", "480")))
    parser.add_argument("--fps", type=int, default=int(os.environ.get("AIRPLAY_AA_FPS", "30")))
    parser.add_argument("--idle-timeout", type=float,
                        default=float(os.environ.get("AIRPLAY_AA_IDLE_TIMEOUT", "1.0")),
                        help="seconds without a complete live frame before switching to black")
    parser.add_argument(
        "--idle-au",
        default=os.environ.get("AIRPLAY_AA_IDLE_AU", "/var/run/airplay-aa/idle.h264"),
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Before the FIFO and the AA socket, so a second process cannot steal
    # channel 1 or H.264 bytes while it waits.
    acquire_injector_lock(str(Path(args.aa_socket).with_name("inject.lock")))

    idle_path = Path(args.idle_au)
    if not idle_path.exists() or idle_path.stat().st_size == 0:
        LOG.info("generating idle black H.264 → %s", idle_path)
        generate_black_h264(args.width, args.height, args.fps, idle_path)
    idle_au = idle_path.read_bytes()

    fifo_path = Path(args.h264_source)
    ensure_fifo(fifo_path)
    # Hold the FIFO read-end from process start so UxPlay filesink never blocks,
    # even before the car AOAP socket exists. Discard until AA is ready.
    fifo_fd = os.open(fifo_path, os.O_RDONLY | os.O_NONBLOCK)
    LOG.info("holding H.264 FIFO %s (drain until AA ready)", fifo_path)

    def drain_fifo(fd: int) -> bool:
        drained = False
        try:
            # A continuously writing producer must not starve AA discovery.
            for _ in range(16):
                chunk = os.read(fd, 256 * 1024)
                if not chunk:
                    return drained
                drained = True
        except BlockingIOError:
            pass
        return drained

    def wait_while_draining(delay: float) -> None:
        deadline = time.monotonic() + delay
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            readable, _, _ = select.select([fifo_fd], [], [], min(0.05, remaining))
            if readable and not drain_fifo(fifo_fd):
                # EOF stays readable while no writer is attached.
                time.sleep(min(0.05, max(0.0, deadline - time.monotonic())))

    aa_sock: Optional[socket.socket] = None
    channel: Optional[int] = None
    last_wait_log = 0.0

    def wait_log(msg: str) -> None:
        nonlocal last_wait_log
        now = time.monotonic()
        if now - last_wait_log < 15:
            return
        last_wait_log = now
        LOG.info("%s", msg)

    # Wait forever for AOAP; keep FIFO drained so AirPlay/HLS can run pre-car.
    # Connect retries are one-shot so the FIFO stays drained; log at most
    # every 15s (retries=1 would otherwise print ENOENT once a second).
    while channel is None:
        drain_fifo(fifo_fd)
        if aa_sock is None:
            try:
                aa_sock = connect_aaserver(
                    args.aa_socket, retries=1, delay=0.5, log_failures=False
                )
            except RuntimeError as exc:
                wait_log(f"AAServer connect failed ({exc}); waiting for AOAP socket")
                wait_while_draining(1)
                continue
        try:
            channel = resolve_video_channel(aa_sock)
        except RuntimeError as exc:
            msg = str(exc)
            wait_log(f"{msg}; waiting")
            wait_while_draining(1)
            if "not ready" in msg:
                continue
            try:
                aa_sock.close()
            except OSError:
                pass
            aa_sock = None
        except OSError as exc:
            wait_log(f"AAServer socket error ({exc}); reconnecting")
            try:
                aa_sock.close()
            except OSError:
                pass
            aa_sock = None
            wait_while_draining(1)

    assert aa_sock is not None and channel is not None

    try:
        pump(aa_sock, channel, fifo_path, idle_au, fps=args.fps,
             idle_timeout=args.idle_timeout, fifo_fd=fifo_fd)
    finally:
        aa_sock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
