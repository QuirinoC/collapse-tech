import { NextResponse } from "next/server";
import { getStore } from "@/lib/repository";
import { publicCreatorProfile } from "@/lib/public-profile";

const VALID_PLATFORMS = new Set([
  "instagram", "tiktok", "youtube", "facebook", "x", "twitch",
]);

export async function GET(request) {
  const url = new URL(request.url);
  const filters = {};
  const platform = url.searchParams.get("platform");
  if (platform && VALID_PLATFORMS.has(platform)) filters.platform = platform;
  const niche = url.searchParams.get("niche");
  if (niche) filters.niche = niche;
  const minFollowers = Number(url.searchParams.get("minFollowers"));
  if (Number.isFinite(minFollowers) && minFollowers > 0) filters.minFollowers = minFollowers;
  const maxBudgetCents = Number(url.searchParams.get("maxBudgetCents"));
  if (Number.isFinite(maxBudgetCents) && maxBudgetCents > 0) filters.maxBudgetCents = maxBudgetCents;

  const creators = await getStore().listCreatorDirectory(filters);
  return NextResponse.json({
    creators: creators.map(publicCreatorProfile),
  });
}
