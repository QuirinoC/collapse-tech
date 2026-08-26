import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { fundCampaign } from "@/lib/campaign-flow";
import { getPaymentsProvider } from "@/lib/payments";

function mapCampaign(c) {
  return {
    id: c.id,
    title: c.title,
    brandName: c.brand_name || "Brand",
    brief: c.brief,
    platforms: c.platforms,
    niches: c.niches,
    demographics: c.demographics,
    creatorSlots: c.slots,
    slotsRemaining: c.slots_remaining,
    budgetCents: c.budget_cents,
    feeCents: c.fee_cents,
    perCreatorCents: c.per_creator_cents,
    status: c.status,
    paymentStatus: c.payment_status,
    createdAt: c.created_at,
  };
}

export async function POST(request, { params }) {
  const { id } = await params;
  let brand;
  try {
    brand = await requireRole("brand");
  } catch {
    return NextResponse.json({ error: "Brand account required." }, { status: 401 });
  }

  const store = getStore();
  const campaign = await store.getCampaign(id);
  if (!campaign || campaign.brand_id !== brand.id) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (
    campaign.status === "funded" &&
    campaign.payment_status === "held" &&
    campaign.payment_ref
  ) {
    return NextResponse.json({
      campaign: mapCampaign(campaign),
      charge: { ref: campaign.payment_ref, status: "succeeded" },
      idempotent: true,
    });
  }

  const assignments = await store.listAssignments({ campaignId: id });
  const committedAssignments = assignments.filter((assignment) => assignment.status !== "declined");
  if (
    campaign.slots_remaining !== 0 ||
    committedAssignments.length !== campaign.slots
  ) {
    return NextResponse.json(
      {
        error: `Accept all ${campaign.slots} creator slots before funding (${committedAssignments.length}/${campaign.slots} filled).`,
      },
      { status: 409 },
    );
  }

  const chargeOperationKey = `campaign:${id}:charge`;
  const claimRef = `pending:${chargeOperationKey}`;
  const resumingClaim =
    campaign.status === "open" &&
    campaign.payment_status === "unpaid" &&
    campaign.payment_ref === claimRef;

  let nextCampaign;
  if (resumingClaim) {
    nextCampaign = {
      ...campaign,
      status: "funded",
      payment_status: "held",
      funded_at: new Date().toISOString(),
    };
  } else {
    try {
      nextCampaign = fundCampaign(campaign);
    } catch (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 409 },
      );
    }
  }

  let payments;
  try {
    payments = getPaymentsProvider();
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Campaign funding failed." },
      { status: error.statusCode || 502 },
    );
  }

  const claimed = resumingClaim
    ? campaign
    : await store.claimCampaignFunding(id, claimRef);
  if (!claimed) {
    return NextResponse.json(
      { error: "Campaign funding is already being processed." },
      { status: 409 },
    );
  }

  let charge;
  try {
    charge = await payments.charge({
      campaignId: id,
      amountCents: campaign.budget_cents,
      idempotencyKey: chargeOperationKey,
    });
  } catch (error) {
    try {
      await store.releaseCampaignFundingClaim(id, claimRef);
    } catch (releaseError) {
      console.error(
        JSON.stringify({
          event: "campaign_funding_claim_release_failed",
          campaignId: id,
          error: releaseError.message,
        }),
      );
    }
    return NextResponse.json(
      { error: error.message || "Campaign funding failed." },
      { status: error.statusCode || 502 },
    );
  }

  const chargeEntry = {
    campaign_id: id,
    assignment_id: null,
    kind: "charge",
    amount_cents: campaign.budget_cents,
    provider_ref: charge.ref,
    operation_key: chargeOperationKey,
    memo: `Upfront funding by ${brand.name}`,
  };
  const feeEntry = {
    campaign_id: id,
    assignment_id: null,
    kind: "platform_fee",
    amount_cents: campaign.fee_cents,
    provider_ref: charge.ref,
    operation_key: `campaign:${id}:platform_fee`,
    memo: `Platform fee (${(campaign.fee_cents / campaign.budget_cents * 100).toFixed(1)}%)`,
  };

  try {
    const updated = await store.finalizeCampaignFunding({
      campaignId: id,
      claimRef,
      providerRef: charge.ref,
      fundedAt: nextCampaign.funded_at,
      charge: chargeEntry,
      fee: feeEntry,
    });
    return NextResponse.json(
      { campaign: mapCampaign(updated), charge },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "campaign_funding_reconciliation_pending",
        campaignId: id,
        error: error.message,
      }),
    );
    return NextResponse.json(
      {
        error:
          "Funding reconciliation is pending. Retry this request safely.",
      },
      { status: 503 },
    );
  }
}
