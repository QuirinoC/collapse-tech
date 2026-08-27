import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/lib/auth";
import { parseJsonBody, requestError } from "@/lib/request";
import { getStore } from "@/lib/repository";
import { createSession } from "@/lib/session";

export async function POST(request) {
  let payload;
  try {
    payload = loginSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  const store = getStore();
  const profile = await store.getProfileByEmail(payload.email);
  const ok =
    profile?.password_hash && (await verifyPassword(payload.password, profile.password_hash));
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(profile.id);
  const { password_hash, ...rest } = profile;
  return NextResponse.json({ profile: rest });
}
