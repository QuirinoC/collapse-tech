# balatro-jev status (2026-09-24)

## Done on this Mac

- Steam Balatro + Lovely v0.10.0 + Steamodded 26.829.0 installed
- Mod symlinked: `Mods/balatro_jev` → `apps/balatro-jev/mod/balatro_jev`
- `.env` IPC: `BALATRO_JEV_IPC_DIR=…/Balatro/balatro_jev` (gitignored)
- **Full-run loop:** legal actions + Lua apply for menu / blind / hand / round_eval / shop / pack / game_over
- Watch loop: confidence gates, poll + stuck re-engage, forced progress escape
- **0.2.1 fix:** durable `Game:update` hook (state dump was dying after splash), phase inference for `blind_select` / `menu`, louder DECIDE/APPLY logs

## Operator path

```bash
# Terminal A
cd ~/dev/collapse-tech/apps/balatro-jev && npm run watch

# Terminal B — do NOT use Steam Play
npm run launch:macos
```

1. Mods menu → **Balatro Jev** enabled.
2. On title (`phase=menu`) bridge tries `new_run`; or click Play once if stake UI blocks.
3. On blind select watch should log `DECIDE … → select_blind_small`; mod prints `APPLY result … ok=true`.
4. Heartbeat: `…/Balatro/balatro_jev/heartbeat.txt` should refresh every ~2s while the game runs.

## Phase status

| Phase | Playable? |
| --- | --- |
| Menu / title | Best-effort `new_run` via `G.FUNCS.start_run(nil, {stake=1})` |
| Blind select / skip | Yes — `G.blind_select_opts` + `select_blind` / `skip_blind` |
| Hand play / discard | Yes |
| Round eval cash-out | Yes — `G.FUNCS.cash_out` |
| Shop buy / sell / use / reroll / leave | Yes — shop Card refs + `toggle_shop` |
| Pack open select / skip | Yes — `G.pack_cards` + `skip_booster` |
| Game over new run / menu | Best-effort — `start_run` / `go_to_menu` |

## Offline checks

```bash
npm run typecheck
npm run smoke:phases
npm run simulate
```

## Still fragile

- Consumables that need a hand target may no-op without a highlighted card.
- Buying during shop UI spawn (~0.43s) can miss the card — watch loop retries.
- Menu `new_run` may still need a manual stake click on some builds.

## Undo Lovely

Delete `liblovely.dylib` + `run_lovely_macos.sh` from the Steam Balatro folder. Game binary untouched.
