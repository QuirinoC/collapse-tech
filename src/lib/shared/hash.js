import { bytesToHex, hexToBytes } from "./hex.js";

function getWebCrypto() {
  if (globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API not available");
}

export async function sha256Bytes(bytes) {
  const crypto = getWebCrypto();
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hashBuffer);
}

export async function sha256Hex(hex) {
  const bytes = hexToBytes(hex);
  const hashed = await sha256Bytes(bytes);
  return bytesToHex(hashed);
}
