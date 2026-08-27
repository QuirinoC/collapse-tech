import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { acceptApplication, declineApplicationPatch } from "@/lib/campaign-flow";
import { nextAssignmentPayoutCents } from "@/lib/money";
import { getPaymentsStatus } from "@/lib/payments";
import { parseJsonBody, requestError } from "@/lib/request";
import { publicCreatorProfile } from "@/lib/public-profile";

export async function GET(request, { params }) {
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
  const applications = await store.listApplications({ campaignId: id });
  const withCreators = await Promise.all(
    applications.map(async (application) => ({
      ...application,
      creator: publicCreatorProfile(await store.getProfile(application.creator_id)),
    })),
  );
  return NextResponse.json({ applications: withCreators });
}

export async function POST(request, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
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
    const patch = declineApplicationPatch();
    const updated = await store.declineApplication(
      application.id,
      patch.decided_at,
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Application already decided." },
        { status: 409 },
      );
    }
    return NextResponse.json({ application: updated });
  }

  // accept
  const payments = getPaymentsStatus();
  if (!payments.ready) {
    return NextResponse.json(
      {
        error:
          "Creator acceptance is unavailable until payment funding is enabled.",
      },
      { status: 503 },
    );
  }
  let result;
  try {
    const assignments = await store.listAssignments({ campaignId: id });
    const committedPayoutCents = assignments.reduce(
      (sum, assignment) =>
        sum + (assignment.payout_cents ?? campaign.per_creator_cents),
      0,
    );
    result = acceptApplication(
      campaign,
      application,
      application.creator_id,
      undefined,
      nextAssignmentPayoutCents(campaign, committedPayoutCents),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode || 409 },
    );
  }
  try {
    const accepted = await store.acceptApplication(result);
    return NextResponse.json({
      application: accepted.application,
      assignment: accepted.assignment,
    });
  } catch {
    return NextResponse.json(
      { error: "This application can no longer be accepted." },
      { status: 409 },
    );
  }
}
