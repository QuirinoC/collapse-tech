import { NextResponse } from "next/server";
import { start } from "workflow/api";
import {
  claimFailedJob,
  listRecentJobs,
  updateJob,
} from "@/lib/repository";
import { assertAdmin } from "@/lib/request";
import { ingestOutfitWorkflow } from "@/workflows/ingest-outfit";

function unauthorized(error) {
  const status = error.message === "Unauthorized" ? 401 : 500;
  return NextResponse.json(
    { error: status === 401 ? "Unauthorized" : error.message },
    { status },
  );
}

export async function GET(request) {
  try {
    assertAdmin(request);
    return NextResponse.json({ jobs: await listRecentJobs() });
  } catch (error) {
    return unauthorized(error);
  }
}

export async function POST(request) {
  try {
    assertAdmin(request);
    const { jobId } = await request.json();
    const job = await claimFailedJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found or no longer retryable." },
        { status: 409 },
      );
    }

    let run;
    try {
      run = await start(ingestOutfitWorkflow, [
        { jobId: job.id, sourceUrl: job.source_url },
      ]);
    } catch (error) {
      await updateJob(job.id, {
        status: "failed",
        error_message: "The retry workflow could not start.",
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
    try {
      await updateJob(job.id, { workflow_run_id: run.runId });
    } catch (error) {
      console.error("Could not save retry workflow run ID", error);
    }

    return NextResponse.json({ jobs: await listRecentJobs() });
  } catch (error) {
    console.error("Admin retry failed", error);
    return unauthorized(error);
  }
}
