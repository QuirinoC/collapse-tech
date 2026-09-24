# jev-desk

Paper-only market-making desk on Kuru MON-USDC. **No wallet. No live orders. No PRIVATE_KEY. Do not fade Jev.**

Code owns numbers, quotes, inventory, markout, size, cancels, and caps. Jev answers a fan-out of semantic questions (`regime`, `quote_ok`, `toxic`, `lean`) over named buckets. `compose.ts` gates those answers on **explicit confidence / probability floors** and only then rests two-sided post-only quotes. Skip is a win.

The old desk asked one buy/sell Choice on raw floats with `MIN_CONFIDENCE=0`. That logged confidence and still traded every slot — how you manufacture a 25% hit rate on chop. That question remains only as the **naive control**.

## Run

```bash
cd apps/jev-desk
cp .env.example .env   # add TYPESAFE_API_KEY for Jev; never commit it
npm install
```

Short synthetic tape (no RPC, no key):

```bash
TAPE=mock BLOCKS=48 npm run investigate
```

Locked holdout (checked-in synthetic fixture, faster than live; not Kuru parquet). This is the keep/kill tape:

```bash
TAPE=replay npm run replay
```

Short live **read** (needs Monad RPC). Paper only. The JS OrderBook ABI has no pause view, so market state is **UNKNOWN** and the desk **fail-closes** — it will not quote:

```bash
TAPE=live BLOCKS=20 MODEL=mock npm run investigate
```

Mock + Jev on the same mock tape when a key is present:

```bash
TAPE=mock BLOCKS=48 MODEL=mock COMPARE=1 npm run investigate
```

`MODEL=jev` requires `TYPESAFE_API_KEY`. Without a key, `COMPARE=1` stays mock-only. Do not use a live tape as a silent ACTIVE book.

## Paper range (`MODE=range`)

Separate from the maker engine. Code owns a **statistical** band (recent mid high/low + ATR-style width), a 200 MON clip, a take-profit **inside** the band, and a stop **beyond** it that actually flattens. The band is a habit of the recent tape, **not a guaranteed range**. Default is sit. Skip when the band is dead or vol just expanded. One position per horizon.

Jev does not compute prices. It answers one Choice over named `tape_summary` (and `headline` when set): `nothing_burger` vs `range_breaker`. **High confidence + nothing-burger** is the only ACT path (buy the dip / sell the high). Low confidence sits.

Three paper books on the same tape: **sit** (never trade), **fade** (always fade a live edge), **composer** (Jev-gated fade).

```bash
MODE=range TAPE=replay npm run range
MODE=range TAPE=kuru MODEL=jev npm run range
MODE=range TAPE=kuru REPLAY_FIXTURE=fixtures/kuru-mon-usdc-2026-09-17.json MODEL=jev npm run range
MODE=range TAPE=mock BLOCKS=48 npm run range
```

Replay and kuru only (plus mock). No live send. No `PRIVATE_KEY`. Still do not size.

The locked ugly-day chop is a few ticks wide, so the code sits (dead / expanded). Kuru 09-16 / 09-17 is the tape that produces fades. Sitting still beats fading those days.

## What is scored (not directional hit rate)

Four paper books on the same tape:

1. **grid** — always two-sided, no Jev, no inventory skew
2. **inventory** — grid + code inventory skew
3. **composer** — grid + Jev (or mock) compose/gates
4. **naive** — old forced buy/sell, one-sided; direction diagnostic is **non-overlapping** windows only

Fills only when a tape print trades through a rest by ≥1 tick (on-chain `Trade` logs or mock). No `inferPrints`. PnL marks bid-to-sell / ask-to-buy, minus fee + gas + 1–2 ticks + markout (always on; report ×2/×3).

## Venue spec (this market)

Observed 2026-09-17 via `getMarketParams` on `0x065C9d28E428A0db40191a54d33d5b7c71a9C394` (Monad 143):

- tick `100 / 1e8` = `$0.000001` / MON
- minSize **200 MON** (clip). maxSize 2e8 MON
- makerFeeBps **0**, takerFeeBps **0** (not the 30/10 deploy examples)
- native MON / USDC (6 dp)
- post-only that would match **reverts** (no snap-to-touch)
- Kuru JS `GTC.placeLimit` has **no clientOrderId**. Unsolved on the venue SDK. We persist `intentId + nonce` only. Not a cloid.
- **SOFT_PAUSED unread on live.** This JS ABI has `toggleMarkets(bool)`, no `marketState` view. Injected `SOFT_PAUSED` fail-closes in tests. Live poll sets **UNKNOWN** and fail-closes. It does **not** assume ACTIVE.
- **Backup: go flat and stop**

