/**
 * One-off live smoke: Balatro-like state → System One Choice (jev-1.13.0).
 * Loads TYPESAFE_API_KEY from env / .env — never prints the key.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { choice, TypeSafeClient, APIError } from "@typesafe-ai/sdk";

function loadDotEnv(): void {
  if (process.env.TYPESAFE_API_KEY?.trim()) return;
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = join(root, ".env");
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env optional if key already in environment
  }
}

loadDotEnv();

const keySet = Boolean(process.env.TYPESAFE_API_KEY?.trim());
if (!keySet) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "TYPESAFE_API_KEY is not set (checked env and apps/balatro-jev/.env)",
    }),
  );
  process.exit(1);
}

const state = {
  game: "balatro",
  ante: 1,
  blind: "Small Blind",
  chips_needed: 300,
  chips_scored: 0,
  hands_left: 4,
  discards_left: 3,
  hand: [
    { rank: "A", suit: "Hearts" },
    { rank: "K", suit: "Hearts" },
    { rank: "Q", suit: "Hearts" },
    { rank: "J", suit: "Clubs" },
    { rank: "10", suit: "Diamonds" },
    { rank: "5", suit: "Spades" },
    { rank: "2", suit: "Clubs" },
  ],
  jokers: [],
  legal_actions: [
    "play_royal_flush_draw",
    "play_high_card_AK",
    "discard_low_cards",
    "play_straight_draw",
  ],
};

const client = new TypeSafeClient({
  defaultModel: "jev-1.13.0",
  timeout: 60_000,
  logLevel: "warn",
});

const t0 = performance.now();
try {
  const { data, response, requestId } = await client
    .systemOne({
      model: "jev-1.13.0",
      state,
      questions: {
        action: choice(
          "Pick the single best legal action for this Balatro hand to clear the blind.",
          {
            play_royal_flush_draw:
              "Keep A-K-Q hearts and chase royal/flush; discard J clubs, 10 diamonds, 5 spades, 2 clubs.",
            play_high_card_AK:
              "Play Ace and King of hearts as a high-card / pair attempt now.",
            discard_low_cards:
              "Discard 5 of spades and 2 of clubs to improve the hand.",
            play_straight_draw:
              "Play toward a straight using 10-J-Q-K-A mixed suits.",
          },
        ),
      },
    })
    .withResponse();

  const latency_ms = Math.round(performance.now() - t0);
  const answer = data.answers.action;

  console.log(
    JSON.stringify(
      {
        ok: true,
        http_status: response.status,
        request_id: requestId ?? null,
        model: data.model,
        chosen_action: answer.choice,
        confidence: answer.confidence,
        probabilities: answer.probabilities,
        latency_ms,
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      },
      null,
      2,
    ),
  );
} catch (err) {
  const latency_ms = Math.round(performance.now() - t0);
  if (err instanceof APIError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          http_status: err.status,
          request_id: err.requestId ?? null,
          latency_ms,
          error_body: err.body,
          message: err.message.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]"),
        },
        null,
        2,
      ),
    );
  } else {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify(
        {
          ok: false,
          latency_ms,
          error: message.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]"),
        },
        null,
        2,
      ),
    );
  }
  process.exit(1);
}
