import { NextResponse } from "next/server";
import { tryClaim } from "@/lib/server/store";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  parseClaimPayload,
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
      console.error("Claim request read failed", error);
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const claim = parseClaimPayload(payload);
  if (!claim) {
    return NextResponse.json({ error: "Invalid claim" }, { status: 400 });
  }

  try {
    const result = await tryClaim(claim);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Claim transaction failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }
}
