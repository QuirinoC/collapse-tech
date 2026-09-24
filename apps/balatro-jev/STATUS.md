# balatro-jev status (full-context / 0.3.0)

## Architecture

Full Lua state dump → full legal Choice options → Jev (live when ≥2 options) → Lua apply.

## Done

- Rich state: hand `chip_value`, joker/consumable `effect`, `shop_can_leave`, `deck_remaining`, blinds
- Phase map: `BLIND_SELECT` / `SELECTING_HAND` / `SHOP` never stuck `unknown`
- Hand: every made-hand combo (pair+) + draws + ranked high-cards; discard subsets; 255 cap after score
- Shop/pack/blind/menu/round_eval/game_over: full legal sets with `{ what, not_for }` criteria
- Live Jev logged (action, conf, tokens); mock combo-aware fallback
- Fixture `pair-hand-state.json` for Ace-pair preference

## Operator

Do not relaunch watch/game unless Juan asks. Offline:

```bash
npm run typecheck
npm run mock:pair
npm run simulate
```
