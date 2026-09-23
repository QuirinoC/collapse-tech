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
  mod/balatro_jev/     Steamodded mod stub
  scripts/smoke-jev-live.mts
```

## Setup

```bash
cd apps/balatro-jev
cp .env.example .env   # add TYPESAFE_API_KEY for live mode
npm install
```

Never commit `.env`.

- **Mock:** unset key, or `BALATRO_JEV_MODE=mock`
- **Live:** set `TYPESAFE_API_KEY` (model pinned via `JEV_MODEL_ID=jev-1.13.0`)

## Run

```bash
npm run mock          # hand fixture → mock decision → ipc/action.json
npm run simulate      # cycle all fixtures (mock)
npm start -- --once --fixture fixtures/shop-state.json
npm run watch         # watch ipc/state.json
npm run smoke:live    # direct live Choice smoke (needs key)
npm run typecheck
```

## Steamodded mod

Copy `mod/balatro_jev/` into Balatro `Mods/`. Stub writes `balatro_jev/state.json` in the Love2D save dir and applies `action.json`. Balatro `G.*` / FUNCS hooks are **TODO** until verified in-game. Point `BALATRO_JEV_IPC_DIR` at that folder or sync into `./ipc`.

## Protocol

- **state.json** `version: 1` — `phase`, resources, `hand` / `jokers` / `shop`, optional `legal_actions`
- **action.json** — `{ action: { id, kind, label, params }, mode, confidence, model, … }`

Action `id`s are the Jev Choice labels. Below `MIN_ACTION_CONFIDENCE` the bridge falls back to the mock heuristic.
