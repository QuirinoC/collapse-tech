import { NextResponse } from "next/server";
import { tryClaim } from "@/lib/server/store";

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

  try {
    const result = await tryClaim({ guessHex, clientId, sessionId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Claim transaction failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }
}
