import { NextResponse } from "next/server";
import { profileSchema } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { parseJsonBody, requestError } from "@/lib/request";

// Creators curate their public listing: bio, niches, channels, minimum budget.
export async function PUT(request) {
  let payload;
  try {
    payload = profileSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  let creator;
  try {
    creator = await requireRole("creator");
  } catch {
    return NextResponse.json({ error: "Creator account required." }, { status: 401 });
  }

  const updated = await getStore().updateProfile(creator.id, {
    ...(payload.bio !== undefined ? { bio: payload.bio } : {}),
    ...(payload.niches !== undefined ? { niches: payload.niches } : {}),
    ...(payload.channels !== undefined ? { channels: payload.channels } : {}),
    ...(payload.minBudgetCents !== undefined
      ? { minBudgetCents: payload.minBudgetCents }
      : {}),
  });

  const { password_hash, email, ...publicProfile } = updated;
  return NextResponse.json({ profile: publicProfile });
}
