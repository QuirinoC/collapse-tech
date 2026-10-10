"""Bounded automatic setup over the actual Linux AACS packet transport."""
import socket
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
from inject_h264 import initialize_input_channel


def seqpacket_available():
    try:
        first, second = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        first.close()
        second.close()
        return True
    except OSError:
        return False


@unittest.skipUnless(seqpacket_available(), "Linux SOCK_SEQPACKET required")
class InputStartupTests(unittest.TestCase):
    def setUp(self):
        self.client, self.server = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
        self.server.settimeout(1)
        self.drains = 0
        self.errors = []

    def tearDown(self):
        self.client.close()
        self.server.close()

    def drain(self):
        self.drains += 1

    def start_peer(self, action):
        def run():
            try:
                action()
            except Exception as error:
                self.errors.append(error)
        thread = threading.Thread(target=run)
        thread.start()
        self.addCleanup(thread.join, 1)
        return thread

    def identify(self):
        self.assertEqual(self.server.recv(32), bytes([0, 1, 0]))
        self.server.send(bytes([2]))
        self.assertEqual(self.server.recv(32), bytes([1, 2, 0, 0]))

    def test_real_binding_response_after_unrelated_event(self):
        def peer():
            self.identify()
            self.server.send(bytes.fromhex("020080010800"))
            self.server.send(bytes.fromhex("020080030800"))
        thread = self.start_peer(peer)
        self.assertTrue(initialize_input_channel(self.client, self.drain,
                                                query_timeout=0.2, binding_timeout=0.2))
        thread.join(1)
        self.assertEqual(self.errors, [])
        self.assertGreater(self.drains, 0)

    def test_silent_query_expires_while_fifo_is_drained(self):
        started = time.monotonic()
        self.assertFalse(initialize_input_channel(self.client, self.drain,
                                                 query_timeout=0.12, binding_timeout=0.12))
        self.assertLess(time.monotonic() - started, 0.6)
        self.assertGreaterEqual(self.drains, 2)

    def test_unrelated_events_cannot_extend_binding_deadline(self):
        def peer():
            self.identify()
            until = time.monotonic() + 0.3
            while time.monotonic() < until:
                self.server.send(bytes.fromhex("020080010800"))
                time.sleep(0.01)
        thread = self.start_peer(peer)
        started = time.monotonic()
        self.assertFalse(initialize_input_channel(self.client, self.drain,
                                                 query_timeout=0.2, binding_timeout=0.12))
        self.assertLess(time.monotonic() - started, 0.6)
        self.assertGreaterEqual(self.drains, 2)
        thread.join(1)
        self.assertEqual(self.errors, [])

    def test_disconnect_during_binding_is_detected(self):
        def peer():
            self.identify()
            self.server.close()
        thread = self.start_peer(peer)
        with self.assertRaisesRegex(RuntimeError, "closed during automatic input setup"):
            initialize_input_channel(self.client, self.drain,
                                     query_timeout=0.2, binding_timeout=0.2)
        thread.join(1)
        self.assertEqual(self.errors, [])
