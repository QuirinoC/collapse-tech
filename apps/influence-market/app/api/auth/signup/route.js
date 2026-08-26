import { NextResponse } from "next/server";
import { signupSchema, firstIssue } from "@/lib/schemas";
import { hashPassword } from "@/lib/auth";
import { getStore } from "@/lib/repository";
import { createSession } from "@/lib/session";

function publicProfile(profile) {
  if (!profile) return null;
  const { password_hash, ...rest } = profile;
  return rest;
}

export async function POST(request) {
  let payload;
  try {
    payload = signupSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
  }

  const store = getStore();
  const existing = await store.getProfileByEmail(payload.email);

  // Claiming a seeded demo roster profile (no password yet) keeps its history.
  if (existing && existing.password_hash) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(payload.password);
  const profile = existing
    ? await store.updateProfile(existing.id, {
        name: payload.name,
        company: payload.company ?? null,
        passwordHashClaim: undefined,
        ...patchHash(passwordHash),
      })
    : await store.createProfile({
        role: payload.role,
        email: payload.email.toLowerCase(),
        name: payload.name,
        company: payload.company ?? null,
        bio: null,
        niches: [],
        channels: [],
        minBudgetCents: null,
        ...patchHash(passwordHash),
      });

  await createSession(profile.id);
  return NextResponse.json({ profile: publicProfile(profile) });
}

// updateProfile passes unknown keys through in the memory store; the Supabase
// store maps the canonical `password_hash` column explicitly.
function patchHash(passwordHash) {
  return { password_hash: passwordHash };
}
