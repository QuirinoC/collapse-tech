"""Decoder-backed local harness; no Pi, AirPlay receiver, or USB is simulated.

The injector runs unchanged as a subprocess. A real FIFO supplies libx264 video,
and a fake AAServer exchanges actual Unix SOCK_SEQPACKET messages with it.
FFprobe supplies the frame boundaries, independently of the bridge parser.
"""

from __future__ import annotations

import json
import os
import re
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START_CODE = re.compile(rb"\x00\x00(?:\x00)?\x01")


@dataclass(frozen=True)
class EncodedVideo:
    data: bytes
    frames: tuple[bytes, ...]


def encode_video(color: str, *, frames: int = 12, aud: bool = True,
                 keyint: int = 6) -> EncodedVideo:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
         f"color=c={color}:s=800x480:r=30", "-frames:v", str(frames),
         "-c:v", "libx264", "-profile:v", "baseline", "-preset", "ultrafast",
         "-tune", "zerolatency", "-x264-params",
         f"aud={int(aud)}:repeat-headers=1:keyint={keyint}:min-keyint={keyint}:scenecut=0:slices=2",
         "-f", "h264", "pipe:1"],
        check=True, capture_output=True,
    )
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-f", "h264", "-i", "pipe:0",
         "-select_streams", "v:0", "-show_packets", "-show_entries",
         "packet=pos,size", "-of", "json"],
        input=result.stdout, check=True, capture_output=True,
    )
    packets = json.loads(probe.stdout)["packets"]
    boundaries = tuple(
        result.stdout[int(packet["pos"]):int(packet["pos"]) + int(packet["size"])]
        for packet in packets
    )
    if len(boundaries) != frames:
        raise AssertionError(f"encoder produced {len(boundaries)} frames, expected {frames}")
    return EncodedVideo(result.stdout, boundaries)


def nal_types(data: bytes) -> list[int]:
    return [data[start.end()] & 31 for start in START_CODE.finditer(data)
            if start.end() < len(data)]


def without_parameter_sets(data: bytes) -> bytes:
    starts = list(START_CODE.finditer(data))
    return b"".join(
        data[start.start():starts[index + 1].start() if index + 1 < len(starts) else len(data)]
        for index, start in enumerate(starts)
        if data[start.end()] & 31 not in (7, 8)
    )


def decode_colors(data: bytes) -> list[tuple[int, int, int]]:
    """Decode every picture, averaging each solid test frame to an RGB pixel."""
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-f", "h264", "-i", "pipe:0",
         "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
        input=data, capture_output=True, timeout=15,
    )
    if result.returncode:
        raise AssertionError(f"captured H.264 failed to decode:\n{result.stderr.decode()}")
    return [tuple(result.stdout[index:index + 3])
            for index in range(0, len(result.stdout), 3)]


@dataclass(frozen=True)
class MediaPacket:
    received: float
    au: bytes
    pts_us: int | None


