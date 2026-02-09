import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const revalidate = 0;

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export async function GET() {
  const pool = getPool();
  try {
    const result = await pool.query(
      `select
        coalesce(sum(attempts_total), 0) as attempts_total,
        coalesce(sum(attempts_auto), 0) as attempts_auto,
        coalesce(sum(attempts_manual), 0) as attempts_manual
       from telemetry_aggregates`
    );

    const row = result.rows[0] || {};
    const totals = {
      total: toNumber(row.attempts_total),
      auto: toNumber(row.attempts_auto),
      manual: toNumber(row.attempts_manual),
    };

    return NextResponse.json({ totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stats query failed", error);
    return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
  }
}
