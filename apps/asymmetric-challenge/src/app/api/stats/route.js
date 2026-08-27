import { NextResponse } from "next/server";
import { fetchTotals, getDatabaseErrorMetadata } from "@/lib/server/store";

export const revalidate = 0;

export async function GET() {
  try {
    const totals = await fetchTotals();
    return NextResponse.json({ totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "stats_query_failed", ...getDatabaseErrorMetadata(error) })
    );
    return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
  }
}
