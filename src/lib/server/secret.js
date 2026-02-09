import crypto from "node:crypto";
import { isHexString, normalizeHex } from "../shared/hex.js";

export function getSecretHex() {
  const raw = process.env.SECRET_KEY_HEX;
  if (!raw) {
    throw new Error("SECRET_KEY_HEX is required");
  }
  const normalized = normalizeHex(raw);
  if (!isHexString(normalized, 64)) {
    throw new Error("SECRET_KEY_HEX must be 64 hex characters");
  }
  return normalized;
}

export function getCommitmentHash() {
  const secretHex = getSecretHex();
  const secretBytes = Buffer.from(secretHex, "hex");
  return crypto.createHash("sha256").update(secretBytes).digest("hex");
}

export function getChallengeId() {
  const hash = getCommitmentHash();
  return hash.slice(0, 12).toUpperCase();
}

export function guessMatchesSecret(guessHex) {
  const secretHex = getSecretHex();
  const normalizedGuess = normalizeHex(guessHex);
  if (!isHexString(normalizedGuess, 64)) {
    return false;
  }
  const secretBuffer = Buffer.from(secretHex, "hex");
  const guessBuffer = Buffer.from(normalizedGuess, "hex");
  if (secretBuffer.length !== guessBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(secretBuffer, guessBuffer);
}
