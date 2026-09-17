#!/usr/bin/env python3
"""Pack FlyWire FAFB v783 into a compact browser LIF graph.

Sources (public):
  - Codex / FlyWire neuron + connection tables (FAFB snapshot 783),
    redistributed as gzipped CSVs by the FlyWire community dump used in
    snedea/flybrain (same columns as Codex `neurons` / `classification` /
    `connections`).
  - Schlegel et al. 2024 neuron annotations (cell_type, hemibrain_type)
    https://github.com/flyconnectome/flywire_annotations

Authored part: channel labels (which neurons are 'loom' vs 'walk').
The edges and synapse counts are FlyWire's.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

MAGIC = b"FLYC"
VERSION = 1
FLAG_DROPPED_OPTIC = 1

# Authored channel table. Names are stable and embedded in the binary.
CHANNELS = [
    "photo_l",
    "photo_r",
    "photo",
    "loom",
    "motion",
    "olf_food_l",
    "olf_food_r",
    "olf_food",
    "olf_l",
    "olf_r",
    "pn",
    "mech_l",
    "mech_r",
    "mech",
    "gus_sweet",
    "gus_bitter",
    "gus_water",
    "thermo",
    "cx",
    "hunger_mod",
    "mn_proboscis",
    "mn_head",
    "dn_walk",
    "dn_flight",
    "dn_escape",
    "dn_other",
    "dn_l",
    "dn_r",
    "tonic",
]

CHANNEL_ID = {name: i for i, name in enumerate(CHANNELS)}

NT_SIGN = {
    "ACH": 1.0,
    "GABA": -1.0,
    "GLUT": -1.0,  # adult fly GluCl is inhibitory
    "DA": 0.35,
    "SER": 0.35,
    "OA": 0.35,
    "OCT": 0.35,
}

FOOD_ORN = (
    "dm1",
    "dm2",
    "dm3",
    "dm4",
    "dm6",
    "va2",
    "va4",
    "vm2",
    "vm5",
    "vm7",
    "dp1",
    "vl2p",
    "vm3",
    "am1",
    "vc1",
    "vc2",
    "vm1",
    "va6",
    "dl5",
)

LOOM_TYPES = ("lc4", "lc6", "lplc2", "lplc1", "lc16")
MOTION_PREFIXES = ("hs", "vs", "hse", "hsn", "hss", "lptc")


def side_of(value: str) -> int:
    v = (value or "").strip().lower()
    if v == "left":
        return 1
    if v == "right":
        return 2
    if v in ("midline", "center", "middle"):
        return 3
    return 0


def add_channel(buckets: dict[str, list[int]], name: str, idx: int) -> None:
    buckets[name].append(idx)


def is_food_orn(cell_type: str, sub: str) -> bool:
    blob = f"{cell_type} {sub}".lower()
    if "pheromon" in blob:
        return False
    if any(tag in blob for tag in FOOD_ORN):
        return True
    if "orn_" in blob or blob.startswith("orn"):
        return True
    return "olfact" in blob and "pheromon" not in blob


def classify_channels(
    *,
    flow: str,
    super_class: str,
    cell_class: str,
    sub_class: str,
    cell_type: str,
    hemibrain: str,
    side: int,
    idx: int,
    buckets: dict[str, list[int]],
    drop_optic: bool,
) -> bool:
    """Return False if this neuron should be omitted from the shipped graph."""
    sc = super_class
    cc = cell_class
    sub = sub_class
    typ = f"{cell_type} {hemibrain}".strip()
    typ_l = typ.lower()
    blob = f"{sc} {cc} {sub} {typ_l} {flow}"

    optic_intrinsic = "optic_lobe_intrinsic" in cc or (
        sc == "optic" and "intrinsic" in cc
    )
    if drop_optic and optic_intrinsic:
        return False

    photo = "photo_receptor" in sub or "photo_receptor" in cc or "ocellar" in cc or "ocellar" in sub
    if photo:
        add_channel(buckets, "photo", idx)
        if side == 1:
            add_channel(buckets, "photo_l", idx)
        elif side == 2:
            add_channel(buckets, "photo_r", idx)
        else:
            add_channel(buckets, "photo_l", idx)
            add_channel(buckets, "photo_r", idx)

    if sc == "visual_projection" or "visual_projection" in cc:
        if any(tag in typ_l for tag in LOOM_TYPES):
            add_channel(buckets, "loom", idx)
        if any(typ_l.startswith(p) or f" {p}" in typ_l for p in MOTION_PREFIXES):
            add_channel(buckets, "motion", idx)
        if "lc" in typ_l or "lplc" in typ_l:
            if any(tag in typ_l for tag in ("lc4", "lc6", "lplc2")):
                add_channel(buckets, "loom", idx)

    if "olfact" in cc or cc in ("alpn", "alln", "alin"):
        if cc in ("alpn", "alon"):
            add_channel(buckets, "pn", idx)
        else:
            add_channel(buckets, "olf_l" if side != 2 else "olf_r", idx)
            if side == 0:
                add_channel(buckets, "olf_r", idx)
            if is_food_orn(cell_type, sub):
                add_channel(buckets, "olf_food", idx)
                if side == 2:
                    add_channel(buckets, "olf_food_r", idx)
                else:
                    add_channel(buckets, "olf_food_l", idx)
                if side == 0:
                    add_channel(buckets, "olf_food_r", idx)

    if "mechano" in cc or "bristle" in sub or "wind" in sub or "auditory" in sub:
        add_channel(buckets, "mech", idx)
        if side == 2:
            add_channel(buckets, "mech_r", idx)
        else:
            add_channel(buckets, "mech_l", idx)
        if side == 0:
            add_channel(buckets, "mech_r", idx)

    if "gustat" in cc or cc == "tpn":
        if "bitter" in sub:
            add_channel(buckets, "gus_bitter", idx)
        elif "water" in sub and "sugar" not in sub:
            add_channel(buckets, "gus_water", idx)
        else:
            add_channel(buckets, "gus_sweet", idx)
            if "water" in sub or "sugar/water" in sub:
                add_channel(buckets, "gus_water", idx)

    if "thermo" in cc or "hygro" in cc:
        add_channel(buckets, "thermo", idx)

    if cc == "cx" or "central complex" in blob:
        add_channel(buckets, "cx", idx)

    if sc == "endocrine" or "hugin" in typ_l or typ in ("IPC", "DH44", "DMS"):
        add_channel(buckets, "hunger_mod", idx)

    if sc == "motor" or "motor" in cc:
        if any(k in sub or k in typ_l for k in ("proboscis", "ingestion", "haustellum", "salivary", "crop")):
            add_channel(buckets, "mn_proboscis", idx)
        elif any(k in sub or k in typ_l for k in ("neck", "head", "antenna", "eye")):
            add_channel(buckets, "mn_head", idx)
        else:
            add_channel(buckets, "mn_head", idx)

    descending = sc == "descending" or typ_l.startswith("dn") or typ_l.startswith("mdn")
    if descending:
        if side == 2:
            add_channel(buckets, "dn_r", idx)
        else:
            add_channel(buckets, "dn_l", idx)
        if side == 0:
            add_channel(buckets, "dn_r", idx)

        if typ_l.startswith("dnp01") or "giant" in typ_l:
            add_channel(buckets, "dn_escape", idx)
        elif typ_l.startswith("dna") or typ_l.startswith("dnb") or typ_l.startswith("dnc") or typ_l.startswith("dnd") or typ_l.startswith("mdn"):
            add_channel(buckets, "dn_walk", idx)
        elif typ_l.startswith("dnp"):
            add_channel(buckets, "dn_flight", idx)
        else:
            add_channel(buckets, "dn_other", idx)

    if cc == "cx" or sc == "central" and not optic_intrinsic:
        # Sparse tonic targets: CX plus a thin slice of other central cells.
        if cc == "cx" or (idx % 17 == 0 and sc == "central"):
            add_channel(buckets, "tonic", idx)

    return True


def load_neurons(path: Path) -> tuple[list[str], dict[str, str]]:
    root_ids: list[str] = []
    nt: dict[str, str] = {}
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rid = row["root_id"].strip()
            root_ids.append(rid)
            nt[rid] = (row.get("nt_type") or "").strip().upper()
    return root_ids, nt


def load_classification(path: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            out[row["root_id"].strip()] = row
    return out


def load_annotations(path: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            out[row["root_id"].strip()] = row
    return out


def aggregate_edges(
    path: Path,
    keep: dict[str, int],
    neuron_nt: dict[str, str],
) -> tuple[list[tuple[int, int, float]], int]:
    sums: dict[tuple[int, int], float] = defaultdict(float)
    synapse_total = 0
    skipped = 0
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            pre = keep.get(row["pre_root_id"].strip())
            post = keep.get(row["post_root_id"].strip())
            if pre is None or post is None:
                skipped += 1
                continue
            syn = int(row["syn_count"])
            synapse_total += syn
            nt = (row.get("nt_type") or neuron_nt.get(row["pre_root_id"].strip()) or "").upper()
            sign = NT_SIGN.get(nt, 1.0)
            sums[(pre, post)] += syn * sign
    edges = [(a, b, w) for (a, b), w in sums.items() if w != 0.0]
    edges.sort()
    print(f"edges {len(edges):,} (skipped {skipped:,} rows, {synapse_total:,} synapses)", file=sys.stderr)
    return edges, synapse_total


def write_binary(
    path: Path,
    *,
    n: int,
    edges: list[tuple[int, int, float]],
    group: list[int],
    side: list[int],
    buckets: dict[str, list[int]],
    flags: int,
) -> float:
    # Clip by synapse count. Normalizing to the raw max (~thousands) crushes
    # typical 5–20 synapse edges to ~0 and the graph goes silent.
    cap = 28.0
    max_abs = cap
    row_ptr = [0] * (n + 1)
    for pre, _, _ in edges:
        row_ptr[pre + 1] += 1
    for i in range(1, n + 1):
        row_ptr[i] += row_ptr[i - 1]

    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.with_suffix("")
    # Write gzip directly.
    with gzip.open(path, "wb", compresslevel=9) as handle:
        handle.write(struct.pack("<4sHHI IIf", MAGIC, VERSION, flags, n, len(edges), len(CHANNELS), max_abs))
        handle.write(struct.pack(f"<{n}H", *group))
        handle.write(bytes(side))
        pad = (4 - ((24 + n * 2 + n) % 4)) % 4
        if pad:
            handle.write(b"\0" * pad)
        handle.write(struct.pack(f"<{n + 1}I", *row_ptr))
        cols = [post for _, post, _ in edges]
        weights = [int(max(-32767, min(32767, round(w / max_abs * 32767)))) for _, _, w in edges]
        handle.write(struct.pack(f"<{len(cols)}I", *cols))
        handle.write(struct.pack(f"<{len(weights)}h", *weights))
        for name in CHANNELS:
            ids = buckets[name]
            encoded = name.encode("ascii")
            handle.write(struct.pack("<B", len(encoded)))
            handle.write(encoded)
            handle.write(struct.pack("<I", len(ids)))
            if ids:
                handle.write(struct.pack(f"<{len(ids)}I", *ids))
    print(f"wrote {path} ({path.stat().st_size / 1024 / 1024:.2f} MB gz)", file=sys.stderr)
    return max_abs


def write_meta(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {path}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--out-dir", type=Path, default=Path("client/public/connectome"))
    parser.add_argument("--drop-optic", action="store_true", help="Omit optic-lobe intrinsic neurons")
    parser.add_argument("--if-missing", action="store_true")
    args = parser.parse_args()

    out_bin = args.out_dir / "graph.bin.gz"
    out_meta = args.out_dir / "meta.json"
    if args.if_missing and out_bin.exists() and out_meta.exists():
        print(f"exists {out_bin}", file=sys.stderr)
        return

    raw = args.raw_dir
    needed = [raw / "neurons.csv.gz", raw / "classification.csv.gz", raw / "connections.csv.gz", raw / "annotations.tsv"]
    for item in needed:
        if not item.exists():
            sys.exit(f"missing {item}")

    root_ids, neuron_nt = load_neurons(raw / "neurons.csv.gz")
    classification = load_classification(raw / "classification.csv.gz")
    annotations = load_annotations(raw / "annotations.tsv")
    print(f"neurons {len(root_ids):,}  class {len(classification):,}  ann {len(annotations):,}", file=sys.stderr)

    buckets: dict[str, list[int]] = {name: [] for name in CHANNELS}
    keep: dict[str, int] = {}
    group: list[int] = []
    side_flags: list[int] = []
    next_idx = 0

    for rid in root_ids:
        cls = classification.get(rid, {})
        ann = annotations.get(rid, {})
        flow = (cls.get("flow") or ann.get("flow") or "").strip().lower()
        super_class = (ann.get("super_class") or cls.get("super_class") or "").strip().lower()
        cell_class = (ann.get("cell_class") or cls.get("class") or "").strip().lower()
        sub_class = (ann.get("cell_sub_class") or cls.get("sub_class") or "").strip().lower()
        cell_type = (ann.get("cell_type") or "").strip()
        hemibrain = (ann.get("hemibrain_type") or "").strip()
        side = side_of(ann.get("side") or cls.get("side") or "")
        keep_neuron = classify_channels(
            flow=flow,
            super_class=super_class,
            cell_class=cell_class,
            sub_class=sub_class,
            cell_type=cell_type,
            hemibrain=hemibrain,
            side=side,
            idx=next_idx,
            buckets=buckets,
            drop_optic=args.drop_optic,
        )
        if not keep_neuron:
            continue
        keep[rid] = next_idx
        # group nibble is unused by the worker (channels are the interface)
        group.append(0)
        side_flags.append(side)
        next_idx += 1

    print(f"kept {next_idx:,} / {len(root_ids):,}  drop_optic={args.drop_optic}", file=sys.stderr)
    for name in CHANNELS:
        print(f"  {name:14s} {len(buckets[name]):6d}", file=sys.stderr)

    edges, synapses = aggregate_edges(raw / "connections.csv.gz", keep, neuron_nt)
    flags = FLAG_DROPPED_OPTIC if args.drop_optic else 0
    write_binary(
        out_bin,
        n=next_idx,
        edges=edges,
        group=group,
        side=side_flags,
        buckets=buckets,
        flags=flags,
    )
    write_meta(
        out_meta,
        {
            "dataset": "FlyWire FAFB v783",
            "dataset_full": "Female Adult Fly Brain, proofread snapshot 783",
            "citations": [
                "Dorkenwald et al., Nature 634:124-138 (2024)",
                "Schlegel et al., Nature 634:139-152 (2024)",
            ],
            "sources": [
                "Codex public neuron/classification/connection tables (FAFB v783)",
                "flyconnectome/flywire_annotations Supplemental_file1 (cell types)",
            ],
            "neurons": next_idx,
            "connections": len(edges),
            "synapses": synapses,
            "full_proofread_neurons": 139255,
            "dropped_optic_intrinsic": bool(args.drop_optic),
            "channels": {name: len(buckets[name]) for name in CHANNELS},
            "mapping": (
                "Authored: world sensors inject current into labeled FlyWire "
                "populations (ORNs/PNs, LC/LPLC loom VPNs, photoreceptors, "
                "bristle/JO, GRNs). Hunger/thirst only scale feeding-related "
                "channels. Motor verbs are decoded from descending / brain-motor "
                "population rates. The graph and weights are FlyWire's."
            ),
            "limits": (
                "FAFB is brain-only (no VNC). Leg/wing motor neurons are absent; "
                "locomotion is read from descending neurons. Glutamate is treated "
                "as inhibitory (GluCl). LIF parameters are a real-time approximation, "
                "not a biophysical fit."
            ),
        },
    )


if __name__ == "__main__":
    main()
