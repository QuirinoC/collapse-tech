"""Real local Git repositories exercise the source selection safety boundary."""
from pathlib import Path
import subprocess
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / "scripts/aacs-source.sh"


class AacsSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.origin = self.work / "origin"
        self.origin.mkdir()
        self.git(self.origin, "init", "-q")
        self.git(self.origin, "config", "user.name", "Fixture")
        self.git(self.origin, "config", "user.email", "fixture@example.invalid")
        (self.origin / "source").write_text("tested\n")
        self.git(self.origin, "add", "source")
        self.git(self.origin, "commit", "-qm", "tested")
        self.tested = self.git(self.origin, "rev-parse", "HEAD").stdout.strip()
        (self.origin / "source").write_text("newer\n")
        self.git(self.origin, "commit", "-qam", "newer")
        self.newer = self.git(self.origin, "rev-parse", "HEAD").stdout.strip()
        self.target = self.work / "checkout"

    @staticmethod
    def git(path, *args):
        return subprocess.run(["git", "-C", str(path), *args], check=True,
                              capture_output=True, text=True, timeout=15)

    def ensure(self, revision, name="AACS"):
        return subprocess.run(["bash", "-c", 'source "$1"; ensure_pinned_source "$2" "$3" "$4" "$5"',
                               "fixture", str(HELPER), str(self.target),
                               str(self.origin), revision, name],
                              capture_output=True, text=True, timeout=20)

    def test_fresh_clone_checks_out_tested_commit_not_repository_head(self):
        result = self.ensure(self.tested)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git(self.target, "rev-parse", "HEAD").stdout.strip(), self.tested)
        self.assertEqual((self.target / "source").read_text(), "tested\n")

    def test_existing_same_revision_preserves_local_changes(self):
        self.assertEqual(self.ensure(self.tested).returncode, 0)
        (self.target / "source").write_text("local changes\n")
        result = self.ensure(self.tested)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.target / "source").read_text(), "local changes\n")

    def test_existing_different_revision_fails_without_reset(self):
        self.assertEqual(self.ensure(self.newer).returncode, 0)
        (self.target / "source").write_text("local changes\n")
        result = self.ensure(self.tested)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git(self.target, "rev-parse", "HEAD").stdout.strip(), self.newer)
        self.assertEqual((self.target / "source").read_text(), "local changes\n")

    def test_uxplay_checkout_preserves_dirty_tree_and_rejects_mismatch(self):
        self.assertEqual(self.ensure(self.tested, "UxPlay").returncode, 0)
        (self.target / "source").write_text("local UxPlay changes\n")
        match = self.ensure(self.tested, "UxPlay")
        self.assertEqual(match.returncode, 0, match.stderr)
        mismatch = self.ensure(self.newer, "UxPlay")
        self.assertNotEqual(mismatch.returncode, 0)
        self.assertIn("UxPlay source revision", mismatch.stderr)
        self.assertEqual(self.git(self.target, "rev-parse", "HEAD").stdout.strip(), self.tested)
        self.assertEqual((self.target / "source").read_text(), "local UxPlay changes\n")

    def test_libusbgx_checkout_preserves_dirty_tree_and_rejects_mismatch(self):
        self.assertEqual(self.ensure(self.tested, "libusbgx").returncode, 0)
        (self.target / "source").write_text("local libusbgx changes\n")
        self.assertEqual(self.ensure(self.tested, "libusbgx").returncode, 0)
        mismatch = self.ensure(self.newer, "libusbgx")
        self.assertNotEqual(mismatch.returncode, 0)
        self.assertIn("libusbgx source revision", mismatch.stderr)
        self.assertEqual(self.git(self.target, "rev-parse", "HEAD").stdout.strip(), self.tested)
        self.assertEqual((self.target / "source").read_text(), "local libusbgx changes\n")

    def test_non_repository_directory_is_not_changed(self):
        self.target.mkdir()
        (self.target / "important").write_text("keep\n")
        result = self.ensure(self.tested)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.target / "important").read_text(), "keep\n")

    def test_existing_uninitialized_submodule_is_not_populated(self):
        submodule = self.work / "submodule"
        submodule.mkdir()
        self.git(submodule, "init", "-q")
        self.git(submodule, "config", "user.name", "Fixture")
        self.git(submodule, "config", "user.email", "fixture@example.invalid")
        (submodule / "data").write_text("fixture\n")
        self.git(submodule, "add", "data")
        self.git(submodule, "commit", "-qm", "fixture")
        self.git(self.origin, "-c", "protocol.file.allow=always", "submodule", "add",
                 "-q", str(submodule), "nested")
        self.git(self.origin, "commit", "-qam", "with submodule")
        revision = self.git(self.origin, "rev-parse", "HEAD").stdout.strip()
        self.git(self.work, "clone", "-q", str(self.origin), str(self.target))
        result = self.ensure(revision)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("submodules are missing", result.stderr)
        self.assertFalse((self.target / "nested/data").exists())


if __name__ == "__main__":
    unittest.main()
