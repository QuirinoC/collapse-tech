import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { config } from "./config.js";
import type { SemanticState } from "./buckets.js";

export type Regime = "trend_up" | "trend_down" | "chop" | "dead";
export type LeanLevel = 0 | 1 | 2 | 3 | 4;

export interface NaiveDirection {
  action: "buy" | "sell";
  confidence: number;
  probabilities: { buy: number; sell: number };
}

export interface Judgments {
  name: string;
  regime: { choice: Regime; confidence: number; probabilities: Record<Regime, number> };
  quoteOk: number;
  toxic: number;
  lean: { level: LeanLevel; score: number; confidence: number };
  materialHeadline: number;
  naive: NaiveDirection;
  latencyMs: number;
  inputTokens: number;
}

export interface Model {
  readonly name: string;
  decide(state: SemanticState): Promise<Judgments>;
}

export const COMPOSER_QUESTIONS = {
  regime: choice(
    {
      question: "What is the current market regime given `book_shape` and `tape_summary`?",
      inspect: ["`book_shape`", "`tape_summary`", "`clock`"],
      focus: "A snap read a knowledgeable tape reader would make in a second. Chop and dead are first-class, not leftovers.",
    },
    {
      trend_up: {
        what: "Price is being bid up in a one-way move that reads as an uptrend, not a single print.",
        not_for: "Two-sided chop, a dead book, or a downtrend.",
        examples: ["`tape_summary.flow` is one-way buying and `book_shape.pressure` is bid-heavy"],
      },
      trend_down: {
        what: "Price is being offered down in a one-way move that reads as a downtrend.",
        not_for: "Two-sided chop, a dead book, or an uptrend.",
        examples: ["`tape_summary.flow` is one-way selling and `book_shape.pressure` is ask-heavy"],
      },
      chop: {
        what: "Two-sided, mean-reverting, or mixed flow with no durable direction.",
        not_for: "A clear one-way trend or a dead market.",
        examples: ["`tape_summary.flow` is mixed and `book_shape.pressure` is balanced"],
      },
      dead: {
        what: "Almost no tape and nothing a maker would lean on.",
        not_for: "Active mixed trading or a trend.",
        examples: ["`tape_summary.flow` is dead"],
      },
    },
  ),
  quote_ok: noul(
    {
      question: "Is it reasonable to rest two-sided post-only quotes given `book_shape` and `tape_summary`?",
      inspect: ["`book_shape`", "`tape_summary`"],
      focus: "Yes means the book is tradeable and the tape is not obviously about to pick off a resting quote.",
    },
    {
      true: {
        what: "A two-sided maker can reasonably rest quotes here.",
        examples: ["`book_shape.spread` is tight or normal and `tape_summary.flow` is mixed"],
      },
      false: {
        what: "Do not rest two-sided quotes.",
        not_for: "Ordinary chop that is still two-sided and tradeable.",
        examples: ["`tape_summary.flow` is dead", "`book_shape.spread` is wide"],
      },
    },
  ),
  toxic: noul(
    {
      question: "Does `tape_summary` look like informed one-way flow that will pick off a resting quote?",
      inspect: ["`tape_summary`", "`book_shape`"],
      focus: "Judge toxicity of the tape, not whether the mid will be higher later.",
    },
    {
      true: {
        what: "Informed one-way flow that is likely to run over a resting maker.",
        examples: ["`tape_summary.flow` is one-way selling and `tape_summary.cvd_agrees_with_last_move` agrees"],
      },
      false: {
        what: "Tape does not look like informed pick-off flow.",
        examples: ["`tape_summary.flow` is mixed or dead"],
      },
    },
  ),
  lean: score(
    {
      question: "How should a two-sided maker lean given `book_shape`, `tape_summary`, and `inventory`?",
      inspect: ["`book_shape`", "`tape_summary`", "`inventory`"],
      focus: "Pick the situation that matches. Do not invent a magnitude.",
    },
    [
      {
        what: "Strong bid lean — rest a more aggressive bid and a defensive ask",
        examples: ["`tape_summary.flow` is one-way buying and `inventory.side` is flat or short"],
      },
      {
        what: "Mild bid lean — slightly favor the bid",
        examples: ["`book_shape.pressure` is bid-heavy without one-way selling"],
      },
      {
        what: "No lean — keep a balanced two-sided quote",
        examples: ["`tape_summary.flow` is mixed or chop and `inventory.side` is flat"],
      },
      {
        what: "Mild ask lean — slightly favor the ask",
        examples: ["`book_shape.pressure` is ask-heavy without one-way buying"],
      },
      {
        what: "Strong ask lean — rest a more aggressive ask and a defensive bid",
        examples: ["`tape_summary.flow` is one-way selling and `inventory.side` is flat or long"],
      },
    ],
  ),
  direction: choice(
    {
      question: "After the horizon in `clock.horizon`, will `naive.mid` be higher or lower than it is now?",
      inspect: ["`naive`", "`clock`"],
      focus: "Control only. Forced buy or sell. This is the old doomed question.",
    },
    {
      buy: {
        what: "Current `naive.mid` is more likely higher after the horizon.",
        not_for: "A lower mid.",
      },
      sell: {
        what: "Current `naive.mid` is more likely lower after the horizon.",
        not_for: "A higher mid.",
      },
    },
  ),
};

