# balatro-jev

Balatro **full state → full legal Choice → Jev → Lua apply** bridge for an autonomous run (no vision).

Architecture:

1. **Steamodded Lua mod** dumps rich named JSON (`state.json`) every ~0.5s and applies `action.json`.
2. **TypeScript bridge** always derives the **full legal action set** for the phase (poker combos, shop offers, blinds, packs, …), capped at 255 Choice options after scoring.
3. **TypeSafe Jev** (`choice` over those ids) picks one action when there are ≥2 options. Mock is combo-aware (not random) and only used on API failure or low confidence.
4. **Lua apply** executes every action kind in-game.

No toy heuristics as the main path. No skip-Jev-on-single-action nonsense except when there is truly one forced action. No noop loops when the phase is actionable.

## Layout

```
apps/balatro-jev/
  src/                 CLI, bridge, Jev client, legal-action derivation, poker combos
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

Offline:

```bash
npm run mock
npm run simulate          # full phase cycle (mock)
npm run smoke:phases
npm run smoke:live        # live Choice smoke (needs key)
npm run typecheck
```

Pair-hand smoke (mock must prefer the Ace pair):

```bash
BALATRO_JEV_MODE=mock npx tsx src/index.ts --once --fixture fixtures/pair-hand-state.json
```

## Full state projection

Lua dump fills (every phase):

| Field | Contents |
| --- | --- |
| `phase` | `blind_select` / `hand` / `shop` / `pack_open` / `round_eval` / `menu` / `game_over` |
| `ante`, blind type, `chips_needed`, `chips_scored` | Blind pressure |
| `hands_left`, `discards_left`, `money` | Resources |
| `hand[]` | index, rank, suit, enhancement, edition, seal, `chip_value` |
| `jokers[]` / `consumables[]` | name + short `effect` text |
| `shop` | offers with id/cost/type/name; `reroll_cost`; `shop_can_leave` |
| `pack` | cards available |
| `blinds` | select/skip flags + status |
| `deck_remaining` | draw pile size when available |

Phase mapping never stays `unknown` while `G.STATE` is `BLIND_SELECT`, `SELECTING_HAND`, or `SHOP`. Mid-hand transitions (`HAND_PLAYED` / `DRAW_TO_HAND`) stay `unknown` so apply does not fire mid-animation.

## Full legal Choice options

| Phase | Options |
| --- | --- |
| `menu` | `new_run` |
| `blind_select` | select each available blind; skip if allowed |
| `hand` | every made-hand combo (pair+) + ranked high-card/draw candidates; discard subsets when `discards_left>0`; labeled with hand type + cards |
| `round_eval` | `cash_out` |
| `shop` | buy each affordable offer; sell each joker/consumable; use each consumable; reroll; leave |
| `pack_open` | take each; skip |
| `game_over` | `new_run`, `go_to_menu` |

Choice criteria use structured `{ what, not_for }` per option. If enumeration exceeds **255**, score and keep the best N — never collapse to a lone noop.

## Jev call policy

- `BALATRO_JEV_MODE=live` → `systemOne` Choice whenever there are **≥2** legal options
- Skip Jev only for a single forced action
- Log every call: action, confidence, `tokens_in` / `tokens_out`
- On API failure or confidence below `MIN_ACTION_CONFIDENCE` → **combo-aware mock** (plays best made hand, not random)

## Lua apply

| Kind | Apply |
| --- | --- |
| `play_hand` / `discard` | highlight → play/discard highlighted |
| `select_blind` / `skip_blind` | `G.blind_select_opts` UI refs (fails with UI-not-ready until UIBox exists) |
| `buy` / `sell` / `use_consumable` / `reroll` / `leave_shop` | shop FUNCS |
| `pack_select` / `pack_skip` | pack `use_card` / `skip_booster` |
| `cash_out` | `G.FUNCS.cash_out` |
| `new_run` / `go_to_menu` | `start_run` / `go_to_menu` |

### Still fragile

| Gap | Risk |
| --- | --- |
| Menu stake overlay | `new_run` uses stake 1; some builds still show stake UI |
| Targeted consumables | May need a highlighted hand card |
| Shop mid-animation | Buy during spawn (~0.43s) can miss; watch retries |

## Watch-loop safety

- Confidence below `MIN_ACTION_CONFIDENCE` → mock fallback
- Live API errors → mock fallback (never stall)
- Identical state for `BALATRO_JEV_STUCK_MS` (default 8s) → re-decide
- Same action repeated `BALATRO_JEV_MAX_SAME` times → force progress escape
- Poll every `BALATRO_JEV_POLL_MS` (default 1.5s)

## Protocol

- **state.json** `version: 1` — rich dump above
- **action.json** — `{ action, mode, confidence, tokens, model, legal_action_ids, … }`

## Refund-safe tip

Keep Steam playtime **under 2 hours** while testing if you might refund.
