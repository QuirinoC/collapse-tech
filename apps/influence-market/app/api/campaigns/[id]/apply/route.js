import { NextResponse } from "next/server";
import { applicationSchema } from "@/lib/schemas";
import { getStore } from "@/lib/repository";
import { requireRole } from "@/lib/session";
import { canApply } from "@/lib/campaign-flow";
import { parseJsonBody, requestError } from "@/lib/request";

export async function POST(request, { params }) {
  const { id } = await params;
  let payload;
  try {
    payload = applicationSchema.parse(await parseJsonBody(request));
  } catch (error) {
    const failure = requestError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  let creator;
  try {
    creator = await requireRole("creator");
  } catch {
    return NextResponse.json({ error: "Creator account required." }, { status: 401 });
  }

  const store = getStore();
  const campaign = await store.getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const existing = await store.findApplication(id, creator.id);
  if (existing && ["pending", "accepted"].includes(existing.status)) {
    return NextResponse.json(
      { error: "You already applied to this campaign." },
      { status: 409 },
    );
  }
  if (!canApply(campaign)) {
    return NextResponse.json(
      { error: "This campaign is no longer accepting applications." },
      { status: 409 },
    );
  }

  const application =
    existing ||
    (await store.insertApplication({
      campaign_id: id,
      creator_id: creator.id,
      pitch: payload.pitch,
      status: "pending",
      decided_at: null,
    }));
  if (existing) {
    await store.updateApplication(existing.id, {
      pitch: payload.pitch,
      status: "pending",
      decided_at: null,
    });
  }

  return NextResponse.json({ application }, { status: 201 });
}
