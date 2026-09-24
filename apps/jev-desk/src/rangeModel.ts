import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { config } from "./config.js";
import type { TapeStats } from "./tape.js";

export type RangeRead = "nothing_burger" | "range_breaker";

export interface RangeState {
  tape_summary: {
    flow: TapeStats["flow"];
    last_side: TapeStats["lastSide"];
    cvd_agrees_with_last_move: string;
    activity: string;
  };
  headline?: string;
}

export interface RangeJudgment {
  name: string;
  read: { choice: RangeRead; confidence: number; probabilities: Record<RangeRead, number> };
  latencyMs: number;
  inputTokens: number;
}

export interface RangeModel {
  readonly name: string;
  decide(state: RangeState): Promise<RangeJudgment>;
}

const RANGE_CRITERIA = {
  nothing_burger: {
    what: "Quiet, two-sided, or ordinary mixed tape with no material headline. Nothing here reads as a break of a recent habit.",
    not_for: "Informed one-way flow, a dead tape, or a material announcement.",
    examples: [
      "`tape_summary.flow` is mixed and `tape_summary.activity` is active prints",
      "no headline, or chatter that would not move this book",
    ],
  },
  range_breaker: {
    what: "The tape or headline reads like a recent high/low habit should not be faded: one-way flow, a dead book, or a material announcement.",
    not_for: "Ordinary two-sided chop.",
    examples: [
      "`tape_summary.flow` is one-way buying or one-way selling",
      "`tape_summary.flow` is dead",
      "`headline` is a material market-moving announcement",
    ],
  },
};

export function rangeQuestions(hasHeadline: boolean) {
  return {
    range_read: choice(
      {
        question: hasHeadline
          ? "Given `tape_summary` and `headline`, is this a quiet nothing-burger or a range-breaker?"
          : "Given `tape_summary`, is this a quiet nothing-burger or a range-breaker?",
        inspect: hasHeadline ? ["`tape_summary`", "`headline`"] : ["`tape_summary`"],
        focus:
          "Semantic tape read only. Do not estimate a price or forecast the mid. Nothing-burger means two-sided, uneventful tape. Range-breaker means informed one-way flow, a dead tape, or a material headline.",
      },
      RANGE_CRITERIA,
    ),
  };
}

export function buildRangeState(tape: TapeStats, headline?: string): RangeState {
  const state: RangeState = {
    tape_summary: {
      flow: tape.flow,
      last_side: tape.lastSide,
      cvd_agrees_with_last_move: tape.cvdAgreesWithLastMove
        ? "yes, cumulative volume agrees with the last mid move"
        : "no, cumulative volume does not agree with the last mid move",
      activity: tape.activity,
    },
  };
  if (headline) state.headline = headline;
  return state;
}

function emptyReadProbs(winner: RangeRead, conf: number): Record<RangeRead, number> {
  const rest = 1 - conf;
  return {
    nothing_burger: winner === "nothing_burger" ? conf : rest,
    range_breaker: winner === "range_breaker" ? conf : rest,
  };
}

export class MockRangeModel implements RangeModel {
  readonly name = "mock";

  async decide(state: RangeState): Promise<RangeJudgment> {
    const t0 = performance.now();
    const flow = state.tape_summary.flow;
    let choice: RangeRead = "nothing_burger";
    let conf = 0.86;
    if (state.headline) {
      choice = "range_breaker";
      conf = 0.92;
    } else if (flow === "dead" || flow.startsWith("one-way")) {
      choice = "range_breaker";
      conf = 0.88;
    } else if (state.tape_summary.activity === "sparse prints") {
      choice = "nothing_burger";
      conf = 0.45;
    }
    await new Promise((r) => setTimeout(r, 5));
    return {
      name: this.name,
      read: { choice, confidence: conf, probabilities: emptyReadProbs(choice, conf) },
      latencyMs: performance.now() - t0,
      inputTokens: Math.round(JSON.stringify(state).length / 4),
    };
  }
}

export class JevRangeModel implements RangeModel {
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

  async decide(state: RangeState): Promise<RangeJudgment> {
    const t0 = performance.now();
    const response = await this.client.systemOne({
      model: config.jevModelId,
      state: state as unknown as import("@typesafe-ai/sdk").EntryType,
      questions: rangeQuestions(Boolean(state.headline)),
    });
    const a = response.answers.range_read;
    const picked: RangeRead = a.choice === "range_breaker" ? "range_breaker" : "nothing_burger";
    return {
      name: this.name,
      read: {
        choice: picked,
        confidence: a.confidence,
        probabilities: {
          nothing_burger: a.probabilities.nothing_burger ?? (picked === "nothing_burger" ? 1 : 0),
          range_breaker: a.probabilities.range_breaker ?? (picked === "range_breaker" ? 1 : 0),
        },
      },
      latencyMs: performance.now() - t0,
      inputTokens: response.usage.input_tokens,
    };
  }
}

export function rangeComposerModel(): RangeModel {
  if (config.model === "jev") {
    if (!config.jevApiKey) throw new Error("Set TYPESAFE_API_KEY or drop MODEL=jev");
    return new JevRangeModel();
  }
  return new MockRangeModel();
}
