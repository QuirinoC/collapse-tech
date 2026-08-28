import { guessMatchesSecret } from "./secret.js";

export async function evaluateClaim({ guessHex, alreadyWon }) {
  if (alreadyWon) {
    return "already_won";
  }
  return (await guessMatchesSecret(guessHex)) ? "won" : "nope";
}
