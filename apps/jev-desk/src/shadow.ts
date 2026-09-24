import type { Book } from "./book.js";
import { fillKey, type Print } from "./tape.js";
import { tradesThrough } from "./paper.js";
import type { Lots, Px } from "./money.js";
import type { Side } from "./orders.js";
import type { MarketSpec } from "./spec.js";

export interface ShadowQuote {
  id: string;
  block: number;
  side: Side;
  price: Px;
  size: Lots;
  mid: Px;
  closeBlock?: number;
}

export interface ShadowHit {
  quote: ShadowQuote;
  print: Print;
}

export interface ShadowSnapshot {
  name: string;
  intended: number;
  open: number;
  throughHits: number;
  sides: { bid: number; ask: number };
}

/** Locked intended quotes vs later tape. Does not post the paper ledger. */
export class ShadowBook {
  readonly quotes: ShadowQuote[] = [];
  readonly hits: ShadowHit[] = [];
  private seq = 0;
  private readonly seen = new Set<string>();

  constructor(readonly name: string) {}

  lockFromRest(book: Book, bid?: { price: Px; size: Lots }, ask?: { price: Px; size: Lots }) {
    this.lockSide("bid", book, bid);
    this.lockSide("ask", book, ask);
  }

  closeAll(block: number) {
    for (const q of this.quotes) {
      if (q.closeBlock === undefined) q.closeBlock = block;
    }
  }

  onPrints(prints: Print[], spec: MarketSpec) {
    for (const q of this.quotes) {
      for (const p of prints) {
        if (p.block < q.block) continue;
        if (q.closeBlock !== undefined && p.block > q.closeBlock) continue;
        if (!tradesThrough(q.side, q.price, p, spec)) continue;
        const key = `${q.id}:${fillKey(p)}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.hits.push({ quote: q, print: p });
      }
    }
  }

  snapshot(): ShadowSnapshot {
    return {
      name: this.name,
      intended: this.quotes.length,
      open: this.quotes.filter((q) => q.closeBlock === undefined).length,
      throughHits: this.hits.length,
      sides: {
        bid: this.quotes.filter((q) => q.side === "bid").length,
        ask: this.quotes.filter((q) => q.side === "ask").length,
      },
    };
  }

  private lockSide(side: Side, book: Book, rest?: { price: Px; size: Lots }) {
    const open = this.quotes.find((q) => q.side === side && q.closeBlock === undefined);
    if (!rest) {
      if (open) open.closeBlock = book.block;
      return;
    }
    if (open && open.price === rest.price && open.size === rest.size) return;
    if (open) open.closeBlock = book.block;
    this.seq += 1;
    this.quotes.push({
      id: `${this.name}-${this.seq}`,
      block: book.block,
      side,
      price: rest.price,
      size: rest.size,
      mid: book.mid,
    });
  }
}

export function formatShadow(s: ShadowSnapshot): string {
  return `shadow ${s.name}: intended=${s.intended} open=${s.open} throughHits=${s.throughHits} bidLocks=${s.sides.bid} askLocks=${s.sides.ask}`;
}

export function shadowFromBook(book: Book, bid?: { price: Px; size: Lots }, ask?: { price: Px; size: Lots }): ShadowQuote[] {
  const tmp = new ShadowBook("tmp");
  tmp.lockFromRest(book, bid, ask);
  return tmp.quotes;
}

export function shadowVsTape(quotes: ShadowQuote[], prints: Print[], spec: MarketSpec): ShadowHit[] {
  const book = new ShadowBook("cmp");
  book.quotes.push(...quotes);
  book.onPrints(prints, spec);
  return book.hits;
}
