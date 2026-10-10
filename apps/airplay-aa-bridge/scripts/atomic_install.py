#!/usr/bin/env python3
"""Durably replace individual installed files without truncating the old file.

Each file is copied to a sibling temporary file, chmod/chown'd and fsync'd,
then renamed and its directory fsync'd. Failure before rename preserves the
old file; failure after rename reports unconfirmed directory durability.
Trees are installed one file at a time, not as a multi-file transaction.
"""
from __future__ import annotations

import argparse
import fnmatch
import io
import os
from pathlib import Path
import stat
import sys
import tempfile


def _sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ensure_directory(directory: Path) -> None:
    missing = []
    ancestor = directory
    while not ancestor.exists():
        missing.append(ancestor)
        ancestor = ancestor.parent
    if not ancestor.is_dir():
        raise ValueError(f"Destination parent is not a directory: {ancestor}")
    for path in reversed(missing):
        path.mkdir()
        _sync_directory(path)
        _sync_directory(path.parent)


def _replace_from_stream(destination: Path, stream, mode: int, owner=None,
                         group=None, allow_empty=False, source_metadata=None) -> None:
    destination = Path(destination)
    _ensure_directory(destination.parent)
    previous = None
    try:
        previous = destination.lstat()
    except FileNotFoundError:
        pass
    if previous is not None and not stat.S_ISREG(previous.st_mode):
        raise ValueError(f"Refusing non-regular destination: {destination}")
    if previous is not None:
        owner = previous.st_uid if owner is None else owner
        group = previous.st_gid if group is None else group
    descriptor, temporary = tempfile.mkstemp(prefix=f".{destination.name}.install-",
                                            dir=destination.parent)
    renamed = False
    try:
        total = 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                written = os.write(descriptor, view)
                if written <= 0:
                    raise OSError("Temporary-file write made no progress")
                total += written
                view = view[written:]
        if not total and not allow_empty:
            raise ValueError("Refusing empty installation input")
        if source_metadata is not None:
            current_source = os.fstat(stream.fileno())
            if total != source_metadata.st_size or \
               (current_source.st_size, current_source.st_mtime_ns, current_source.st_ctime_ns) != \
               (source_metadata.st_size, source_metadata.st_mtime_ns, source_metadata.st_ctime_ns):
                raise ValueError("Source changed during installation; installed file preserved")
        current = os.fstat(descriptor)
        uid = current.st_uid if owner is None else owner
        gid = current.st_gid if group is None else group
        if (uid, gid) != (current.st_uid, current.st_gid):
            os.fchown(descriptor, uid, gid)
        os.fchmod(descriptor, mode)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, destination)
        renamed = True
        try:
            _sync_directory(destination.parent)
        except OSError as error:
            raise OSError(f"Replaced {destination}, but directory durability is unconfirmed: {error}") from error
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if not renamed:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def atomic_install(source: Path, destination: Path, mode=None, owner=None,
                   group=None, allow_empty=False) -> None:
    source = Path(source)
    descriptor = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"Refusing non-regular source: {source}")
        permissions = stat.S_IMODE(metadata.st_mode) if mode is None else mode
        _replace_from_stream(Path(destination), stream, permissions, owner, group, allow_empty, metadata)


def atomic_write(destination: Path, data: bytes, mode=None, owner=None,
                 group=None, allow_empty=False) -> None:
    destination = Path(destination)
    if mode is None:
        try:
            mode = stat.S_IMODE(destination.lstat().st_mode)
        except FileNotFoundError:
            mode = 0o644
    _replace_from_stream(destination, io.BytesIO(data), mode, owner, group, allow_empty)


def install_tree(source: Path, destination: Path, exclusions=(), owner=None,
                 group=None, allow_empty=False) -> None:
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or not source.is_dir():
        raise ValueError(f"Expected a regular source directory: {source}")
    if source.resolve() == destination.resolve() or source.resolve() in destination.resolve().parents:
        raise ValueError("Destination tree must be outside the source tree")
    _ensure_directory(destination)
    for entry in sorted(source.iterdir()):
        relative = entry.relative_to(source)
        if any(fnmatch.fnmatch(relative.as_posix(), pattern) or
               fnmatch.fnmatch(entry.name, pattern) for pattern in exclusions):
            continue
        if entry.is_symlink():
            raise ValueError(f"Refusing source symlink: {entry}")
        target = destination / entry.name
        if entry.is_dir():
            install_tree(entry, target, exclusions, owner, group, allow_empty)
        else:
            atomic_install(entry, target, owner=owner, group=group, allow_empty=allow_empty)


def _mode(value: str) -> int:
    try:
        number = int(value, 8)
    except ValueError as error:
        raise argparse.ArgumentTypeError("mode must be octal, such as 755") from error
    if not 0 <= number <= 0o7777:
        raise argparse.ArgumentTypeError("mode must be between 0000 and 7777")
    return number


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="source file, directory with --tree, or - for stdin")
    parser.add_argument("destination", type=Path, help="exact destination path")
    parser.add_argument("--mode", type=_mode, help="file permissions in octal (default: source mode)")
    parser.add_argument("--owner", type=int, help="destination numeric UID (default: preserve existing)")
    parser.add_argument("--group", type=int, help="destination numeric GID (default: preserve existing)")
    parser.add_argument("--tree", action="store_true", help="install a tree one file at a time")
    parser.add_argument("--exclude", action="append", default=[], help="tree entry-name glob; applies at every depth")
    parser.add_argument("--allow-empty", action="store_true", help="explicitly permit empty input files")
    args = parser.parse_args()
    if args.tree and (args.source == "-" or args.mode is not None):
        parser.error("--tree requires a directory and preserves individual source modes")
    if args.exclude and not args.tree:
        parser.error("--exclude requires --tree")
    try:
        if args.tree:
            install_tree(Path(args.source), args.destination, args.exclude,
                         args.owner, args.group, args.allow_empty)
        elif args.source == "-":
            _replace_from_stream(args.destination, sys.stdin.buffer,
                                 0o644 if args.mode is None else args.mode,
                                 args.owner, args.group, args.allow_empty)
        else:
            atomic_install(Path(args.source), args.destination, args.mode,
                           args.owner, args.group, args.allow_empty)
    except (OSError, ValueError) as error:
        print(f"Atomic install failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
