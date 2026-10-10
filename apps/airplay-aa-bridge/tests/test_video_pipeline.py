"""Meaningful local video integration tests (Linux + FFmpeg/libx264 required)."""

from __future__ import annotations

import shutil
import os
import socket
import subprocess
import time
import unittest

from video_harness import VideoHarness, decode_colors, encode_video, nal_types, without_parameter_sets


def seqpacket_available():
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET):
            return True
    except OSError:
        return False


VIDEO_TESTS_AVAILABLE = bool(seqpacket_available() and shutil.which("ffmpeg") and shutil.which("ffprobe"))
if os.environ.get("AIRPLAY_AA_REQUIRE_VIDEO_TESTS") == "1" and not VIDEO_TESTS_AVAILABLE:
    raise RuntimeError("required video integration needs Linux SOCK_SEQPACKET, FFmpeg and FFprobe")


@unittest.skipUnless(VIDEO_TESTS_AVAILABLE,
                     "Linux SOCK_SEQPACKET + FFmpeg required; use tests/local-video.Dockerfile")
class VideoPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.black = encode_video("black", frames=1, keyint=1).data
        cls.blue = encode_video("blue")
        cls.no_aud = encode_video("blue", aud=False)

    def assert_blue(self, packets, expected_frames):
        colors = decode_colors(b"".join(packet.au for packet in packets))
        self.assertEqual(len(colors), expected_frames, "lost or duplicated decoded frames")
        self.assertTrue(all(blue > 200 and red < 30 and green < 30
                            for red, green, blue in colors), colors)

    def test_fragmented_fifo_stream_decodes_every_frame(self):
        with VideoHarness(self.black) as bridge:
            self.assertTrue(bridge.input_registered)
            bridge.wait_for(lambda packets: any(packet.au == self.black for packet in packets))
            bridge.write(self.blue.data, chunk_size=37)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            self.assert_blue(bridge.live, len(self.blue.frames))
            # One AA media message must carry one picture with all its slices.
            self.assertEqual(len(bridge.live), len(self.blue.frames))
            for packet, source_frame in zip(bridge.live, self.blue.frames):
                slices = sum(kind in (1, 5) for kind in nal_types(packet.au))
                self.assertGreaterEqual(slices, 2)
                self.assertEqual(slices, sum(kind in (1, 5) for kind in nal_types(source_frame)))
            stamps = [packet.pts_us for packet in bridge.packets if packet.pts_us is not None]
            self.assertEqual(stamps, sorted(stamps))

    def test_frame_jitter_does_not_switch_to_black(self):
        with VideoHarness(self.black) as bridge:
            bridge.write(self.blue.frames[0] + self.blue.frames[1])
            bridge.wait_for(lambda _: bool(bridge.live))
            # 100ms is ordinary scheduling/buffering jitter, longer than 1/30s.
            time.sleep(0.1)
            bridge.write(b"".join(self.blue.frames[2:]))
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            live_start = next(index for index, packet in enumerate(bridge.packets)
                              if packet.au != self.black)
            live_end = max(index for index, packet in enumerate(bridge.packets)
                           if packet.au != self.black)
            self.assertFalse(any(packet.au == self.black
                                 for packet in bridge.packets[live_start:live_end + 1]))
            self.assert_blue(bridge.live, len(self.blue.frames))

    def test_live_resume_after_idle_restores_parameter_sets(self):
        with VideoHarness(self.black) as bridge:
            bridge.write(self.blue.data)
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames) - 1)
            bridge.wait_for(lambda packets: bool(bridge.live) and packets[-1].au == self.black)
            before = len(bridge.live)
            # Resume from a fresh IDR without repeating SPS/PPS. Idle's decoder
            # configuration must be replaced with the cached live configuration.
            resumed = b"".join(without_parameter_sets(frame) for frame in self.blue.frames)
            bridge.write(resumed, chunk_size=53)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= before + len(self.blue.frames))
            packets = bridge.live[before:]
            self.assertIn(7, nal_types(packets[0].au))
            self.assertIn(8, nal_types(packets[0].au))
            self.assert_blue(packets, len(self.blue.frames))
            # Also decode the complete captured sequence, retaining the real
            # black IDRs between blue sessions and their different SPS/PPS.
            captured = list(bridge.packets)
            colors = decode_colors(b"".join(packet.au for packet in captured))
            self.assertEqual(len(colors), len(captured))
            for packet, (red, green, blue) in zip(captured, colors):
                if packet.au == self.black:
                    self.assertLess(max(red, green, blue), 20)
                else:
                    self.assertGreater(blue, 200)
                    self.assertLess(max(red, green), 30)

    def test_stream_without_aud_decodes_every_frame(self):
        with VideoHarness(self.black) as bridge:
            bridge.wait_for(lambda packets: bool(packets))
            bridge.write(self.no_aud.data, chunk_size=29)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.no_aud.frames))
            self.assertEqual(len(bridge.live), len(self.no_aud.frames))
            self.assert_blue(bridge.live, len(self.no_aud.frames))

    def test_server_disconnect_exits_promptly(self):
        with VideoHarness(self.black) as bridge:
            bridge.wait_for(lambda packets: bool(packets))
            bridge.disconnect_server()
            self.assertEqual(bridge.process.wait(timeout=2), 0)

    def test_pre_aa_fifo_is_drained_until_channel_ready(self):
        with VideoHarness(self.black, pre_ready_video=self.blue.data * 128) as bridge:
            bridge.wait_for(lambda packets: bool(packets))
            self.assertFalse(bridge.live, "pre-AA video should have been drained")
            bridge.write(self.blue.data)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            self.assert_blue(bridge.live, len(self.blue.frames))

    def test_second_injector_cannot_steal_video(self):
        with VideoHarness(self.black) as bridge:
            duplicate = subprocess.run(bridge.command, capture_output=True, timeout=2)
            self.assertEqual(duplicate.returncode, 0)
            self.assertIn(b"another injector holds", duplicate.stderr)
            bridge.write(self.blue.data)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            self.assert_blue(bridge.live, len(self.blue.frames))

    def test_missing_input_channel_still_decodes_video(self):
        with VideoHarness(self.black, input_channel=255) as bridge:
            self.assertFalse(bridge.input_registered)
            bridge.write(self.blue.data)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            self.assert_blue(bridge.live, len(self.blue.frames))

    def test_rejected_input_binding_still_decodes_video(self):
        with VideoHarness(self.black, input_status=1) as bridge:
            self.assertTrue(bridge.input_registered)
            bridge.write(self.blue.data)
            bridge.end_source()
            bridge.wait_for(lambda _: len(bridge.live) >= len(self.blue.frames))
            self.assert_blue(bridge.live, len(self.blue.frames))


if __name__ == "__main__":
    unittest.main()
