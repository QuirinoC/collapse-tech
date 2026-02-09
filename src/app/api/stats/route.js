import { NextResponse } from "next/server";
import { fetchTotals } from "@/lib/server/store";

export const revalidate = 0;

export async function GET() {
  try {
    const totals = await fetchTotals();
    return NextResponse.json({ totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stats query failed", error);
    return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
  }
}
