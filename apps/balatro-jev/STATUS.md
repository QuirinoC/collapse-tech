# balatro-jev status (2026-09-23)

## Done on this Mac

- Steam Balatro found: `~/Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app`
- Lovely **v0.10.0** (aarch64) installed beside the `.app`
- Steamodded **26.829.0** at `~/Library/Application Support/Balatro/Mods/smods`
- Mod symlinked: `Mods/balatro_jev` → repo `apps/balatro-jev/mod/balatro_jev`
- Smoke launch: Lovely + SMODS + mod loaded; wrote `…/Balatro/balatro_jev/state.json`
- `.env` IPC: `BALATRO_JEV_IPC_DIR=…/Balatro/balatro_jev` (gitignored)
- Lua: `play_hand` / `discard` wired to real `G.FUNCS.*`

## When you sit down

```bash
# Terminal A
cd ~/dev/collapse-tech/apps/balatro-jev && npm run watch

# Terminal B — do NOT use Steam Play
npm run launch:macos
# or: sh "$HOME/Library/Application Support/Steam/steamapps/common/Balatro/run_lovely_macos.sh"
```

1. Confirm Mods menu shows **Balatro Jev**.
2. Start a run → enter a hand.
3. Watch Terminal A: `state.json` should show `phase: "hand"` and cards; bridge writes `action.json`.
4. Mod should highlight + play/discard.

## Still manual / TODO

- Blind select / skip / shop buy / sell / use consumable need UI `e` refs.
- If Gatekeeper blocks Lovely: Privacy & Security → Allow Anyway.
- **Refund tip:** keep Steam playtime under **2h** while testing if you might refund.

## Undo Lovely (non-destructive)

Delete only these from the Steam Balatro folder: `liblovely.dylib`, `run_lovely_macos.sh`.  
Remove `~/Library/Application Support/Balatro/Mods/` if you want mods gone. Game binary untouched.
