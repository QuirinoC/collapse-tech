import { notional, type MarketSpec } from "./spec.js";
import type { Cash, Lots, Px, Usd } from "./money.js";

export type Account = "cash" | "inventory" | "fees" | "gas" | "jev" | "equity";

export interface Posting {
  account: Account;
  amount: bigint;
}

export interface JournalEntry {
  id: string;
  kind: "open" | "fill" | "fee" | "gas" | "jev";
  fillKey?: string;
  px?: Px;
  lots?: Lots;
  postings: Posting[];
  note: string;
}

export interface LedgerBalances {
  cash: Cash;
  inventory: Lots;
  fees: Cash;
  gas: Usd;
  jev: Usd;
  equity: bigint;
}

export interface SerializedLedger {
  seq: number;
  journal: JournalEntry[];
  fillKeys: string[];
}

export class Ledger {
  private seq = 0;
  private readonly journal: JournalEntry[] = [];
  private readonly seenFills = new Set<string>();
  cash = 0n;
  inventory = 0n;
  fees = 0n;
  gas = 0n;
  jev = 0n;
  equity = 0n;

  constructor(readonly spec: MarketSpec) {}

  balances(): LedgerBalances {
    return {
      cash: this.cash,
      inventory: this.inventory,
      fees: this.fees,
      gas: this.gas,
      jev: this.jev,
      equity: this.equity,
    };
  }

  serialize(): SerializedLedger {
    return { seq: this.seq, journal: this.journal.map((e) => ({ ...e, postings: e.postings.map((p) => ({ ...p })) })), fillKeys: [...this.seenFills] };
  }

  static restore(spec: MarketSpec, snap: SerializedLedger): Ledger {
    const led = new Ledger(spec);
    led.seq = snap.seq;
    for (const e of snap.journal) led.applyEntry(e, false);
    return led;
  }

  open(cash: Cash, note = "bankroll") {
    this.commit({
      id: this.nextId("open"),
      kind: "open",
      postings: [
        { account: "cash", amount: cash },
        { account: "equity", amount: -cash },
      ],
      note,
    });
  }

  /** Buy base (bid fill) or sell base (ask fill). Idempotent on fillKey. */
  fill(args: {
    fillKey: string;
    side: "bid" | "ask";
    price: Px;
    lots: Lots;
    feeBps: bigint;
  }): boolean {
    if (this.seenFills.has(args.fillKey)) return false;
    if (args.lots <= 0n) throw new Error("fill lots must be > 0");
    const cash = notional(args.price, args.lots, this.spec);
    const signedLots = args.side === "bid" ? args.lots : -args.lots;
    const signedCash = args.side === "bid" ? -cash : cash;
    this.commit({
      id: this.nextId("fill"),
      kind: "fill",
      fillKey: args.fillKey,
      px: args.price,
      lots: args.lots,
      postings: [
        { account: "inventory", amount: signedLots },
        { account: "cash", amount: signedCash },
      ],
      note: `${args.side} ${args.lots} @ ${args.price}`,
    });
    const fee = (cash * args.feeBps) / 10_000n;
    if (fee > 0n) {
      this.commit({
        id: this.nextId("fee"),
        kind: "fee",
        fillKey: args.fillKey,
        postings: [
          { account: "fees", amount: fee },
          { account: "cash", amount: -fee },
        ],
        note: `maker fee ${args.feeBps} bps`,
      });
    }
    this.seenFills.add(args.fillKey);
    return true;
  }

  chargeGas(usd: Usd, note = "replace") {
    if (usd === 0n) return;
    this.commit({
      id: this.nextId("gas"),
      kind: "gas",
      postings: [
        { account: "gas", amount: usd },
        { account: "equity", amount: -usd },
      ],
      note,
    });
  }

  chargeJev(usd: Usd, note = "jev tokens") {
    if (usd === 0n) return;
    this.commit({
      id: this.nextId("jev"),
      kind: "jev",
      postings: [
        { account: "jev", amount: usd },
        { account: "equity", amount: -usd },
      ],
      note,
    });
  }

  hasFill(fillKey: string): boolean {
    return this.seenFills.has(fillKey);
  }

  entries(): readonly JournalEntry[] {
    return this.journal;
  }

  /** Quote-side books: cash + fees === startCash + sell notionals - buy notionals. */
  quoteInvariant(startCash: Cash): { ok: boolean; expected: Cash; actual: Cash } {
    let expected = startCash;
    for (const e of this.journal) {
      if (e.kind === "fill") {
        const cashP = e.postings.find((p) => p.account === "cash");
        if (cashP) expected += cashP.amount;
      }
      if (e.kind === "fee") {
        const cashP = e.postings.find((p) => p.account === "cash");
        if (cashP) expected += cashP.amount;
      }
    }
    return { ok: expected === this.cash, expected, actual: this.cash };
  }

  inventoryFromFills(): Lots {
    let lots = 0n;
    for (const e of this.journal) {
      if (e.kind !== "fill") continue;
      const inv = e.postings.find((p) => p.account === "inventory");
      if (inv) lots += inv.amount;
    }
    return lots;
  }

  private nextId(kind: string): string {
    this.seq += 1;
    return `${kind}-${this.seq}`;
  }

  private commit(entry: JournalEntry) {
    this.assertBalanced(entry);
    this.applyEntry(entry, true);
  }

  private applyEntry(entry: JournalEntry, push: boolean) {
    for (const p of entry.postings) {
      switch (p.account) {
        case "cash":
          this.cash += p.amount;
          break;
        case "inventory":
          this.inventory += p.amount;
          break;
        case "fees":
          this.fees += p.amount;
          break;
        case "gas":
          this.gas += p.amount;
          break;
        case "jev":
          this.jev += p.amount;
          break;
        case "equity":
          this.equity += p.amount;
          break;
        default:
          throw new Error(`unknown account ${p.account}`);
      }
    }
    if (entry.fillKey) this.seenFills.add(entry.fillKey);
    if (push) this.journal.push(entry);
  }

  private assertBalanced(entry: JournalEntry) {
    if (entry.postings.length < 2) throw new Error(`entry ${entry.id} is not double-entry`);
    if (entry.kind === "fill") {
      const inv = entry.postings.find((p) => p.account === "inventory");
      const cash = entry.postings.find((p) => p.account === "cash");
      if (!inv || !cash || entry.px === undefined || entry.lots === undefined) {
        throw new Error(`entry ${entry.id} fill missing legs`);
      }
      const expect = notional(entry.px, entry.lots, this.spec);
      if (expect !== (cash.amount < 0n ? -cash.amount : cash.amount)) {
        throw new Error(`entry ${entry.id} cash ${cash.amount} != notional ${expect}`);
      }
      if (entry.lots !== (inv.amount < 0n ? -inv.amount : inv.amount)) {
        throw new Error(`entry ${entry.id} lots mismatch`);
      }
      if ((inv.amount > 0n) === (cash.amount > 0n)) {
        throw new Error(`entry ${entry.id} inventory and cash must have opposite signs`);
      }
      return;
    }
    const sum = entry.postings.reduce((s, p) => s + p.amount, 0n);
    if (sum !== 0n) throw new Error(`entry ${entry.id} unbalanced ${sum}`);
  }
}
