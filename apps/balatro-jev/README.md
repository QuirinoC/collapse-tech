# balatro-jev

Balatro **state → Jev Choice → action** bridge.

1. Steamodded Lua mod dumps `state.json` and applies `action.json`.
2. TypeScript derives legal actions and asks **TypeSafe Jev** (`choice` over those ids), or uses a **mock** heuristic with no API key.

## Layout

```
apps/balatro-jev/
  src/                 CLI, bridge, Jev client, legal-action derivation
  fixtures/            sample states for offline runs
  ipc/                 default state.json / action.json exchange dir
  mod/balatro_jev/     Steamodded mod (symlinked into Mods/)
  scripts/             helpers (simulate, macos launch notes)
```

## Setup (Node)

```bash
cd apps/balatro-jev
cp .env.example .env   # add TYPESAFE_API_KEY for live mode
npm install
```

Never commit `.env`.

- **Mock:** unset key, or `BALATRO_JEV_MODE=mock`
- **Live:** set `TYPESAFE_API_KEY` (model pinned via `JEV_MODEL_ID=jev-1.13.0`)

### IPC path (macOS)

Love2D save dir for Steam Balatro:

```
~/Library/Application Support/Balatro/
```

The mod writes under `balatro_jev/` inside that folder. Set in `.env`:

```bash
BALATRO_JEV_IPC_DIR=/Users/<you>/Library/Application Support/Balatro/balatro_jev
```

(See `.env.example`.)

## macOS: Steamodded + Lovely (Steam install only)

Official docs: [Installing Steamodded on Mac](https://docs.smods.dev/Installation/Installing%20Steamodded%20mac/) · [Lovely injector](https://github.com/ethangreen-dev/lovely-injector)

**Do not use Arcade / App Store Balatro.** Use Steam’s copy.

### Already applied on this machine (agent)

| Piece | Path |
| --- | --- |
| Steam game | `~/Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app` |
| Lovely | `…/Balatro/liblovely.dylib` + `run_lovely_macos.sh` (v0.10.0 aarch64) |
| Steamodded | `~/Library/Application Support/Balatro/Mods/smods` (26.829.0) |
| Our mod | `~/Library/Application Support/Balatro/Mods/balatro_jev` → symlink to `apps/balatro-jev/mod/balatro_jev` |

### Launch (required on Mac)

Steam’s Play button does **not** load Lovely on macOS. Launch via Terminal:

```bash
cd "$HOME/Library/Application Support/Steam/steamapps/common/Balatro"
sh run_lovely_macos.sh
```

Or drag `run_lovely_macos.sh` onto **Terminal.app**.

If macOS blocks `liblovely.dylib`: System Settings → Privacy & Security → Allow Anyway, or:

```bash
xattr -rd com.apple.quarantine liblovely.dylib
```

In-game you should see a Lovely console window and a **Mods** button (Steamodded). Enable **Balatro Jev**.

### Re-install from scratch (if needed)

1. Download Lovely Arm release `lovely-aarch64-apple-darwin.tar.gz` from [releases](https://github.com/ethangreen-dev/lovely-injector/releases).
2. Extract `liblovely.dylib` + `run_lovely_macos.sh` into the Steam Balatro folder (same folder as `Balatro.app`).
3. Download Steamodded “Source code (zip)” from [smods releases](https://github.com/Steamodded/smods/releases/latest).
4. Put the inner folder at `~/Library/Application Support/Balatro/Mods/smods/` (not nested `smods/smods`).
5. Symlink our mod:

```bash
ln -sfn "$PWD/apps/balatro-jev/mod/balatro_jev" \
  "$HOME/Library/Application Support/Balatro/Mods/balatro_jev"
```

## Run (bridge + game)

```bash
# Terminal A — after Lovely/Steamodded launch shows Mods
cd apps/balatro-jev
npm run watch

# Terminal B — launch game with injector
cd "$HOME/Library/Application Support/Steam/steamapps/common/Balatro"
sh run_lovely_macos.sh
```

Offline (no game):

```bash
npm run mock          # hand fixture → mock decision → ipc/action.json
npm run simulate      # cycle all fixtures (mock)
npm start -- --once --fixture fixtures/shop-state.json
npm run smoke:live    # direct live Choice smoke (needs key)
npm run typecheck
```

## Control status

| Action | Status |
| --- | --- |
| `play_hand` / `discard` | Wired: highlight by 0-based indices → `G.FUNCS.play_cards_from_highlighted` / `discard_cards_from_highlighted` |
| `reroll` | Best-effort `G.FUNCS.reroll_shop({})` |
| `cash_out` | Best-effort in `ROUND_EVAL`; leave-shop via `toggle_shop` may need UI `e` |
| `select_blind` / `skip_blind` / `buy` / `sell` / `use_consumable` | TODO — native FUNCS expect a UI element (`e.config.ref_table`) |

## Refund-safe tip

If you might refund on Steam, keep total playtime **under 2 hours** while testing mods.

## Protocol

- **state.json** `version: 1` — `phase`, resources, `hand` / `jokers` / `shop`, optional `legal_actions`
- **action.json** — `{ action: { id, kind, label, params }, mode, confidence, model, … }`

Action `id`s are the Jev Choice labels. Below `MIN_ACTION_CONFIDENCE` the bridge falls back to the mock heuristic.
