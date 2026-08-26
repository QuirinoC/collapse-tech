import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/session";

export async function GET() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ profile: null });
  const { password_hash, ...rest } = profile;
  return NextResponse.json({ profile: rest });
}
