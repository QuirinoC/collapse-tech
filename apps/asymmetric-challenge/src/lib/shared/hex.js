export function normalizeHex(hex) {
  return (hex || "").trim().toLowerCase();
}

export function isHexString(hex, length) {
  if (typeof hex !== "string") return false;
  if (length && hex.length !== length) return false;
  return /^[0-9a-f]+$/.test(hex);
}

export function hexToBytes(hex) {
  const normalized = normalizeHex(hex);
  if (normalized.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
