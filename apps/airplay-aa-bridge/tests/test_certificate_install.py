"""Installer integration with real atomic I/O and isolated service/SSH doubles.

The checker double accepts one fixture pair; crypto validation belongs to the
real check-phone-certs.sh. Root UID/GID arguments are recorded then removed so
these file/mode tests can run without elevated privileges on macOS or Linux.
"""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CertificateInstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.project = self.work / "project"
        self.scripts = self.project / "scripts"
        self.scripts.mkdir(parents=True)
        self.prefix = self.work / "installed"
        (self.prefix / "libexec/aaserver").mkdir(parents=True)
        self.certificates = self.work / "identity"
        self.certificates.mkdir()
        (self.certificates / "android_auto.crt").write_bytes(b"fixture certificate\n")
        (self.certificates / "android_auto.key").write_bytes(b"fixture private key\n")
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.calls = self.work / "atomic-calls.jsonl"
        self.checks = self.work / "checks.log"
        self.remote_calls = self.work / "remote-calls.jsonl"
        self.wrapper = self.work / "remote-wrapper.sh"
        shutil.copyfile(ROOT / "scripts/install-certs.sh", self.scripts / "install-certs.sh")
        self.write_executable(self.scripts / "check-phone-certs.sh", """#!/usr/bin/env bash
set -euo pipefail
cmp -s "$1/android_auto.crt" "$EXPECTED_IDENTITY/android_auto.crt"
[[ -s "$1/android_auto.key" ]] || exit 1
cmp -s "$1/android_auto.key" "$EXPECTED_IDENTITY/android_auto.key"
printf '%s\\n' "$1" >> "$CHECK_LOG"
""")
        self.write_executable(self.scripts / "atomic_install.py", f"""#!{sys.executable}
import json, os, pathlib, runpy, sys
with open(os.environ['ATOMIC_LOG'], 'a') as stream:
    stream.write(json.dumps(sys.argv[1:]) + '\\n')
for flag in ('--owner', '--group'):
    if flag in sys.argv:
        index = sys.argv.index(flag)
        del sys.argv[index:index+2]
runpy.run_path(os.environ['REAL_ATOMIC_INSTALLER'], run_name='__main__')
""")
        self.write_executable(self.bin / "id", "#!/bin/sh\nprintf '0\\n'\n")
        self.write_executable(self.bin / "systemctl", "#!/bin/sh\necho unexpected-systemctl >&2\nexit 91\n")
        self.env = os.environ.copy()
        self.env.update(
            PATH=str(self.bin) + os.pathsep + self.env["PATH"],
            AIRPLAY_AA_PREFIX=str(self.prefix),
            AIRPLAY_AA_CERT_DIR=str(self.certificates),
            AIRPLAY_AA_SKIP_RESTART="1",
            EXPECTED_IDENTITY=str(self.certificates), CHECK_LOG=str(self.checks),
            ATOMIC_LOG=str(self.calls), REAL_ATOMIC_INSTALLER=str(ROOT / "scripts/atomic_install.py"),
            REMOTE_LOG=str(self.remote_calls), REMOTE_WRAPPER=str(self.wrapper),
        )

    @staticmethod
    def write_executable(path, content):
        path.write_text(content)
        path.chmod(0o755)

    def run_installer(self, *args):
        return subprocess.run(["bash", str(self.scripts / "install-certs.sh"), *args],
                              env=self.env, capture_output=True, text=True, timeout=20)

    def test_all_runtime_source_build_pairs_are_atomic_and_private(self):
        targets = [self.prefix / "certs", self.prefix / "libexec/aaserver"]
        for base in (self.prefix, self.project):
            for relative in ("third_party/AACS/AAServer/ssl", "third_party/AACS/build/AAServer"):
                directory = base / relative
                directory.mkdir(parents=True)
                targets.append(directory)
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        for directory in targets:
            for name, mode in (("android_auto.crt", 0o644), ("android_auto.key", 0o600)):
                installed = directory / name
                self.assertEqual(installed.read_bytes(), (self.certificates / name).read_bytes())
                self.assertEqual(stat.S_IMODE(installed.stat().st_mode), mode)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 2 * len(targets))
        for call in calls:
            self.assertEqual(call[-4:], ["--owner", "0", "--group", "0"])
        self.assertEqual(self.checks.read_text().splitlines(),
                         [str(self.certificates), str(self.prefix / "libexec/aaserver")])

    def test_invalid_pair_fails_before_creation_or_existing_file_replacement(self):
        runtime = self.prefix / "libexec/aaserver"
        (runtime / "android_auto.crt").write_bytes(b"old certificate\n")
        (runtime / "android_auto.key").write_bytes(b"old key\n")
        (self.certificates / "android_auto.key").write_bytes(b"")
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.prefix / "certs").exists())
        self.assertFalse(self.calls.exists())
        self.assertEqual((runtime / "android_auto.crt").read_bytes(), b"old certificate\n")
        self.assertEqual((runtime / "android_auto.key").read_bytes(), b"old key\n")

    def test_source_is_one_target_without_copying_it_over_itself(self):
        source = self.prefix / "certs"
        shutil.copytree(self.certificates, source)
        self.env["AIRPLAY_AA_CERT_DIR"] = str(source)
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(Path(call[1]).parent == self.prefix / "libexec/aaserver" for call in calls))

    def test_remote_stages_helper_and_keeps_sudo_stdin_interactive(self):
        for command in ("ssh", "scp"):
            self.write_executable(self.bin / command, f"""#!{sys.executable}
import json, os, pathlib, sys
command = pathlib.Path(sys.argv[0]).name
with open(os.environ['REMOTE_LOG'], 'a') as stream:
    stream.write(json.dumps([command, *sys.argv[1:]]) + '\\n')
if command == 'ssh' and sys.argv[-1].startswith('mktemp -d '):
    print('/tmp/airplay-aa-certs.Fixture123')
if command == 'scp' and sys.argv[-1].endswith('/apply-phone-certs.sh'):
    pathlib.Path(os.environ['REMOTE_WRAPPER']).write_text(pathlib.Path(sys.argv[-2]).read_text())
""")
        result = self.run_installer("fixture@pi.example")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.remote_calls.read_text().splitlines()]
        uploads = [call for call in calls if call[0] == "scp"]
        self.assertIn(str(self.scripts / "atomic_install.py"), uploads[0])
        sudo = [call for call in calls if call[0] == "ssh" and "sudo bash" in call[-1]]
        self.assertEqual(len(sudo), 1)
        self.assertIn("-t", sudo[0])
        wrapper = self.wrapper.read_text()
        self.assertIn('python3 "$stage/atomic_install.py" "$stage/$script"', wrapper)
        self.assertIn('"/opt/airplay-aa/scripts/$script" --mode 755 --owner 0 --group 0', wrapper)
        self.assertNotIn("install -d", wrapper)
        syntax = subprocess.run(["bash", "-n", str(self.wrapper)], capture_output=True, text=True)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)

    def test_bench_update_and_durable_rollback_preserve_config_and_key_modes(self):
        # Rewrite only fixed installation roots in an isolated script copy.
        # Running tests as root on a Pi can never target its real installation.
        config = self.work / "etc/bridge.env"
        config.parent.mkdir()
        config.write_text("AIRPLAY_AA_SOURCE=airplay\nexport AIRPLAY_AA_SOURCE=old\nKEEP_SETTING=value\n")
        config.chmod(0o640)
        backup_root = self.work / "backups"
        backup_root.mkdir()
        self.env["SERVICE_LOG"] = str(self.work / "service.log")
        self.write_executable(self.bin / "systemctl", f"""#!{sys.executable}
import os, pathlib, sys
if sys.argv[1] == 'show':
    field = sys.argv[sys.argv.index('-p') + 1]
    print({{'LoadState': 'loaded', 'User': 'root', 'KillMode': 'control-group',
           'ExecStart': 'path=' + os.environ['AIRPLAY_AA_PREFIX'] + '/scripts/run-bridge.sh ;'}}[field])
elif sys.argv[1] == 'is-active':
    print('active')
else:
    with open(os.environ['SERVICE_LOG'], 'a') as stream:
        stream.write(sys.argv[1] + '\\n')
""")
        self.write_executable(self.bin / "stat", f"""#!{sys.executable}
import os, stat, sys
metadata = os.stat(sys.argv[3])
print({{'%a': format(stat.S_IMODE(metadata.st_mode), 'o'),
       '%u': str(metadata.st_uid), '%g': str(metadata.st_gid)}}[sys.argv[2]])
""")
        self.write_executable(self.bin / "timeout", '#!/bin/sh\nshift\nexec "$@"\n')
        for executable in ("openssl", "install"):
            if shutil.which(executable) is None:
                self.write_executable(self.bin / executable, "#!/bin/sh\nexit 0\n")
        files = ["scripts/run-bridge.sh", "scripts/run-airplay-pipeline.sh",
                 "scripts/install-certs.sh", "scripts/check-phone-certs.sh",
                 "scripts/atomic_install.py", "bridge/inject_h264.py",
                 "bridge/aa_framing.py", "bridge/gen_idle_h264.py"]
        originals = {config: (config.read_bytes(), 0o640)}
        for relative in files:
            staged = self.project / relative
            if not staged.exists():
                staged.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, staged)
            installed = self.prefix / relative
            installed.parent.mkdir(parents=True, exist_ok=True)
            if relative != "scripts/atomic_install.py":
                installed.write_bytes(b"previous installed file\n")
                installed.chmod(0o744)
                originals[installed] = (installed.read_bytes(), 0o744)
        runtime = self.prefix / "libexec/aaserver"
        (runtime / "AAServer").write_bytes(b"existing binary\n")
        (runtime / "AAServer").chmod(0o755)
        for name, mode in (("android_auto.crt", 0o644), ("android_auto.key", 0o600)):
            path = runtime / name
            path.write_bytes(b"previous identity\n")
            path.chmod(mode)
            originals[path] = (path.read_bytes(), mode)
        bench = self.scripts / "apply-bench-update.sh"
        content = (ROOT / "scripts/apply-bench-update.sh").read_text()
        content = content.replace("PREFIX=/opt/airplay-aa", f"PREFIX='{self.prefix}'")
        content = content.replace("CONFIG=/etc/airplay-aa/bridge.env", f"CONFIG='{config}'")
        content = content.replace("/var/backups/airplay-aa-bench-", str(backup_root / "airplay-aa-bench-"))
        bench.write_text(content)
        result = subprocess.run(["bash", str(bench)], env=self.env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(config.read_text(), "AIRPLAY_AA_SOURCE=test-pattern\nKEEP_SETTING=value\n")
        self.assertEqual(stat.S_IMODE(config.stat().st_mode), 0o640)
        self.assertEqual(Path(self.env["SERVICE_LOG"]).read_text(), "stop\nrestart\n")
        backup, = backup_root.iterdir()
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((backup / "files" / str(runtime / "android_auto.key").lstrip('/')).stat().st_mode), 0o600)
        result = subprocess.run(["bash", str(backup / "rollback.sh")], env=self.env,
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        for path, (data, mode) in originals.items():
            self.assertEqual(path.read_bytes(), data)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode)
        self.assertFalse((self.prefix / "scripts/atomic_install.py").exists())
        self.assertFalse((self.prefix / "certs/android_auto.key").exists())
        self.assertEqual(Path(self.env["SERVICE_LOG"]).read_text(), "stop\nrestart\nstop\nrestart\n")


if __name__ == "__main__":
    unittest.main()
