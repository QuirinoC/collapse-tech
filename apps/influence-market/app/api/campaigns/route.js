import { NextResponse } from "next/server";
import { campaignSchema, firstIssue } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { currentProfile, requireRole } from "@/lib/session";
import {
  campaignFeeCents,
  perCreatorPayoutCents,
} from "@/lib/money";

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

export async function GET(request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const store = getStore();

  if (scope === "mine") {
    try {
      const brand = await requireRole("brand");
      return NextResponse.json({
        campaigns: (await store.listCampaigns({ brandId: brand.id })).map(mapCampaign),
      });
    } catch {
      return NextResponse.json({ campaigns: [] });
    }
  }

  // Public marketplace shows funded campaigns (money committed) plus open ones.
  const all = await store.listCampaigns();
  return NextResponse.json({
    campaigns: all.filter((c) => c.status !== "cancelled").map(mapCampaign),
  });
}

export async function POST(request) {
  let payload;
  try {
    payload = campaignSchema.parse(await request.json());
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
  const campaign = await store.insertCampaign({
    brand_id: brand.id,
    brand_name: payload.brandName || brand.name,
    title: payload.title,
    brief: payload.brief,
    product_info: payload.productInfo ?? null,
    platforms: payload.platforms,
    niches: payload.niches,
    demographics: payload.demographics ?? null,
    follower_min: payload.followerMin ?? null,
    follower_max: payload.followerMax ?? null,
    slots: payload.slots,
    slots_remaining: payload.slots,
    budget_cents: payload.budgetCents,
    fee_cents: campaignFeeCents(payload.budgetCents),
    per_creator_cents: perCreatorPayoutCents(payload.budgetCents, payload.slots),
    status: "open",
    payment_status: "unpaid",
    payment_ref: null,
    funded_at: null,
  });

  return NextResponse.json({ campaign: mapCampaign(campaign) }, { status: 201 });
}
