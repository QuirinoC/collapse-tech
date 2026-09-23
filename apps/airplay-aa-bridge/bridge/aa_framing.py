#!/usr/bin/env python3
"""Frame H.264 access units for AAServer Unix-socket injection.

AAServer Packet (SOCK_SEQPACKET):
  [0] packet_type  (0=GetChannelByType, 1=RawData, 2=GetServiceDescriptor)
  [1] channel_or_type
  [2] specific flag
  [3..] payload

For RawData video, payload is an Android Auto media message:
  MediaIndication (0x0001) + H264 AU
  MediaWithTimestampIndication (0x0000) + u64 BE timestamp_us + H264 AU
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from enum import IntEnum
from typing import Optional


class PacketType(IntEnum):
    GET_CHANNEL_BY_TYPE = 0
    RAW_DATA = 1
    GET_SERVICE_DESCRIPTOR = 2


class ChannelType(IntEnum):
    VIDEO = 0
    INPUT = 1


class MediaMessageType(IntEnum):
    MEDIA_WITH_TIMESTAMP = 0x0000
    MEDIA_INDICATION = 0x0001


@dataclass(frozen=True)
class AAPacket:
    packet_type: PacketType
    channel: int
    specific: int
    data: bytes

    def to_bytes(self) -> bytes:
        return bytes([int(self.packet_type), self.channel & 0xFF, self.specific & 0xFF]) + self.data


def get_video_channel_request() -> bytes:
    return AAPacket(PacketType.GET_CHANNEL_BY_TYPE, ChannelType.VIDEO, 0, b"").to_bytes()


def media_indication(h264_au: bytes, *, first: bool = False, pts_us: Optional[int] = None) -> bytes:
    """Build AA media payload (without the outer AAServer packet header)."""
    if first or pts_us is None:
        return struct.pack(">H", MediaMessageType.MEDIA_INDICATION) + h264_au
    return struct.pack(">HQ", MediaMessageType.MEDIA_WITH_TIMESTAMP, int(pts_us) & 0xFFFFFFFFFFFFFFFF) + h264_au


def raw_video_packet(channel: int, media_payload: bytes, *, specific: int = 0) -> bytes:
    return AAPacket(PacketType.RAW_DATA, channel, specific, media_payload).to_bytes()


def split_annex_b(buffer: bytes) -> tuple[list[bytes], bytes]:
    """Split Annex-B bytestream into complete access units; return (aus, remainder).

    Uses start-code detection. Incomplete trailing AU stays in remainder.
    """
    if not buffer:
        return [], b""

    # Find all start-code offsets
    starts: list[int] = []
    i = 0
    n = len(buffer)
    while i + 3 < n:
        if buffer[i] == 0 and buffer[i + 1] == 0:
            if buffer[i + 2] == 1:
                starts.append(i)
                i += 3
                continue
            if i + 3 < n and buffer[i + 2] == 0 and buffer[i + 3] == 1:
                starts.append(i)
                i += 4
                continue
        i += 1

    if not starts:
        return [], buffer

    aus: list[bytes] = []
    for idx, start in enumerate(starts[:-1]):
        aus.append(buffer[start : starts[idx + 1]])
    remainder = buffer[starts[-1] :]
    return aus, remainder


def is_idr_au(au: bytes) -> bool:
    """True if Annex-B AU contains an IDR slice NAL (type 5)."""
    i = 0
    n = len(au)
    while i + 4 < n:
        if au[i : i + 4] == b"\x00\x00\x00\x01":
            nal_type = au[i + 4] & 0x1F
            if nal_type == 5:
                return True
            i += 5
            continue
        if au[i : i + 3] == b"\x00\x00\x01":
            nal_type = au[i + 3] & 0x1F
            if nal_type == 5:
                return True
            i += 4
            continue
        i += 1
    return False
