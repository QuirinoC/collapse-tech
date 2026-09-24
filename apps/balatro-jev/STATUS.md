# balatro-jev status (cashout-crash fix)

## Branch

`cursor/balatro-cashout-crash-c808` (off `cursor/balatro-jev-brain-merge-35ca`)

## Crash root cause

**Error:** `functions/common_events.lua:1227: attempt to index field 'round_eval' (a nil value)`

**Cause:** Watch rewrote `cash_out` (new `decided_at`) while ROUND_EVAL payout
animation was still running. Lua called `G.FUNCS.cash_out` before the real
`cash_out_button` existed → cash_out nilled `G.round_eval` while queued
`add_round_eval_row` events still indexed it → hard crash. Launch log showed
**3×** `cash_out ok=true` then crash.

## Fix (mod **0.2.2**)

1. **state.lua** — `phase=round_eval` only when pressable `cash_out_button` exists;
   mid-anim → `unknown`.
2. **actions.lua** — cash_out only via real UI button; refuse if not ready.
3. **balatro_jev.lua** — skip duplicate successful one-shots on JSON rewrite.
4. **watch** — do not re-fire one-shots after `action_result.ok=true`; wait when
   legal set empty.

## Repro proof (this session)

- Boot: `v0.2.2 cash_out button gate` + `hooked Game:update`
- During payout: `phase=unknown raw=8` (waited) — no premature cash_out
- Then: **one** `cash_out ok=true detail=cash_out_button` → `phase=shop`
- Continued to Big Blind / hand — **0 crashes**
- Lovely injector intact (`DYLD_INSERT_LIBRARIES=liblovely.dylib`)

## Runtime now

- **Game: STOPPED** (Juan asked STOP — do not relaunch)
- **Watch: STOPPED**
- **DO_NOT_LAUNCH** markers restored + Steam `run_lovely_macos.sh` stubbed

```bash
cd apps/balatro-jev
npm run typecheck && npm run smoke:lua
# optional: BALATRO_JEV_IPC_DIR=... npm run watch
```
