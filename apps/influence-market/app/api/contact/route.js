import { NextResponse } from "next/server";
import { contactSchema, firstIssue } from "@/lib/schemas";
import { getStore } from "@/lib/repository";

export async function POST(request) {
  let payload;
  try {
    payload = contactSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
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
