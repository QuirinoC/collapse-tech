# balatro-jev status (2026-09-24)

## Brain fix (full-brain-7b2a)

**Root cause of dumb plays:** live Jev often returned a valid made-hand id at
low confidence (`~0.33`), then the bridge **threw it away** and ran a dumb mock
that picked the first `play_hand` (high-card stubs like `play_0_1_2`).

**Fix:**
- Enumerate labeled poker combos (`play_flush_…`, `play_pair_…`, draws, discards)
- Rich semantic state (`hand.best_made`, chips, preference_order)
- ALWAYS call live Jev when ≥2 options; log option keys + choice + conf
- Keep valid Jev choice even below `MIN_ACTION_CONFIDENCE`
- Combo-aware mock only on API / unknown-id failure

## Live proof (pair-flush fixture)

```
JEV CALL options=11 keys=[play_flush_AH_KH_QH_JH_9H, play_pair_AH_AD, …]
JEV RESULT choice=play_flush_AH_KH_QH_JH_9H conf=0.990
```

Runtime left **stopped** after proof.

## Operator path

```bash
cd ~/dev/collapse-tech
git fetch origin cursor/balatro-jev-full-brain-7b2a
git checkout cursor/balatro-jev-full-brain-7b2a
cd apps/balatro-jev && npm run watch   # Terminal A
npm run launch:macos                   # Terminal B — only when Juan asks
```

Mods symlink still: `~/Library/Application Support/Balatro/Mods/balatro_jev` →
`apps/balatro-jev/mod/balatro_jev` (working tree).
