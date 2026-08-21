import { createHash, timingSafeEqual } from "node:crypto";

export function requestFingerprint(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "unknown";
  const address = forwarded.split(",")[0].trim();
  const salt = process.env.REQUEST_HASH_SALT;
  if (!salt) throw new Error("REQUEST_HASH_SALT is not configured.");
  return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

export function assertProviderConfiguration() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_API_KEY",
    "SEARCHAPI_API_KEY",
    "REQUEST_HASH_SALT",
  ];
  const missing = required.filter((key) => !process.env[key]);
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
