import { cookies } from "next/headers";
import { getStore } from "./repository.js";

export const SESSION_COOKIE = "im_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export async function createSession(profileId) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await getStore().createSession({ token, profile_id: profileId, expires_at });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires_at),
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await getStore().deleteSession(token);
    jar.delete(SESSION_COOKIE);
  }
}

export async function currentProfile() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getStore().getSession(token);
  if (!session || new Date(session.expires_at) < new Date()) return null;
  return getStore().getProfile(session.profile_id);
}

export async function requireRole(role, roles = [role]) {
  const profile = await currentProfile();
  if (!profile || !roles.includes(profile.role)) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  return profile;
}