const HEADLINE_QUESTION = noul(
  {
    question: "Is `headline` a material market-moving announcement for this book?",
    inspect: ["`headline`"],
    focus: "Speculative. Yes only if the headline would make a knowledgeable person pull or widen quotes.",
  },
  {
    true: { what: "Material announcement that should change quoting." },
    false: { what: "Not material, or no real headline." },
  },
);

function emptyRegimeProbs(winner: Regime, conf: number): Record<Regime, number> {
  const rest = (1 - conf) / 3;
  return {
    trend_up: winner === "trend_up" ? conf : rest,
    trend_down: winner === "trend_down" ? conf : rest,
    chop: winner === "chop" ? conf : rest,
    dead: winner === "dead" ? conf : rest,
  };
}

export function nearestLeanLevel(rawScore: number): LeanLevel {
  return Math.max(0, Math.min(4, Math.round(rawScore))) as LeanLevel;
}

export class MockModel implements Model {
  readonly name = "mock";

  async decide(state: SemanticState): Promise<Judgments> {
    const t0 = performance.now();
    const flow = state.tape_summary.flow;
    const pressure = state.book_shape.pressure;
    let regime: Regime = "chop";
    let regimeConf = 0.55;
    if (flow === "dead") {
      regime = "dead";
      regimeConf = 0.9;
    } else if (flow === "one-way buying" && pressure !== "ask-heavy") {
      regime = "trend_up";
      regimeConf = 0.88;
    } else if (flow === "one-way selling" && pressure !== "bid-heavy") {
      regime = "trend_down";
      regimeConf = 0.88;
    } else if (flow === "mixed") {
      regime = "chop";
      regimeConf = 0.8;
    }

    const quoteOk =
      state.book_shape.spread === "wide" || flow === "dead" ? 0.2 : flow.startsWith("one-way") ? 0.45 : 0.82;
    const toxic = flow.startsWith("one-way") && state.tape_summary.cvd_agrees_with_last_move.startsWith("yes") ? 0.78 : 0.2;

    let leanLevel: LeanLevel = 2;
    if (state.inventory.side === "long") leanLevel = 3;
    else if (state.inventory.side === "short") leanLevel = 1;
    if (flow === "one-way buying") leanLevel = 0;
    if (flow === "one-way selling") leanLevel = 4;
    const leanConf = flow === "mixed" || flow === "dead" ? 0.6 : 0.9;

    const buySignal = state.naive.returnsBps.last20 / 8 + state.naive.bookImbalance * 1.5;
    const buy = 1 / (1 + Math.exp(-buySignal));
    await new Promise((r) => setTimeout(r, 5));

    return {
      name: this.name,
      regime: { choice: regime, confidence: regimeConf, probabilities: emptyRegimeProbs(regime, regimeConf) },
      quoteOk,
      toxic,
      lean: { level: leanLevel, score: leanLevel, confidence: leanConf },
      materialHeadline: state.headline ? 0.1 : 0,
      naive: { action: buy >= 0.5 ? "buy" : "sell", confidence: Math.max(buy, 1 - buy), probabilities: { buy, sell: 1 - buy } },
      latencyMs: performance.now() - t0,
      inputTokens: Math.round(JSON.stringify(state).length / 4),
    };
  }
}

export class JevModel implements Model {
  readonly name = config.jevModelId;
  private client: TypeSafeClient;

  constructor() {
    if (!config.jevApiKey) throw new Error("TYPESAFE_API_KEY is required for Jev");
    this.client = new TypeSafeClient({
      apiKey: config.jevApiKey,
      defaultModel: config.jevModelId,
      timeout: Math.max(config.blockBudgetMs + 400, 4000),
    });
  }

  async decide(state: SemanticState): Promise<Judgments> {
    const t0 = performance.now();
    const questions = state.headline
      ? { ...COMPOSER_QUESTIONS, material_headline: HEADLINE_QUESTION }
      : COMPOSER_QUESTIONS;
    const response = await this.client.systemOne({
      model: config.jevModelId,
      state: state as unknown as import("@typesafe-ai/sdk").EntryType,
      questions,
    });
    const a = response.answers;
    const regimeChoice = a.regime.choice as Regime;
    const leanScore = a.lean.score;
    const dirBuy = a.direction.probabilities.buy ?? (a.direction.choice === "buy" ? 1 : 0);
    const dirSell = a.direction.probabilities.sell ?? 1 - dirBuy;
    const headlineNoul =
      "material_headline" in a ? (a as { material_headline: { noul: number } }).material_headline.noul : 0;
    return {
      name: this.name,
      regime: {
        choice: regimeChoice,
        confidence: a.regime.confidence,
        probabilities: {
          trend_up: a.regime.probabilities.trend_up ?? 0,
          trend_down: a.regime.probabilities.trend_down ?? 0,
          chop: a.regime.probabilities.chop ?? 0,
          dead: a.regime.probabilities.dead ?? 0,
        },
      },
      quoteOk: a.quote_ok.noul,
      toxic: a.toxic.noul,
      lean: { level: nearestLeanLevel(leanScore), score: leanScore, confidence: a.lean.confidence },
      materialHeadline: headlineNoul,
      naive: {
        action: a.direction.choice === "sell" ? "sell" : "buy",
        confidence: a.direction.confidence,
        probabilities: { buy: dirBuy, sell: dirSell },
      },
      latencyMs: performance.now() - t0,
      inputTokens: response.usage.input_tokens,
    };
  }
}
