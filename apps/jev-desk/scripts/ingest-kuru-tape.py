#!/usr/bin/env python3
"""Build a paper replay fixture from public Kuru L2 parquet + Monad Trade logs.

No wallet. Does not invent prints. Today's S3 parquet is unpublished until UTC day-roll;
use eth_call getL2Book for a bounded today slice.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq

RPC = os.environ.get("RPC_URL", "https://rpc.monad.xyz")
MARKET = os.environ.get("MARKET", "0x065C9d28E428A0db40191a54d33d5b7c71a9C394").lower()
TRADE_TOPIC = "0xf16924fba1c18c108912fcacaac7450c98eb3f2d8c0a3cdf3df7066c08f21581"
GETLOGS_MAX = 100
PRICE_SCALE = 10**10  # 1e18 -> 1e8
SEL_GET_L2_BOOK = "0x46fdfbb1"
ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"


def rpc(method: str, params: list | None = None, timeout: float = 30.0) -> dict:
    req = urllib.request.Request(
        RPC,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.load(resp)
    if body.get("error"):
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def get_logs(frm: int, to: int) -> list[dict]:
    for attempt in range(4):
        try:
            return rpc(
                "eth_getLogs",
                [
                    {
                        "address": MARKET,
                        "fromBlock": hex(frm),
                        "toBlock": hex(to),
                        "topics": [TRADE_TOPIC],
                    }
                ],
            ) or []
        except Exception:
            if attempt == 3:
                raise
            time.sleep(0.4 * (attempt + 1))
    return []


def decode_trade(log: dict) -> dict | None:
    hexdata = log["data"][2:] if log["data"].startswith("0x") else log["data"]
    if len(hexdata) < 512:
        return None

    def word(i: int) -> int:
        return int(hexdata[i * 64 : (i + 1) * 64], 16)

    price_raw = word(3)
    price = price_raw // PRICE_SCALE if price_raw >= 10**12 else price_raw
    return {
        "price": str(price),
        "size": str(word(7)),
        "takerBuy": word(2) == 0,
        "txhash": log.get("transactionHash") or f"missing-tx:{log['blockNumber']}:{log.get('logIndex', '0x0')}",
        "logIndex": int(log.get("logIndex", "0x0"), 16),
        "orderId": str(word(0)),
        "block": int(log["blockNumber"], 16),
    }


def fetch_prints(from_block: int, to_block: int, workers: int = 8) -> list[dict]:
    ranges = []
    start = from_block
    while start <= to_block:
        end = min(to_block, start + GETLOGS_MAX - 1)
        ranges.append((start, end))
        start = end + 1
    out: list[dict] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(get_logs, a, b): (a, b) for a, b in ranges}
        for fut in as_completed(futs):
            a, b = futs[fut]
            try:
                logs = fut.result()
            except Exception as e:
                print(f"getLogs {a}-{b} failed: {e}", file=sys.stderr)
                continue
            for log in logs:
                decoded = decode_trade(log)
                if decoded:
                    out.append(decoded)
    out.sort(key=lambda p: (p["block"], p["logIndex"]))
    return out


def desk_px(raw: str | int) -> int:
    n = int(raw)
    return n // PRICE_SCALE if n >= 10**12 else n


def heads_from_parquet(path: Path, ts_from: int, max_heads: int) -> list[dict]:
    table = pq.read_table(path, columns=["block_number", "timestamp", "bids", "asks"])
    events = []
    for i in range(table.num_rows):
        ts = table.column("timestamp")[i].as_py()
        if ts < ts_from:
            continue
        bids = table.column("bids")[i].as_py() or []
        asks = table.column("asks")[i].as_py() or []
        if not bids or not asks:
            continue
        bid = max(desk_px(lvl["price"]) for lvl in bids)
        ask = min(desk_px(lvl["price"]) for lvl in asks)
        if ask <= bid:
            continue
        bid_size = next(lvl["size"] for lvl in bids if desk_px(lvl["price"]) == bid)
        ask_size = next(lvl["size"] for lvl in asks if desk_px(lvl["price"]) == ask)
        events.append(
            {
                "type": "head",
                "block": table.column("block_number")[i].as_py(),
                "bid": str(bid),
                "ask": str(ask),
                "bidSize": str(bid_size),
                "askSize": str(ask_size),
                "prints": [],
            }
        )
        if len(events) >= max_heads:
            break
    return events


def attach_prints(heads: list[dict], prints: list[dict]) -> int:
    if not heads:
        return 0
    attached = 0
    hi = 0
    for p in prints:
        while hi + 1 < len(heads) and heads[hi]["block"] < p["block"]:
            hi += 1
        # pin to the first head at/after the print, else the last head
        idx = hi
        if heads[idx]["block"] < p["block"]:
            idx = len(heads) - 1
        row = {k: p[k] for k in ("price", "size", "takerBuy", "txhash", "logIndex", "orderId")}
        heads[idx]["prints"].append(row)
        attached += 1
    return attached


def decode_l2(abi_hex: str) -> tuple[int, list[tuple[int, int]], list[tuple[int, int]]] | None:
    h = abi_hex[2:] if abi_hex.startswith("0x") else abi_hex
    offset = int(h[0:64], 16) * 2
    length = int(h[offset : offset + 64], 16) * 2
    data = h[offset + 64 : offset + 64 + length]
    if len(data) < 64:
        return None
    block = int(data[0:64], 16)
    o = 64

    def side() -> list[tuple[int, int]]:
        nonlocal o
        out = []
        while o + 128 <= len(data):
            price = int(data[o : o + 64], 16)
            o += 64
            if price == 0:
                break
            size = int(data[o : o + 64], 16)
            o += 64
            out.append((price, size))
        return out

    return block, side(), side()


def heads_from_rpc(from_block: int, to_block: int, stride: int) -> list[dict]:
    blocks = list(range(from_block, to_block + 1, stride))
    events = []

    def one(b: int):
        hexres = rpc("eth_call", [{"to": MARKET, "data": SEL_GET_L2_BOOK}, hex(b)])
        return b, decode_l2(hexres)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(one, b) for b in blocks]
        decoded = []
        for fut in as_completed(futs):
            try:
                decoded.append(fut.result())
            except Exception as e:
                print(f"getL2Book failed: {e}", file=sys.stderr)
        decoded.sort(key=lambda x: x[0])
    for req_block, book in decoded:
        if not book:
            continue
        blk, bids, asks = book
        if not bids or not asks:
            continue
        bid = max(p for p, _ in bids)
        ask = min(p for p, _ in asks)
        if ask <= bid:
            continue
        bid_size = next(s for p, s in bids if p == bid)
        ask_size = next(s for p, s in asks if p == ask)
        events.append(
            {
                "type": "head",
                "block": blk or req_block,
                "bid": str(bid),
                "ask": str(ask),
                "bidSize": str(bid_size),
                "askSize": str(ask_size),
                "prints": [],
            }
        )
    events.sort(key=lambda e: e["block"])
    return events


def write_fixture(path: Path, note: str, heads: list[dict], extra: dict) -> None:
    payload = {
        "name": path.stem,
        "note": note,
        "market": MARKET,
        "events": heads,
        **extra,
    }
    path.write_text(json.dumps(payload) + "\n")
    prints = sum(len(h["prints"]) for h in heads)
    print(f"wrote {path} heads={len(heads)} prints={prints} blocks={heads[0]['block']}-{heads[-1]['block']}")


def main() -> int:
    if os.environ.get("SKIP_YESTERDAY") != "1":
        parquet = Path(os.environ.get("PARQUET", "/tmp/kuru-l2/0x065c9d28e428a0db40191a54d33d5b7c71a9c394_2026-09-16.parquet"))
        if not parquet.exists():
            print(f"missing parquet {parquet}", file=sys.stderr)
            return 1

        # PDT yesterday 12:00 = 2026-09-16 19:00 UTC
        ts_from = int(datetime(2026, 9, 16, 19, 0, tzinfo=timezone.utc).timestamp())
        max_heads = int(os.environ.get("MAX_HEADS", "4800"))
        print(f"reading parquet slice from {ts_from} max_heads={max_heads}")
        y_heads = heads_from_parquet(parquet, ts_from, max_heads)
        if len(y_heads) < 8:
            print("not enough parquet heads", file=sys.stderr)
            return 1
        y0, y1 = y_heads[0]["block"], y_heads[-1]["block"]
        print(f"yesterday heads {len(y_heads)} blocks {y0}-{y1}")
        y_prints = fetch_prints(y0, y1)
        print(f"yesterday prints {len(y_prints)}")
        attach_prints(y_heads, y_prints)
        write_fixture(
            FIXTURES / "kuru-mon-usdc-2026-09-16.json",
            "Venue-native Kuru L2 parquet (public S3) + on-chain Trade logs. PDT 16 Sep 2026 afternoon slice. Prints are eth_getLogs only; none invented.",
            y_heads,
            {
                "source": {
                    "quotes": "s3://kuru-l2-snapshots/market=0x065c9d28e428a0db40191a54d33d5b7c71a9c394/date=2026-09-16/l2_book_snapshots.parquet",
                    "prints": "eth_getLogs Trade(uint40,address,bool,uint256,uint96,address,address,uint96)",
                    "fromBlock": y0,
                    "toBlock": y1,
                    "fromTsUtc": datetime.fromtimestamp(ts_from, tz=timezone.utc).isoformat(),
                }
            },
        )

    if os.environ.get("SKIP_TODAY") == "1":
        return 0

    head = int(rpc("eth_blockNumber"), 16)
    # ~45 min at 400ms: 7000 blocks. Books every 8 blocks to stay bounded.
    today_span = int(os.environ.get("TODAY_BLOCKS", "4000"))
    stride = int(os.environ.get("TODAY_STRIDE", "8"))
    t0 = max(1, head - today_span)
    print(f"today RPC slice {t0}-{head} stride={stride}")
    t_heads = heads_from_rpc(t0, head, stride)
    t_prints = fetch_prints(t0, head)
    print(f"today heads {len(t_heads)} prints {len(t_prints)}")
    if t_heads:
        attach_prints(t_heads, t_prints)
        write_fixture(
            FIXTURES / "kuru-mon-usdc-2026-09-17.json",
            "Today PDT 17 Sep 2026 bounded slice. Quotes from historical eth_call getL2Book; prints from eth_getLogs. Today's S3 parquet was 403 (unpublished). No invented prints.",
            t_heads,
            {
                "source": {
                    "quotes": "eth_call getL2Book at historical blocks",
                    "prints": "eth_getLogs Trade(uint40,address,bool,uint256,uint96,address,address,uint96)",
                    "fromBlock": t0,
                    "toBlock": head,
                    "stride": stride,
                }
            },
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
