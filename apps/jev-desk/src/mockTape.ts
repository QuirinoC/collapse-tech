import { assembleBook, type Book } from "./book.js";
import { MOCK_SPEC } from "./spec.js";
import type { Print } from "./tape.js";

export { MOCK_SPEC };

export interface Snapshot {
  book: Book;
  prints: Print[];
}

/** Same instrument as live MON-USDC. Prints trade through by ≥1 tick when they fire. */
export function* mockTape(blocks: number, startBlock = 1_000_000): Generator<Snapshot> {
  const spec = MOCK_SPEC;
  let mid = 5_000_000n;
  let block = startBlock;
  const clip = spec.minSize;
  for (let i = 0; i < blocks; i++) {
    const phase = Math.floor(i / 16) % 4;
    let drift = 0n;
    let printBuy = false;
    let emitPrint = i % 3 === 0;
    if (phase === 0) {
      drift = BigInt(((i % 7) - 3) * 2) * spec.tickSize;
      printBuy = i % 2 === 0;
    } else if (phase === 1) {
      drift = 20n * spec.tickSize;
      printBuy = true;
      emitPrint = true;
    } else if (phase === 2) {
      drift = -20n * spec.tickSize;
      printBuy = false;
      emitPrint = true;
    } else {
      drift = 0n;
      emitPrint = false;
    }
    mid = mid + drift;
    if (mid < 1_000_000n) mid = 1_000_000n;
    const half = phase === 3 ? 40n * spec.tickSize : 8n * spec.tickSize;
    const bid = mid - half;
    const ask = mid + half;
    const bidHeavy = phase === 1;
    const bidSz = bidHeavy ? clip * 4n : clip;
    const askSz = phase === 2 ? clip * 4n : clip;
    const book = assembleBook(
      block,
      bid,
      ask,
      [[bid, bidSz]],
      [[ask, askSz]],
      spec,
      Date.now(),
    );
    const prints: Print[] = [];
    if (emitPrint) {
      prints.push({
        block,
        price: printBuy ? ask + spec.tickSize : bid - spec.tickSize,
        size: clip,
        takerBuy: printBuy,
        txhash: `0xmock${block.toString(16)}`,
        logIndex: 0,
        orderId: String(block),
      });
    }
    yield { book, prints };
    block++;
  }
}
