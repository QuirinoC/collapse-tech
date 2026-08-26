import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { acceptApplication, declineApplicationPatch } from "@/lib/campaign-flow";

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const brand = await requireRole("brand");
    const store = getStore();
    const campaign = await store.getCampaign(id);
    if (!campaign || campaign.brand_id !== brand.id) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    const applications = await store.listApplications({ campaignId: id });
    const withCreators = await Promise.all(
      applications.map(async (application) => ({
        ...application,
        creator: stripHash(await store.getProfile(application.creator_id)),
      })),
    );
    return NextResponse.json({ applications: withCreators });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function POST(request, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { applicationId, decision } = body || {};
  if (!["accept", "decline"].includes(decision)) {
    return NextResponse.json({ error: "decision must be accept or decline." }, { status: 400 });
  }

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
  const application = await store.getApplication(applicationId);
  if (!application || application.campaign_id !== id) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (decision === "decline") {
    if (application.status !== "pending") {
      return NextResponse.json({ error: "Application already decided." }, { status: 409 });
    }
    const updated = await store.updateApplication(
      application.id,
      declineApplicationPatch(),
    );
    return NextResponse.json({ application: updated });
  }

  // accept
  let result;
  try {
    result = acceptApplication(campaign, application, application.creator_id);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 409 },
    );
  }
  await store.updateCampaign(campaign.id, { slots_remaining: result.campaign.slots_remaining });
  await store.updateApplication(application.id, {
    status: result.application.status,
    decided_at: result.application.decided_at,
  });
  const assignment = await store.insertAssignment(result.assignment);
  return NextResponse.json({
    application: { ...result.application },
    assignment,
  });
}

function stripHash(profile) {
  if (!profile) return null;
  const { password_hash, ...rest } = profile;
  return rest;
}
