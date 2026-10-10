#!/usr/bin/env python3
"""Unit tests for AA framing helpers (no Pi / USB required)."""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bridge"))

from aa_framing import (  # noqa: E402
    MediaMessageType,
    PacketType,
    get_video_channel_request,
    get_input_channel_request,
    input_binding_status,
    input_registration_packet,
    is_idr_au,
    media_indication,
    raw_video_packet,
    split_annex_b,
)


class FramingTests(unittest.TestCase):
    def test_get_video_channel_request(self):
        pkt = get_video_channel_request()
        self.assertEqual(pkt, bytes([PacketType.GET_CHANNEL_BY_TYPE, 0, 0]))

    def test_input_registration_protocol(self):
        self.assertEqual(get_input_channel_request(), bytes([0, 1, 0]))
        self.assertEqual(input_registration_packet(2), bytes([1, 2, 0, 0]))

    def test_binding_status_handles_unknown_fields_and_failure(self):
        self.assertEqual(input_binding_status(bytes.fromhex('80030800')), 0)
        self.assertEqual(input_binding_status(bytes.fromhex('800310010801')), 1)
        self.assertEqual(input_binding_status(bytes.fromhex('80031a0278780800')), 0)

    def test_binding_status_rejects_missing_or_truncated_fields(self):
        for encoded in ('8003', '80031000', '80030880', '80030a00', '800308001a02ff',
                        '800300', '800308ffffffffffffffffffff00', '80010800'):
            with self.subTest(encoded=encoded):
                self.assertIsNone(input_binding_status(bytes.fromhex(encoded)))

    def test_media_indication_first(self):
        au = b"\x00\x00\x00\x01\x65\x00"
        payload = media_indication(au, first=True)
        self.assertEqual(payload[:2], struct.pack(">H", MediaMessageType.MEDIA_INDICATION))
        self.assertEqual(payload[2:], au)

    def test_media_with_timestamp(self):
        au = b"\x00\x00\x00\x01\x41\x00"
        payload = media_indication(au, first=False, pts_us=123456789)
        self.assertEqual(payload[:2], struct.pack(">H", MediaMessageType.MEDIA_WITH_TIMESTAMP))
        self.assertEqual(struct.unpack(">Q", payload[2:10])[0], 123456789)
        self.assertEqual(payload[10:], au)

    def test_raw_video_packet_header(self):
        media = media_indication(b"\x00\x00\x01\x65", first=True)
        pkt = raw_video_packet(3, media)
        self.assertEqual(pkt[0], PacketType.RAW_DATA)
        self.assertEqual(pkt[1], 3)
        self.assertEqual(pkt[2], 0)
        self.assertEqual(pkt[3:], media)

    def test_split_annex_b(self):
        # SPS/PPS and both slices belong to one picture; an AUD begins the next.
        au = (b"\x00\x00\x00\x01\x09\xf0"
              b"\x00\x00\x00\x01\x67\x42\x00"
              b"\x00\x00\x00\x01\x68\xce\x06"
              b"\x00\x00\x00\x01\x65\x88\x00"
              b"\x00\x00\x01\x65\x40\x00")
        partial = b"\x00\x00\x00\x01\x09\xf0\x00\x00"
        stream = au + partial
        aus, rem = split_annex_b(stream)
        self.assertEqual(aus, [au])
        self.assertEqual(rem, partial)

    def test_is_idr_au(self):
        idr = b"\x00\x00\x00\x01\x65\x00\x00"
        non = b"\x00\x00\x00\x01\x41\x00\x00"
        self.assertTrue(is_idr_au(idr))
        self.assertFalse(is_idr_au(non))


if __name__ == "__main__":
    unittest.main()
