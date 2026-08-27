import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { parseJsonBody, requestError } from "@/lib/request";

export async function POST(request) {
  let payload;
  try {
    payload = contactSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
  await getStore().insertLead({
    name: payload.name,
    email: payload.email.toLowerCase(),
    company: payload.company ?? null,
    kind: payload.kind,
    message: payload.message,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
