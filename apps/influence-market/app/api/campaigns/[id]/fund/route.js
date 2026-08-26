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

  const assignments = await store.listAssignments({ campaignId: id });
  if (assignments.length === 0) {
    return NextResponse.json(
      { error: "Accept at least one creator before funding." },
      { status: 409 },
    );
  }

  // State check first (throws 409 through the state machine).
  let nextCampaign;
  try {
    nextCampaign = fundCampaign(campaign);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 409 },
    );
  }

  const provider = getPaymentsProvider();
  const charge = await provider.charge({
    campaignId: id,
    amountCents: campaign.budget_cents,
  });

  const updated = await store.updateCampaign(id, {
    status: nextCampaign.status,
    payment_status: nextCampaign.payment_status,
    funded_at: nextCampaign.funded_at,
    payment_ref: charge.ref,
  });

  await store.appendLedger({
    campaign_id: id,
    assignment_id: null,
    kind: "charge",
    amount_cents: campaign.budget_cents,
    provider_ref: charge.ref,
    memo: `Upfront funding by ${brand.name}`,
  });
  await store.appendLedger({
    campaign_id: id,
    assignment_id: null,
    kind: "platform_fee",
    amount_cents: campaign.fee_cents,
    provider_ref: charge.ref,
    memo: `Platform fee (${(campaign.fee_cents / campaign.budget_cents * 100).toFixed(1)}%)`,
  });

  return NextResponse.json({ campaign: mapCampaign(updated), charge }, { status: 200 });
}
