# balatro_jev (Steamodded mod)

Lua side of **balatro-jev**: dump structured game state, read the bridge’s chosen action, apply it. **No screenshots / vision.**

## Assumptions

- [Steamodded](https://github.com/Steamopollys/Steamodded) is installed for Balatro.
- Default entry (`balatro_jev.lua`) writes under the Love2D save directory: `balatro_jev/state.json`.
- Optional modular files (`main.lua` + `state.lua` / `actions.lua` / `ipc.lua`) support an absolute `IPC_DIR` pointing at `apps/balatro-jev/ipc`.

## Install

1. Copy this folder (`mod/balatro_jev/`) into your Steamodded Mods directory.
2. Start the Node bridge from the repo:
   ```bash
   cd apps/balatro-jev && npm run watch
   ```
3. Point the bridge at the mod’s save-dir IPC (or symlink/copy):
   ```bash
   # macOS example — adjust the Balatro save path for your platform
   export BALATRO_JEV_IPC_DIR="$HOME/Library/Application Support/Balatro/balatro_jev"
   npm run watch
   ```
   Or set `IPC_DIR` in `config.lua` and switch `metadata.json` `main_file` to `main.lua` for absolute-path IPC.
4. Launch Balatro with Steamodded; enable **Balatro Jev**.

## IPC contract

| File | Writer | Reader |
| --- | --- | --- |
| `state.json` | Lua | Node (`src/`) |
| `action.json` | Node | Lua |

Shapes match `apps/balatro-jev/src/types.ts` (`BalatroState` / `LegalAction`).

## TODOs before real runs

- Map `G.STATE` enums → `hand` | `shop` | `blind_select` | …
- Confirm `G.GAME` / `G.hand` / `G.jokers` field paths for your Balatro + SMODS versions.
- Implement play / discard / shop / blind apply helpers (currently stubbed with TODO returns).
- Enforce stale `action.json` rejection via `decided_at` + max age.

Until those land, use `npm run mock` / `npm run simulate` / `npm run smoke:live` to exercise Jev without the game.
