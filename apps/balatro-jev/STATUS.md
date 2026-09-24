# balatro-jev status (cashout-crash fix / brain-merge)

## Branch

`cursor/balatro-cashout-crash-c808` (off `cursor/balatro-jev-brain-merge-35ca`)

## Crash root cause (2026-09-23 20:44)

**Error:** `functions/common_events.lua:1227: attempt to index field 'round_eval' (a nil value)`

**Cause:** Watch kept rewriting `cash_out` (new `decided_at`) while ROUND_EVAL payout
animation was still running. Lua called `G.FUNCS.cash_out` before the real
`cash_out_button` existed → cash_out nilled `G.round_eval` while queued
`add_round_eval_row` events still indexed it → hard crash. Triple apply in the
launch log confirmed re-entrancy.

## Fix (mod 0.2.2)

1. **state.lua** — `phase=round_eval` only when `cash_out_button` is present and
   pressable (`config.button == "cash_out"`); otherwise `unknown` mid-anim.
2. **actions.lua** — cash_out only via the real UI button; refuse if not ready.
3. **balatro_jev.lua** — skip duplicate successful one-shots when watch rewrites JSON.
4. **watch (index.ts)** — do not re-fire one-shots after `action_result.ok=true`;
   wait when legal set is empty.

## Lovely / launcher

`run_lovely_macos.sh` is the real injector (`DYLD_INSERT_LIBRARIES=liblovely.dylib`).
Not a DO_NOT_LAUNCH stub.

## Operator

```bash
cd apps/balatro-jev
npm run typecheck
npm run smoke:lua
npm run launch:macos   # then npm run watch in another terminal if desired
```
