# balatro-jev status (2026-09-23)

## Done on this Mac

- Steam Balatro + Lovely v0.10.0 + Steamodded 26.829.0 installed
- Mod symlinked: `Mods/balatro_jev` → `apps/balatro-jev/mod/balatro_jev`
- `.env` IPC: `BALATRO_JEV_IPC_DIR=…/Balatro/balatro_jev` (gitignored)
- **Full-run loop (this branch):** legal actions + Lua apply for blind / hand / round_eval / shop / pack / game_over
- Watch loop: confidence gates, poll + stuck re-engage, forced progress escape

## Operator path

```bash
# Terminal A
cd ~/dev/collapse-tech/apps/balatro-jev && npm run watch

# Terminal B — do NOT use Steam Play
npm run launch:macos
```

1. Mods menu → **Balatro Jev** enabled.
2. Start a run from the menu (title-screen auto-start not wired).
3. Bridge logs `phase=… → action_id`; mod prints `apply … => true`.

## Phase status

| Phase | Playable? |
| --- | --- |
| Blind select / skip | Yes — `G.blind_select_opts` + `select_blind` / `skip_blind` |
| Hand play / discard | Yes |
| Round eval cash-out | Yes — `G.FUNCS.cash_out` |
| Shop buy / sell / use / reroll / leave | Yes — shop Card refs + `toggle_shop` |
| Pack open select / skip | Yes — `G.pack_cards` + `skip_booster` |
| Game over new run / menu | Best-effort — `start_run` / `go_to_menu` (overlay may need manual confirm) |

## Offline checks

```bash
npm run typecheck
npm run smoke:phases   # Lua FUNCS ↔ kinds + fixture cycle
npm run simulate       # mock full phase cycle
# BALATRO_JEV_MODE=live npm run simulate   # spends Jev credits
```

## Still fragile

- Consumables that need a hand target may no-op without a highlighted card.
- Buying during shop UI spawn (~0.43s) can miss the card — watch loop retries.
- Title → New Run still manual.

## Undo Lovely

Delete `liblovely.dylib` + `run_lovely_macos.sh` from the Steam Balatro folder. Game binary untouched.