Gas: **not solved as a receipt.** Default `GAS_USD_PER_REPLACE=0.02` is **assumed-unknown-high**. Live may overwrite from `eth_gasPrice` × Kuru **heuristic** `210k+150k*n` × book mid — not this desk's tx. Stress ×2/×3. Replace cadence 8s / mid-threshold / PropMaintain, not every 1.2s.

Paper risk: `DAILY_LOSS_USD` (default 25) kills the paper book. `DEAD_MAN_MS` (default 5000) kills if the poll/heartbeat stalls. Single writer rejects overlapping apply.

Locked shadow books (`shadow grid` / `shadow composer`) store intended rests and compare later tape trade-throughs. They do not write the ledger. Jev is still skip/widen on the dumb grid.

Ugly-day: `fixtures/ugly-day.json` is a locked synthetic holdout (chop / trend / rpc hole / dead, ≥200 heads, decide every 8). Prints are explicit. Hole and dead invent none. Faster-than-live. Not a locked multi-day OOS parquet. The old 24-head / 1-decide skip is not this file.

## Live-readiness

Paper engine only. **False** for live send. No `PRIVATE_KEY`.

**True (paper):** integer ticks/lots, full persisted `getMarketParams`, double-entry ledger (cash/inventory/fees/gas/Jev$), order SM (persist-intent, confirmed|failed|unknown, idempotent txhash+logIndex+orderId, partials, post-only revert, crash-restart), trade-through ≥1 tick, inclusion delay, executable-side mark, fail-closed stale/empty/SOFT_PAUSED/**UNKNOWN**, daily loss, dead-man, single writer, locked shadow, Jev skip/widen only.

**Still false:** live send, withdraw-incapable key, venue `SOFT_PAUSED` **view**, measured gas receipts, clientOrderId, locked live OOS parquet. Live paper **will not quote** until a pause view exists.

Coverage = quoted slots / decision slots. Skip reasons are counted separately: `regime_low_conf`, `quote_ok`, `toxic`, `late`, `headline`, `dead`.

Calibration bins `regime.confidence` vs later mid move (chop/dead = small move). Accuracy is reported **only on the high-confidence slice**, plus a Wilson interval. Toxic noul is binned vs later adverse markout.

**Keep iterating** if the composer beats the dumb grid on **both** net2x and net3x after ≥8 locked-fixture decisions.

**Kill tape-Jev** if it does not. Sitting out one decide is not a holdout.

Locked Jev replay (224 heads, decide every 8, 28 decides, `TAPE=replay MODEL=jev`): `jev-1.13.0` net2x **-0.641** / net3x **-0.985** beat grid **-1.132** / **-1.749**. Both books are still red. High-conf regime **0/8**. That is skip-savings on a synthetic tape, not a live edge and not a claim of alpha. Keep iterating the skip/widen book; do not size.

## Confidence is a gate

`MIN_CONFIDENCE=0` was the old bug: confidence was a log field.

| Env | Default | What it gates |
| --- | --- | --- |
| `REGIME_MIN_CONFIDENCE` | `0.6` | Choice `regime.confidence`. Below this → **no quote**. Pulling is cheap (TypeSafe confidence-routing moderate floor). |
| `LEAN_MIN_CONFIDENCE` | `0.85` | Score `lean.confidence`. Lean ticks apply only at or above this. Leaning is expensive; higher floor. Level → ticks is a **table**, never `score * k`. |
| `QUOTE_OK_MIN` | `0.65` | Noul `quote_ok` yes-probability (Noul has no confidence). Near 0.5 or below min → skip. |
| `QUOTE_OK_UNCERTAIN_BAND` | `0.15` | Treat `quote_ok` in `0.5 ± band` as uncertain → skip. |
| `TOXIC_PULL` | `0.55` | Noul `toxic`. Pulling is cheap; act on a moderate yes-probability. |
| `HIGH_CONF_SLICE` | `0.85` | Calibration headline: accuracy only on this slice. |

Pinned model: `JEV_MODEL_ID=jev-1.13.0` (aliases move). Calls go through `@typesafe-ai/sdk` (429/5xx retries). Jev never does math.

## Verify

```bash
npm run typecheck
npm test
```

`npm test` covers ledger, order SM, pessimistic fills, fail-closed UNKNOWN, daily loss, dead-man, and the locked fixture (≥8 composer decisions). It does not send orders or read `.env` secrets.

This is not a live market-making bot and not a claim of alpha.
