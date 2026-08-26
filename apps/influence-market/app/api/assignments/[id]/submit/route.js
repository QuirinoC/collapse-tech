import { NextResponse } from "next/server";
import { submissionSchema, firstIssue } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { canSubmit, submitContent } from "@/lib/campaign-flow";

export async function POST(request, { params }) {
  const { id } = await params;
  let payload;
  try {
    payload = submissionSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
  }

  let creator;
  try {
    creator = await requireRole("creator");
  } catch {
    return NextResponse.json({ error: "Creator account required." }, { status: 401 });
  }

  const store = getStore();
  const assignment = await store.getAssignment(id);
  if (!assignment || assignment.creator_id !== creator.id) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }
  const campaign = await store.getCampaign(assignment.campaign_id);
  if (!canSubmit(campaign, assignment)) {
    return NextResponse.json(
      { error: "This assignment cannot be submitted right now." },
      { status: 409 },
    );
  }

  const submitted = submitContent(assignment, payload.contentUrl);
  const updated = await store.updateAssignment(id, {
    ...submitted,
    notes: payload.notes ?? null,
  });
  return NextResponse.json({ assignment: updated });
}
