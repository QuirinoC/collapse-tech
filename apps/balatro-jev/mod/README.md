# balatro_jev (Steamodded mod)

Lua side of **balatro-jev**: dump structured game state, read the bridge’s chosen action, apply it. **No screenshots / vision.**

## Assumptions

- [Steamodded](https://github.com/Steamodded/smods) + [Lovely](https://github.com/ethangreen-dev/lovely-injector) installed for **Steam** Balatro on macOS.
- Default entry (`balatro_jev.lua`) writes under the Love2D save directory: `balatro_jev/state.json`.
- Optional modular files (`main.lua` + `state.lua` / `actions.lua` / `ipc.lua`) support an absolute `IPC_DIR`.

## macOS install (this repo)

Mods live in the **save** dir, not the Steam game dir:

```text
~/Library/Application Support/Balatro/Mods/
  smods/          # Steamodded
  balatro_jev/    # symlink → apps/balatro-jev/mod/balatro_jev
```

```bash
# from repo root
ln -sfn "$PWD/apps/balatro-jev/mod/balatro_jev" \
  "$HOME/Library/Application Support/Balatro/Mods/balatro_jev"
```

Launch Balatro with Lovely (`run_lovely_macos.sh` next to `Balatro.app`), then:

```bash
cd apps/balatro-jev
# .env should set:
# BALATRO_JEV_IPC_DIR=$HOME/Library/Application Support/Balatro/balatro_jev
npm run watch
```

Full steps: [../README.md](../README.md).

## IPC contract

| File | Writer | Reader |
| --- | --- | --- |
| `state.json` | Lua | Node (`src/`) |
| `action.json` | Node | Lua |

Shapes match `apps/balatro-jev/src/types.ts` (`BalatroState` / `LegalAction`).

## Wired vs TODO

**Wired (hand):** `play_hand` / `discard` via `G.hand:add_to_highlighted` + `G.FUNCS.play_cards_from_highlighted` / `discard_cards_from_highlighted`.

**Partial:** `reroll_shop`, `cash_out` (may need real UI `e`).

**TODO (need UI `e.config.ref_table`):** `select_blind`, `skip_blind`, `buy`, `sell`, `use_consumable`; shop/blind enumeration in state dump.

Until blind/shop apply lands, use `npm run mock` / `simulate` / `smoke:live` for Jev without those phases.
