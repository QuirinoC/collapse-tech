import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server/supabase";

export const revalidate = 0;

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("telemetry_totals")
    .select("attempts_total, attempts_auto, attempts_manual")
    .single();

  if (error) {
    return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
  }

  const totals = {
    total: toNumber(data?.attempts_total),
    auto: toNumber(data?.attempts_auto),
    manual: toNumber(data?.attempts_manual),
  };

  return NextResponse.json({ totals }, { headers: { "Cache-Control": "no-store" } });
}
