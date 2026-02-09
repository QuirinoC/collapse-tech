import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server/supabase";
import { evaluateClaim } from "@/lib/server/claim";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const guessHex = typeof payload.guessHex === "string" ? payload.guessHex : "";
  const clientId = typeof payload.clientId === "string" ? payload.clientId : null;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;

  if (!guessHex || !clientId || !sessionId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("winners")
    .select("id")
    .limit(1);

  if (existingError) {
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  const alreadyWon = existing && existing.length > 0;
  const status = evaluateClaim({ guessHex, alreadyWon });
  if (status === "already_won" || status === "nope") {
    return NextResponse.json({ status });
  }

  const claimToken = crypto.randomBytes(16).toString("hex");
  const { error } = await supabase.from("winners").insert({
    claim_token: claimToken,
    client_id: clientId,
    session_id: sessionId,
  });

  if (error) {
    const { data: recheck } = await supabase
      .from("winners")
      .select("id")
      .limit(1);
    if (recheck && recheck.length > 0) {
      return NextResponse.json({ status: "already_won" });
    }
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "won", claimToken });
}
