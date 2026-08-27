import { NextResponse } from "next/server";
import { reviewSchema } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { reviewSubmission, markPaid } from "@/lib/campaign-flow";
import { getPaymentsProvider } from "@/lib/payments";
import { parseJsonBody, requestError } from "@/lib/request";

// Brand reviews a submission. Approving releases the reserved per-creator
// payout from the held balance; rejecting sends it back for revision.
export async function POST(request, { params }) {
  const { id } = await params;
  let payload;
  try {
    payload = reviewSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
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

  if (payload.decision === "reject") {
    let reviewed;
    try {
      reviewed = reviewSubmission(assignment, "reject");
    } catch (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 409 },
      );
    }
    const updated = await store.rejectAssignment(id, {
      reviewedAt: reviewed.reviewed_at,
      notes: payload.notes ?? assignment.notes ?? null,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "This submission was already reviewed." },
        { status: 409 },
      );
    }
    return NextResponse.json({ assignment: updated });
  }

  if (assignment.status === "paid") {
    return NextResponse.json({ assignment, idempotent: true });
  }

  if (!["submitted", "approved"].includes(assignment.status)) {
    return NextResponse.json(
      { error: "Nothing to review." },
      { status: 409 },
    );
  }

  let payments;
  try {
    payments = getPaymentsProvider();
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Creator payout failed." },
      { status: error.statusCode || 502 },
    );
  }

  let approved = assignment;
  if (assignment.status === "submitted") {
    const reviewed = reviewSubmission(assignment, "approve");
    approved = await store.claimAssignmentApproval(id, {
      reviewedAt: reviewed.reviewed_at,
      notes: payload.notes ?? assignment.notes ?? null,
    });
    if (!approved) {
      return NextResponse.json(
        { error: "This submission was already reviewed." },
        { status: 409 },
      );
    }
  }

  const payoutOperationKey = `assignment:${id}:payout`;
  let transfer;
  try {
    transfer = await payments.payout({
      assignmentId: id,
      amountCents: assignment.payout_cents ?? campaign.per_creator_cents,
      idempotencyKey: payoutOperationKey,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Creator payout failed." },
      { status: error.statusCode || 502 },
    );
  }

  const paid = markPaid(approved);
  const ledgerEntry = {
    campaign_id: campaign.id,
    assignment_id: id,
    kind: "payout",
    amount_cents: assignment.payout_cents ?? campaign.per_creator_cents,
    provider_ref: transfer.ref,
    operation_key: payoutOperationKey,
    memo: "Payout released to creator after approval",
  };

  try {
    const updated = await store.finalizeAssignmentPayout({
      assignmentId: id,
      campaignId: campaign.id,
      providerRef: transfer.ref,
      paidAt: paid.paid_at,
      notes: approved.notes ?? null,
      ledgerEntry,
    });
    return NextResponse.json({ assignment: updated });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "creator_payout_reconciliation_pending",
        assignmentId: id,
        error: error.message,
      }),
    );
    return NextResponse.json(
      {
        error:
          "Payout reconciliation is pending. Retry this approval safely.",
      },
      { status: 503 },
    );
  }
}
