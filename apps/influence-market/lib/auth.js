import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEYLEN = 64;

// PBKDF2 via WebCrypto — identical output on Node and Cloudflare workerd.
async function pbkdf2(password, salt, iterations = 210000) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(salt), iterations, hash: "SHA-256" },
    key,
    KEYLEN * 8,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = bytesToHex(randomBytes(16));
  const hash =
    process.env.NODE_ENV === "test_no_node"
      ? await pbkdf2(password, salt)
      : (await scrypt(password, salt, KEYLEN)).toString("hex");
  return `s1:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = String(stored).split(":");
    const candidate =
      process.env.NODE_ENV === "test_no_node"
        ? await pbkdf2(password, salt)
        : (await scrypt(password, salt, KEYLEN)).toString("hex");
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}
