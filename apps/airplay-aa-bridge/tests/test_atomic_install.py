"""Exercise durable installs, including an actually killed partial writer."""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


HELPER = Path(__file__).resolve().parents[1] / "scripts" / "atomic_install.py"
SPEC = importlib.util.spec_from_file_location("atomic_install", HELPER)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class AtomicInstallTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="airplay-aa-atomic-test-")
        self.root = Path(self.directory.name)
        self.source, self.target = self.root / "candidate", self.root / "installed"
        self.old = b"previous working runtime\n"
        self.new = bytes(range(256)) * 4096
        self.source.write_bytes(self.new)
        self.target.write_bytes(self.old)
        self.target.chmod(0o640)

    def tearDown(self):
        self.directory.cleanup()

    def assertOldPreserved(self):
        self.assertEqual(self.target.read_bytes(), self.old)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o640)

    def test_new_hash_mode_and_ownership_are_installed(self):
        previous = self.target.stat()
        installer.atomic_install(self.source, self.target, mode=0o755)
        self.assertEqual(hashlib.sha256(self.target.read_bytes()).digest(),
                         hashlib.sha256(self.new).digest())
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o755)
        self.assertEqual((self.target.stat().st_uid, self.target.stat().st_gid),
                         (previous.st_uid, previous.st_gid))
        self.assertFalse(list(self.root.glob(".installed.install-*")))

    def test_partial_writes_copy_every_byte(self):
        write = os.write
        with mock.patch.object(installer.os, "write", side_effect=lambda fd, data: write(fd, data[:8191])):
            installer.atomic_install(self.source, self.target, mode=0o600)
        self.assertEqual(self.target.read_bytes(), self.new)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)

    def test_file_fsync_failure_preserves_old_file(self):
        with mock.patch.object(installer.os, "fsync", side_effect=OSError("storage sync failed")):
            with self.assertRaises(OSError):
                installer.atomic_install(self.source, self.target)
        self.assertOldPreserved()
        self.assertFalse(list(self.root.glob(".installed.install-*")))

    def test_replace_failure_preserves_old_file(self):
        with mock.patch.object(installer.os, "replace", side_effect=OSError("rename failed")):
            with self.assertRaises(OSError):
                installer.atomic_install(self.source, self.target)
        self.assertOldPreserved()
        self.assertFalse(list(self.root.glob(".installed.install-*")))

    def test_empty_input_is_rejected_without_truncating_target(self):
        self.source.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "empty"):
            installer.atomic_install(self.source, self.target)
        self.assertOldPreserved()

    def test_source_truncated_during_copy_preserves_installed_file(self):
        write = os.write
        def truncate_source_after_write(descriptor, data):
            result = write(descriptor, data)
            self.source.write_bytes(b"incomplete candidate")
            return result
        with mock.patch.object(installer.os, "write", side_effect=truncate_source_after_write):
            with self.assertRaisesRegex(ValueError, "Source changed"):
                installer.atomic_install(self.source, self.target)
        self.assertOldPreserved()

    def test_killed_partial_writer_leaves_installed_file_intact(self):
        marker = self.root / "partial-write-reached"
        program = '''import os, pathlib, sys, time
sys.path.insert(0, sys.argv[1])
import atomic_install
original = os.write
def partial_then_block(fd, data):
    original(fd, data[:4096])
    pathlib.Path(sys.argv[4]).write_text("ready")
    time.sleep(30)
    raise RuntimeError("writer should have been killed")
atomic_install.os.write = partial_then_block
atomic_install.atomic_install(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), mode=0o755)
'''
        process = subprocess.Popen([sys.executable, "-c", program, str(HELPER.parent),
                                    str(self.source), str(self.target), str(marker)])
        try:
            deadline = time.monotonic() + 5
            while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(marker.exists(), "child did not reach its actual partial temporary-file write")
            process.kill()
            process.wait(timeout=3)
            self.assertOldPreserved()
            temporary = list(self.root.glob(".installed.install-*"))
            self.assertEqual(len(temporary), 1)
            self.assertEqual(temporary[0].stat().st_size, 4096)
            # A subsequent normal install succeeds despite the abandoned temp.
            installer.atomic_install(self.source, self.target, mode=0o755)
            self.assertEqual(self.target.read_bytes(), self.new)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=3)

    def test_file_sync_precedes_replace_and_directory_sync_follows(self):
        events = []
        real_sync, real_replace = os.fsync, os.replace
        def synced(descriptor):
            events.append("directory" if stat.S_ISDIR(os.fstat(descriptor).st_mode) else "file")
            return real_sync(descriptor)
        def replaced(source, destination):
            self.assertEqual(events, ["file"])
            events.append("replace")
            return real_replace(source, destination)
        with mock.patch.object(installer.os, "fsync", side_effect=synced), \
             mock.patch.object(installer.os, "replace", side_effect=replaced):
            installer.atomic_install(self.source, self.target)
        self.assertEqual(events, ["file", "replace", "directory"])

    def test_directory_sync_failure_reports_unconfirmed_commit(self):
        with mock.patch.object(installer, "_sync_directory", side_effect=OSError("directory sync failed")):
            with self.assertRaisesRegex(OSError, "durability is unconfirmed"):
                installer.atomic_install(self.source, self.target)
        # Rename has already committed; claiming that the old file survived
        # or silently ignoring a failed durability check would be incorrect.
        self.assertEqual(self.target.read_bytes(), self.new)

    def test_tree_preserves_executable_modes_and_excludes_private_artifacts(self):
        source, destination = self.root / "tree", self.root / "prefix"
        (source / "scripts").mkdir(parents=True)
        script = source / "scripts" / "run.sh"
        script.write_text("#!/bin/sh\nexit 0\n")
        script.chmod(0o755)
        for name in (".local", "certs", "third_party", "__pycache__"):
            (source / name).mkdir()
            (source / name / "private").write_text("ignored artifact")
        installer.install_tree(source, destination, (".local", "certs", "third_party", "__pycache__"))
        self.assertEqual((destination / "scripts/run.sh").read_bytes(), script.read_bytes())
        self.assertEqual(stat.S_IMODE((destination / "scripts/run.sh").stat().st_mode), 0o755)
        self.assertEqual(sorted(entry.name for entry in destination.iterdir()), ["scripts"])

    def test_final_symlink_is_refused_without_touching_its_target(self):
        link = self.root / "link"
        link.symlink_to(self.target)
        with self.assertRaisesRegex(ValueError, "non-regular"):
            installer.atomic_install(self.source, link)
        self.assertOldPreserved()


if __name__ == "__main__":
    unittest.main()
