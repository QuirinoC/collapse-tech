# balatro-jev status (brain-merge / 0.3.0)

## Branch

`cursor/balatro-jev-brain-merge-35ca` — consolidates:

- **full-context-6ed5**: rich Lua/state dump, full legal Choice sets (~58 hand options), curated discards
- **full-brain-7b2a**: poker combo labels + **never discard a valid Jev Choice on low confidence**

## Critical fix (low-conf trap gone)

**Root cause of dumb plays:** live Jev returned a valid made-hand id at low confidence
(`~0.33`), then the bridge threw it away and ran mock → first `play_hand` stubs like
`play_0_1_2`.

**Fix:** keep any legal Choice id even below `MIN_ACTION_CONFIDENCE`. Combo-aware mock
only on API failure or unknown/stale action id.

## Proof

```bash
cd apps/balatro-jev
npm run proof:brain
# also: npm run mock:pair && npm run mock:pair-flush
```

Runtime left **STOPPED** (`.DO_NOT_LAUNCH` + launch script blocker). Do not relaunch
watch/game unless Juan asks.

## Operator (offline)

```bash
npm run typecheck
npm run proof:brain
npm run simulate
```
