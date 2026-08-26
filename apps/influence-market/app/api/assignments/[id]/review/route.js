import { NextResponse } from "next/server";
import { reviewSchema, firstIssue } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { reviewSubmission, markPaid } from "@/lib/campaign-flow";
import { getPaymentsProvider } from "@/lib/payments";

// Brand reviews a submission. Approving releases the reserved per-creator
// payout from the held balance; rejecting sends it back for revision.
export async function POST(request, { params }) {
  const { id } = await params;
  let payload;
  try {
    payload = reviewSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
  }

  let brand;
  try {
    brand = await requireRole("brand");
  } catch {
    return NextResponse.json({ error: "Brand account required." }, { status: 401 });
  }

  const store = getStore();
  const assignment = await store.getAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }
  const campaign = await store.getCampaign(assignment.campaign_id);
  if (!campaign || campaign.brand_id !== brand.id) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  let reviewed;
  try {
    reviewed = reviewSubmission(assignment, payload.decision);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 409 },
    );
  }
  let updated = await store.updateAssignment(id, {
    status: reviewed.status,
    reviewed_at: reviewed.reviewed_at,
  });

  if (payload.decision === "approve" && reviewed.status === "approved") {
    const provider = getPaymentsProvider();
    const transfer = await provider.payout({
      assignmentId: id,
      amountCents: campaign.per_creator_cents,
    });
    updated = await store.updateAssignment(id, {
      ...markPaid(updated),
      payout_ref: transfer.ref,
    });
    await store.appendLedger({
      campaign_id: campaign.id,
      assignment_id: id,
      kind: "payout",
      amount_cents: campaign.per_creator_cents,
      provider_ref: transfer.ref,
      memo: `Payout released to creator after approval`,
    });

    // Settle the campaign once every assignment reached a terminal state.
    const assignments = await store.listAssignments({ campaignId: campaign.id });
    const settled = assignments.every((a) => ["paid", "declined"].includes(a.status));
    if (settled) {
      await store.updateCampaign(campaign.id, {
        status: "completed",
        payment_status: "settled",
      });
    }
  }

  return NextResponse.json({ assignment: updated });
}
