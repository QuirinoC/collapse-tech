const STORAGE_KEY = "pixelboard.pendingReferralCode";
export const BOARD_ORIGIN = "https://pixelboard.collapsetechnologies.com";
const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeReferralCode(value) {
  const cleaned = String(value ?? "").toUpperCase().replace(/[-\s]/g, "");
  return ALPHABET.test(cleaned) ? cleaned : null;
}

export function capturePendingReferral(search, storage) {
  const incoming = normalizeReferralCode(new URLSearchParams(search).get("ref"));
  try {
    if (incoming) storage.setItem(STORAGE_KEY, incoming);
    return storage.getItem(STORAGE_KEY);
  } catch {
    return incoming;
  }
}

export function peekPendingReferral(storage) {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingReferral(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode.
  }
}

export function inviteUrl(code) {
  return `${BOARD_ORIGIN}/?ref=${encodeURIComponent(code)}`;
}

export function positionUrl(row, column) {
  return `${BOARD_ORIGIN}/?row=${row}&col=${column}`;
}

export function parseBoardPosition(search) {
  const params = new URLSearchParams(search);
  const row = parseStrictInteger(params.get("row") ?? params.get("r"));
  const column = parseStrictInteger(params.get("col") ?? params.get("c"));
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column)) return null;
  return { row, column };
}

function parseStrictInteger(value) {
  if (value === null || value.trim() === "") return NaN;
  if (!/^[+-]?\d+$/.test(value.trim())) return NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}
