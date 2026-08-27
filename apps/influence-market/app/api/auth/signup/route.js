import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/schemas";
import { hashPassword } from "@/lib/auth";
import { parseJsonBody, requestError } from "@/lib/request";
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
    payload = signupSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
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
  if (existing && existing.role !== payload.role) {
    return NextResponse.json(
      { error: `This reserved profile must be claimed as a ${existing.role}.` },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(payload.password);
  let profile;
  try {
    profile = existing
      ? await store.claimProfile(existing.id, {
        name: payload.name,
        company: payload.company ?? null,
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
  } catch (error) {
    if (error?.code === "23505" || /unique constraint/i.test(error?.message)) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }
    throw error;
  }
  if (!profile) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  await createSession(profile.id);
  return NextResponse.json({ profile: publicProfile(profile) });
}

// updateProfile passes unknown keys through in the memory store; the Supabase
// store maps the canonical `password_hash` column explicitly.
function patchHash(passwordHash) {
  return { password_hash: passwordHash };
}
