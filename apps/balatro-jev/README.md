# balatro-jev

Balatro **state → Jev Choice → action** bridge for a full autonomous run loop (no vision).

1. Steamodded Lua mod dumps `state.json` and applies `action.json`.
2. TypeScript derives legal actions and asks **TypeSafe Jev** (`choice` over those ids), or uses a **mock** heuristic with no API key.
3. Watch loop continuously decide+apply with confidence gates and stuck-state escapes.

## Layout

```
apps/balatro-jev/
  src/                 CLI, bridge, Jev client, legal-action derivation
  fixtures/            sample states for offline runs (all phases)
  ipc/                 default state.json / action.json exchange dir
  mod/balatro_jev/     Steamodded mod (symlinked into Mods/)
  scripts/             simulate, smoke, macos launch
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

```bash
BALATRO_JEV_IPC_DIR=/Users/<you>/Library/Application Support/Balatro/balatro_jev
```

## Operator path (macOS)

Steam’s Play button does **not** load Lovely. Use two terminals:

```bash
# Terminal A — bridge
cd ~/dev/collapse-tech/apps/balatro-jev
npm run watch

# Terminal B — game with Lovely + Steamodded
npm run launch:macos
```

1. Confirm Mods menu shows **Balatro Jev**.
2. Title screen: bridge may send `new_run` (stake 1). If stake UI blocks, click Play once.
3. Blind select: watch logs `DECIDE … select_blind_*`; mod logs `APPLY result … ok=true`.
4. Heartbeat file `…/Balatro/balatro_jev/heartbeat.txt` should refresh ~every 2s (proves Lua tick is alive).

Offline:

```bash
npm run mock
npm run simulate          # full phase cycle (mock)
npm run smoke:phases      # Lua FUNCS check + simulate
npm run smoke:live        # live Choice smoke (needs key)
npm run typecheck
```

## Phase coverage

| Phase | Legal actions (TS) | Lua apply |
| --- | --- | --- |
| `menu` | `new_run` | `G.FUNCS.start_run(nil, {stake=1})` |
| `blind_select` | `select_blind`, `skip_blind` | `G.FUNCS.select_blind` / `skip_blind` via `G.blind_select_opts` UI refs (synth fallback) |
| `hand` | `play_hand`, `discard` (candidate sets) | highlight → `play_cards_from_highlighted` / `discard_cards_from_highlighted` |
| `round_eval` | `cash_out` | `G.FUNCS.cash_out({config={}})` |
| `shop` | `buy`, `sell`, `use_consumable`, `reroll`, `leave_shop` | `buy_from_shop` / `use_card` (booster+voucher) / `sell_card` / `reroll_shop` / `toggle_shop` |
| `pack_open` | `pack_select`, `pack_skip` | `use_card` on `G.pack_cards` / `skip_booster` |
| `game_over` | `new_run`, `go_to_menu` | `start_run` / `go_to_menu` |

### Still blocked / fragile

| Gap | Missing / risk |
| --- | --- |
| Menu stake overlay | `new_run` uses stake 1; some builds still show stake UI that needs a click |
| Consumable targeting | `use_card` on targeted tarots may need a highlighted hand card; untargeted use may no-op |
| Shop vouchers/boosters mid-animation | Apply during shop card UI spawn delay (~0.43s) can miss the card |
| `new_run` after game over | Relies on `G.FUNCS.start_run`; overlay/stake UI may still need a click on some builds |

## macOS: Steamodded + Lovely

| Piece | Path |
| --- | --- |
| Steam game | `~/Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app` |
| Lovely | `…/Balatro/liblovely.dylib` + `run_lovely_macos.sh` |
| Steamodded | `~/Library/Application Support/Balatro/Mods/smods` |
| Our mod | `Mods/balatro_jev` → symlink to `apps/balatro-jev/mod/balatro_jev` |

If Gatekeeper blocks: Privacy & Security → Allow Anyway, or `xattr -rd com.apple.quarantine liblovely.dylib`.

## Watch-loop safety

- Confidence below `MIN_ACTION_CONFIDENCE` → mock heuristic fallback
- Live API errors → mock fallback (never stall)
- Identical state for `BALATRO_JEV_STUCK_MS` (default 8s) → re-decide
- Same action repeated `BALATRO_JEV_MAX_SAME` times → force leave/select/play escape
- Poll every `BALATRO_JEV_POLL_MS` (default 1.5s) in addition to `fs.watch`

## Protocol

- **state.json** `version: 1` — `phase`, resources, `hand` / `jokers` / `shop` / `pack` / `blinds`
- **action.json** — `{ action: { id, kind, label, params }, mode, confidence, model, … }`

## Refund-safe tip

Keep Steam playtime **under 2 hours** while testing if you might refund.
