import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { currentProfile } from "@/lib/session";
import { getPaymentsStatus } from "@/lib/payments";

// Role-aware dashboard payload: one call powering the whole /dashboard page.
// Stores persist snake_case; this route maps to the camelCase view-model the UI consumes.
export async function GET() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = getStore();
  if (profile.role === "brand") {
    const payments = getPaymentsStatus();
    const campaigns = await store.listCampaigns({ brandId: profile.id });
    const enriched = await Promise.all(
      campaigns.map(async (campaign) => {
        const [applications, assignments, ledger] = await Promise.all([
          store.listApplications({ campaignId: campaign.id }),
          store.listAssignments({ campaignId: campaign.id }),
          store.listLedger({ campaignId: campaign.id }),
        ]);
        const profilesById = {};
        for (const application of applications) {
          if (!profilesById[application.creator_id]) {
            profilesById[application.creator_id] = await store.getProfile(
              application.creator_id,
            );
          }
        }
        for (const assignment of assignments) {
          if (!profilesById[assignment.creator_id]) {
            profilesById[assignment.creator_id] = await store.getProfile(
              assignment.creator_id,
            );
          }
        }
        const fundingPending =
          campaign.status === "open" &&
          campaign.payment_status === "unpaid" &&
          campaign.payment_ref === `pending:campaign:${campaign.id}:charge`;
        const rosterComplete =
          campaign.slots_remaining === 0 &&
          assignments.filter((assignment) => assignment.status !== "declined").length ===
            campaign.slots;
        return {
          ...mapCampaign(campaign),
          fundingPending,
          canFund:
            rosterComplete &&
            (fundingPending ||
              (campaign.status === "open" &&
                campaign.payment_status === "unpaid" &&
                !campaign.payment_ref)),
          applications: applications.map((a) => ({
            id: a.id,
            pitch: a.pitch,
            status: a.status,
            createdAt: a.created_at,
            creatorName: profilesById[a.creator_id]?.name || "Creator",
            creatorHandle:
              profilesById[a.creator_id]?.channels?.[0]?.handle || null,
          })),
          assignments: assignments.map((a) => ({
            id: a.id,
            status: a.status,
            contentUrl: a.content_url,
            notes: a.notes ?? null,
            submittedAt: a.submitted_at,
            payoutCents: campaign.per_creator_cents,
            creatorName: profilesById[a.creator_id]?.name || "Creator",
          })),
          ledger: ledger.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            amountCents: entry.amount_cents,
            memo: entry.memo,
          })),
        };
      }),
    );
    return NextResponse.json({
      role: "brand",
      campaigns: enriched,
      payments,
    });
  }

  // creator
  const [applications, assignments] = await Promise.all([
    store.listApplications({ creatorId: profile.id }),
    store.listAssignments({ creatorId: profile.id }),
  ]);

  const campaignsByIdRaw = {};
  for (const row of [...applications, ...assignments]) {
    if (!campaignsByIdRaw[row.campaign_id]) {
      campaignsByIdRaw[row.campaign_id] = await store.getCampaign(row.campaign_id);
    }
  }
  const appliedIds = new Set(applications.map((a) => a.campaign_id));
  const marketplace = (await store.listCampaigns())
    .filter(
      (c) =>
        c.status === "open" &&
        c.payment_status === "unpaid" &&
        c.slots_remaining > 0,
    )
    .map((c) => ({
      ...mapCampaign(c),
      myApplicationId: appliedIds.has(c.id) ? c.id : null,
    }));

  return NextResponse.json({
    role: "creator",
    applications: applications.map((a) => ({
      id: a.id,
      pitch: a.pitch,
      status: a.status,
      createdAt: a.created_at,
      campaignTitle: campaignsByIdRaw[a.campaign_id]?.title || "Campaign",
    })),
    assignments: assignments
      .filter((a) => a.status !== "declined")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((a) => ({
        id: a.id,
        status: a.status,
        contentUrl: a.content_url,
        notes: a.notes ?? null,
        instructions:
          campaignsByIdRaw[a.campaign_id] != null
            ? buildInstructions(campaignsByIdRaw[a.campaign_id])
            : "",
        payoutCents: campaignsByIdRaw[a.campaign_id]?.per_creator_cents ?? 0,
        campaign: campaignsByIdRaw[a.campaign_id]
          ? mapCampaign(campaignsByIdRaw[a.campaign_id])
          : null,
      })),
    marketplace,
    earningsCents: assignments
      .filter((a) => a.status === "paid")
      .reduce(
        (sum, a) => sum + (campaignsByIdRaw[a.campaign_id]?.per_creator_cents ?? 0),
        0,
      ),
  });
}

function mapCampaign(campaign) {
  return {
    id: campaign.id,
    title: campaign.title,
    brandName: campaign.brand_name || "Brand",
    brief: campaign.brief,
    demographics: campaign.demographics,
    platforms: campaign.platforms,
    niches: campaign.niches,
    budgetCents: campaign.budget_cents,
    feeCents: campaign.fee_cents,
    perCreatorPayoutCents: campaign.per_creator_cents,
    perCreatorCents: campaign.per_creator_cents,
    slots: campaign.slots,
    slotsRemaining: campaign.slots_remaining,
    status: campaign.status,
    paymentStatus: campaign.payment_status,
    createdAt: campaign.created_at,
  };
}

function buildInstructions(campaign) {
  const parts = [
    `Brief: ${campaign.brief}`,
    campaign.demographics ? `Audience: ${campaign.demographics}` : null,
    `Platforms: ${(campaign.platforms || []).join(", ")}`,
    "Disclose the partnership clearly (#ad) and publish on your accepted channels.",
  ].filter(Boolean);
  return parts.join("\n");
}
