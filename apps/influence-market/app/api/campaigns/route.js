import { NextResponse } from "next/server";
import { campaignSchema } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { currentProfile } from "@/lib/session";
import {
  campaignFeeCents,
  perCreatorPayoutCents,
} from "@/lib/money";
import { parseJsonBody, requestError } from "@/lib/request";

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
    const profile = await currentProfile();
    if (!profile) return NextResponse.json({ campaigns: [] });

    if (profile.role === "brand") {
      return NextResponse.json({
        campaigns: (await store.listCampaigns({ brandId: profile.id })).map(mapCampaign),
      });
    }

    // Creators see every campaign they applied to, with their decision state.
    const applications = await store.listApplications({ creatorId: profile.id });
    const mine = (
      await Promise.all(
        applications.map(async (application) => {
          const campaign = await store.getCampaign(application.campaign_id);
          if (!campaign) return null;
          return { ...mapCampaign(campaign), applicationStatus: application.status };
        }),
      )
    ).filter(Boolean);
    return NextResponse.json({ campaigns: mine });
  }

  // Public marketplace only shows briefs that creators can act on.
  const all = await store.listCampaigns();
  return NextResponse.json({
    campaigns: all
      .filter((c) => c.status === "open" && c.slots_remaining > 0)
      .map(mapCampaign),
  });
}

export async function POST(request) {
  let payload;
  try {
    payload = campaignSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  const brand = await currentProfile();
  if (!brand || brand.role !== "brand") {
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
