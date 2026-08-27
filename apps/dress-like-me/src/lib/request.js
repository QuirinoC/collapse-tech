import { createHash, timingSafeEqual } from "node:crypto";

const REQUIRED_IMPORT_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_API_KEY",
  "SEARCHAPI_API_KEY",
  "REQUEST_HASH_SALT",
];

export function requestFingerprint(request) {
  const address = request.headers.get("cf-connecting-ip")?.trim();
  if (!address) {
    throw new Error("Request origin is unavailable.");
  }
  const salt = process.env.REQUEST_HASH_SALT;
  if (!salt) throw new Error("REQUEST_HASH_SALT is not configured.");
  return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

export function hasImportConfiguration() {
  return REQUIRED_IMPORT_ENVIRONMENT.every((key) => process.env[key]);
}

export function assertProviderConfiguration() {
  const missing = REQUIRED_IMPORT_ENVIRONMENT.filter(
    (key) => !process.env[key],
  );
  if (missing.length) {
    throw new Error(`Import service is not configured: ${missing.join(", ")}`);
  }
}

export function assertAdmin(request) {
  const configured = process.env.ADMIN_API_TOKEN;
  const provided = request.headers.get("authorization");
  const expected = `Bearer ${configured || ""}`;
  const valid =
    configured &&
    provided &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) {
    throw new Error("Unauthorized");
  }
}
