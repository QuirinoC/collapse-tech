import { guessMatchesSecret } from "./secret.js";

export function evaluateClaim({ guessHex, alreadyWon }) {
  if (alreadyWon) {
    return "already_won";
  }
  return guessMatchesSecret(guessHex) ? "won" : "nope";
}
