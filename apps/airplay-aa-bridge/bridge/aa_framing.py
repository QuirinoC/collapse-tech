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
import re
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


_START_CODE = re.compile(rb"\x00\x00(?:\x00)?\x01")


def annex_b_nals(data: bytes) -> list[bytes]:
    """Return NAL units, retaining their Annex-B start codes."""
    starts = list(_START_CODE.finditer(data))
    return [data[start.start():starts[index + 1].start() if index + 1 < len(starts) else len(data)]
            for index, start in enumerate(starts)]


def nal_type(nal: bytes) -> Optional[int]:
    start = _START_CODE.match(nal)
    if start is None or start.end() >= len(nal):
        return None
    return nal[start.end()] & 0x1F


def _first_mb_in_slice(payload: bytes) -> Optional[int]:
    """Read the first unsigned Exp-Golomb field, or wait for more bytes."""
    zeros = 0
    bits = len(payload) * 8
    while zeros < bits and not (payload[zeros // 8] & (1 << (7 - zeros % 8))):
        zeros += 1
    if zeros == bits or zeros > 31 or 2 * zeros + 1 > bits:
        return None
    value = 0
    for bit in range(zeros + 1, 2 * zeros + 1):
        value = (value << 1) | ((payload[bit // 8] >> (7 - bit % 8)) & 1)
    return (1 << zeros) - 1 + value


def split_annex_b(buffer: bytes, *, flush: bool = False) -> tuple[list[bytes], bytes]:
    """Group the pipeline's progressive baseline H.264 into complete pictures.

    AUD marks frame boundaries. For streams without AUD, a first slice with
    first_mb_in_slice=0 starts a new picture. SPS/PPS/SEI preceding that picture
    stay with it; multiple slices of one picture stay in the same AA packet.
    The trailing picture remains buffered until the next boundary or FIFO EOF.
    This fallback targets this project's x264 stream, not interlaced/FMO H.264.
    """
    starts = list(_START_CODE.finditer(buffer))
    if not starts:
        return [], b"" if flush else buffer
    aus: list[bytes] = []
    unit_start = starts[0].start()
    have_slice = False
    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(buffer)
        payload = buffer[start.end():end]
        if not payload:
            continue
        kind = payload[0] & 0x1F
        slice_start = _first_mb_in_slice(payload[1:]) if kind in (1, 2, 5) else None
        # H.264 7.4.1.2.3: these prefix NALs belong to the following picture.
        boundary = have_slice and (kind in (6, 7, 8, 9, 14, 15, 16, 17, 18)
                                   or slice_start == 0)
        if boundary:
            aus.append(buffer[unit_start:start.start()])
            unit_start = start.start()
            have_slice = False
        if kind in (1, 2, 5) and slice_start is not None:
            have_slice = True
    if flush:
        if have_slice:
            aus.append(buffer[unit_start:])
        return aus, b""
    return aus, buffer[unit_start:]


def is_idr_au(au: bytes) -> bool:
    """True if Annex-B AU contains an IDR slice NAL (type 5)."""
    return any(nal_type(nal) == 5 for nal in annex_b_nals(au))
