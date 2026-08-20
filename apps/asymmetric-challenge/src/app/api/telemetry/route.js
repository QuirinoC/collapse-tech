import { NextResponse } from "next/server";
import { insertTelemetry } from "@/lib/server/store";

function parseTimestamp(value) {
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
}

function parseCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return null;
  }
  return Math.floor(count);
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = typeof payload.clientId === "string" ? payload.clientId : null;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
  const startedAt = parseTimestamp(payload.startedAt);
  const endedAt = parseTimestamp(payload.endedAt);
  const attemptsTotal = parseCount(payload.attemptsTotal);
  const attemptsAuto = parseCount(payload.attemptsAuto);
  const attemptsManual = parseCount(payload.attemptsManual);
  const autoEnabled = typeof payload.autoEnabled === "boolean" ? payload.autoEnabled : null;

  if (!clientId || !sessionId || !startedAt || !endedAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (
    attemptsTotal === null ||
    attemptsAuto === null ||
    attemptsManual === null ||
    autoEnabled === null
  ) {
    return NextResponse.json({ error: "Invalid attempt fields" }, { status: 400 });
  }

  try {
    await insertTelemetry({
      clientId,
      sessionId,
      startedAt,
      endedAt,
      attemptsTotal,
      attemptsAuto,
      attemptsManual,
      autoEnabled,
    });
  } catch (error) {
    console.error("Telemetry insert failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
