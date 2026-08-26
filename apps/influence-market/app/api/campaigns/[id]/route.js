import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { currentProfile } from "@/lib/session";

export async function GET(request, { params }) {
  const { id } = await params;
  const store = getStore();
  const campaign = await store.getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const profile = await currentProfile();
  let myApplication = null;
  if (profile?.role === "creator") {
    myApplication = await store.findApplication(id, profile.id);
  }
  const assignments = await store.listAssignments({ campaignId: id });
  return NextResponse.json({
    campaign: {
      id: campaign.id,
      title: campaign.title,
      brandName: campaign.brand_name || "Brand",
      brief: campaign.brief,
      demographics: campaign.demographics,
      platforms: campaign.platforms,
      niches: campaign.niches,
      budgetCents: campaign.budget_cents,
      feeCents: campaign.fee_cents,
      perCreatorCents: campaign.per_creator_cents,
      slotsRemaining: campaign.slots_remaining,
      status: campaign.status,
      paymentStatus: campaign.payment_status,
    },
    myApplication,
    slotsTaken: assignments.length,
  });
}