class VideoHarness:
    """One real injector process connected to a fake, packet-oriented AA server."""

    def __init__(self, idle: bytes, *, pre_ready_video: bytes = b"",
                 input_channel: int = 2, input_status: int = 0):
        self.idle = idle
        self.pre_ready_video = pre_ready_video
        self.input_channel = input_channel
        self.input_status = input_status
        self.input_registered = False
        self.temp = tempfile.TemporaryDirectory(prefix="aa-video-")
        self.path = Path(self.temp.name)
        self.socket_path = self.path / "aa.sock"
        self.fifo = self.path / "video.h264"
        self.packets: list[MediaPacket] = []
        self.errors: list[Exception] = []
        self.condition = threading.Condition()
        self.stop = threading.Event()
        self.process: subprocess.Popen | None = None
        self.peer: socket.socket | None = None
        self.writer: int | None = None

    def __enter__(self):
        try:
            return self._start()
        except Exception:
            self.__exit__(None, None, None)
            raise

    def _start(self):
        (self.path / "idle.h264").write_bytes(self.idle)
        os.mkfifo(self.fifo)
        # Keep a writer attached until tests explicitly close it, so no arbitrary
        # EOF/reopen sleep changes the timing of fragmented or jittered writes.
        self.writer = os.open(self.fifo, os.O_RDWR | os.O_NONBLOCK)
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        self.listener.bind(str(self.socket_path))
        self.listener.listen(1)
        self.listener.settimeout(5)
        self.log = (self.path / "inject.log").open("wb")
        self.command = [sys.executable, "-u", str(ROOT / "bridge" / "inject_h264.py"),
                        "--aa-socket", str(self.socket_path), "--h264-source", str(self.fifo),
                        "--idle-au", str(self.path / "idle.h264"), "--fps", "30"]
        self.process = subprocess.Popen(
            self.command,
            stdout=subprocess.DEVNULL, stderr=self.log,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.peer, _ = self.listener.accept()
        self.peer.settimeout(5)
        request = self.peer.recv(16)
        if request != bytes([0, 0, 0]):
            raise AssertionError(f"unexpected video-channel query: {request!r}")
        if self.pre_ready_video:
            # The real injector must continue draining while service discovery
            # reports no video channel, or this >pipe-capacity write will stall.
            self.peer.send(bytes([255]))
            complete = threading.Event()
            producer_errors = []

            def produce():
                try:
                    self.write(self.pre_ready_video)
                except Exception as exc:
                    producer_errors.append(exc)
                finally:
                    complete.set()

            producer = threading.Thread(target=produce, daemon=True)
            producer.start()
            while True:
                if self.peer.recv(16) != bytes([0, 0, 0]):
                    raise AssertionError("missing channel retry after pre-AA drain")
                if complete.is_set():
                    break
                self.peer.send(bytes([255]))
            producer.join(timeout=1)
            if producer_errors:
                raise producer_errors[0]
        self.peer.send(bytes([3]))
        if self.peer.recv(16) != bytes([0, 1, 0]):
            raise AssertionError("injector did not discover input before starting video")
        self.peer.send(bytes([self.input_channel]))
        if self.input_channel not in (0, 255):
            if self.peer.recv(16) != bytes([1, self.input_channel, 0, 0]):
                raise AssertionError("injector did not register input before starting video")
            self.input_registered = True
            self.peer.send(bytes([self.input_channel, 0, 0x80, 3, 8, self.input_status]))
        self.peer.settimeout(0.1)
        self.reader = threading.Thread(target=self._capture, daemon=True)
        self.reader.start()
        return self

    def _capture(self):
        try:
            while not self.stop.is_set():
                try:
                    packet = self.peer.recv(2 * 1024 * 1024)
                except TimeoutError:
                    continue
                except OSError:
                    if self.stop.is_set():
                        break
                    raise
                if not packet:
                    break
                if len(packet) < 5 or packet[:3] != bytes([1, 3, 0]):
                    raise AssertionError(f"invalid AA packet header: {packet[:16]!r}")
                message = struct.unpack(">H", packet[3:5])[0]
                if message == 1:
                    au, pts = packet[5:], None
                elif message == 0 and len(packet) >= 13:
                    au, pts = packet[13:], struct.unpack(">Q", packet[5:13])[0]
                else:
                    raise AssertionError(f"invalid AA media message: {packet[:16]!r}")
                with self.condition:
                    self.packets.append(MediaPacket(time.monotonic(), au, pts))
                    self.condition.notify_all()
        except Exception as exc:
            with self.condition:
                self.errors.append(exc)
                self.condition.notify_all()

    @property
    def live(self) -> list[MediaPacket]:
        with self.condition:
            return [packet for packet in self.packets if packet.au != self.idle]

    def wait_for(self, predicate, *, timeout: float = 3):
        deadline = time.monotonic() + timeout
        with self.condition:
            while not predicate(self.packets):
                if self.errors:
                    raise self.errors[0]
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    log = (self.path / "inject.log").read_text()
                    raise AssertionError(f"capture timed out ({len(self.packets)} packets):\n{log}")
                self.condition.wait(remaining)

    def write(self, data: bytes, *, chunk_size: int | None = None):
        deadline = time.monotonic() + 5
        while data:
            if time.monotonic() > deadline:
                raise AssertionError("FIFO producer stalled for five seconds")
            limit = len(data) if chunk_size is None else chunk_size
            try:
                count = os.write(self.writer, data[:limit])
                data = data[count:]
            except BlockingIOError:
                time.sleep(0.005)

    def end_source(self):
        os.close(self.writer)
        self.writer = None

    def disconnect_server(self):
        self.stop.set()
        if self.peer is not None:
            try:
                self.peer.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.peer.close()
        if hasattr(self, "reader"):
            self.reader.join(timeout=2)

    def __exit__(self, *_):
        if self.writer is not None:
            os.close(self.writer)
        if not self.stop.is_set():
            self.disconnect_server()
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
            self.process.wait(timeout=3)
        if hasattr(self, "listener"):
            self.listener.close()
        if hasattr(self, "log"):
            self.log.close()
        self.temp.cleanup()
