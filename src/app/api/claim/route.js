import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { evaluateClaim } from "@/lib/server/claim";
import { getPool } from "@/lib/server/db";

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

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const existing = await client.query("select id from winners limit 1");
    const alreadyWon = existing.rows.length > 0;
    const status = evaluateClaim({ guessHex, alreadyWon });
    if (status === "already_won" || status === "nope") {
      await client.query("commit");
      return NextResponse.json({ status });
    }

    const claimToken = crypto.randomBytes(16).toString("hex");
    await client.query(
      "insert into winners (claim_token, client_id, session_id) values ($1, $2, $3)",
      [claimToken, clientId, sessionId]
    );
    await client.query("commit");
    return NextResponse.json({ status: "won", claimToken });
  } catch (error) {
    await client.query("rollback");
    console.error("Claim transaction failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
