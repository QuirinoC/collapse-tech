# The Fly

One cartoon housefly in the browser. Locomotion is driven by a leaky integrate-and-fire tick of the **FlyWire FAFB v783** connectome, not a wander script.

Live: [fly.collapsetechnologies.com](https://fly.collapsetechnologies.com)

This is a connectome-driven controller. It is not a conscious fly and it cannot feel.

## Dataset

| | |
| --- | --- |
| Map | Female Adult Fly Brain, FlyWire proofread snapshot **783** |
| Citations | Dorkenwald et al., *Nature* 634:124–138 (2024); Schlegel et al., *Nature* 634:139–152 (2024) |
| Tables | Codex public neuron / classification / connection dumps (same FAFB v783 CSVs) |
| Cell types | [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations) Supplemental file 1 |

Shipped in this build (full map, optic lobe included):

- **139,255 neurons**
- **2,699,092 connections** (34,153,566 synapses aggregated across neuropils)

Counts also live in `client/public/connectome/meta.json` and on the page. If a future pack drops optic-lobe intrinsic neurons, the page says so.

## What is mapped vs authored

**FlyWire (not invented):** neurons, directed connections, synapse counts, neurotransmitter signs (ACH +, GABA −, GLUT − as GluCl, amines weak +), Schlegel cell types / sides.

**Authored (said once):** world sensors write current into labeled populations.

- Food odor → food-type ORNs / PNs, left vs right by bearing
- Water → water GRNs, scaled by thirst
- Brightness / object in the visual cone → photoreceptors (and left/right eyes)
- Loom → LC4, LC6, LPLC2 visual projection neurons
- Floor / wall contact → mechanosensory
- Hunger / thirst are **not** in the static connectome. They only scale feeding-related channels (Hugin / IPC / DH44, sweet GRNs, food ORNs)

**Authored decode:** motor verbs are read from descending and brain-motor population rates (DNa/b/c/d + MDN → walk, DNp → flight, DNp01 → escape, left/right DNs → turn, proboscis/ingestion MNs → eat). The body executes those verbs. If the graph is silent, the fly stops. There is no leftover utility-AI.

FAFB is brain-only. Leg and wing motor neurons live in the VNC, which is not in this map. Walking and flight are decoded from descending neurons.

## Runtime

The Cloudflare Worker is a dumb KV snapshot (`GET`/`PUT /api/state`, `fly_id` cookie). The LIF graph runs in a Web Worker in the tab.

```bash
npm install
python3 scripts/build_connectome.py          # full FAFB v783
# python3 scripts/build_connectome.py --drop-optic   # if the full graph is too heavy
npm run dev
```

Raw Codex/annotation tables live in `data/raw/` (gitignored). The packed graph is `client/public/connectome/graph.bin.gz`.
