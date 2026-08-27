import { NextResponse } from "next/server";
import { insertTelemetry } from "@/lib/server/store";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  parseTelemetryPayload,
  readJsonBody,
} from "@/lib/server/request";

export async function POST(request) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    if (!(error instanceof InvalidJsonBodyError)) {
      console.error("Telemetry request read failed", error);
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const telemetry = parseTelemetryPayload(payload);
  if (!telemetry) {
    return NextResponse.json({ error: "Invalid attempt fields" }, { status: 400 });
  }

  try {
    await insertTelemetry(telemetry);
  } catch (error) {
    console.error("Telemetry insert failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
