import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = bytesToHex(randomBytes(16));
  const hash = (await scrypt(password, salt, KEYLEN)).toString("hex");
  return `s1:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = String(stored).split(":");
    const candidate = (await scrypt(password, salt, KEYLEN)).toString("hex");
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}
