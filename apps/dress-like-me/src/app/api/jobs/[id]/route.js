import { NextResponse } from "next/server";
import { getJob } from "@/lib/repository";
import { hasSupabaseConfig } from "@/lib/supabase";

export async function GET(_request, { params }) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Job storage is not configured." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json({ job });
}
