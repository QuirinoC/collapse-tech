import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { normalizeInstagramUrl } from "@/lib/instagram";
import { reserveJob, updateJob } from "@/lib/repository";
import {
  assertProviderConfiguration,
  requestFingerprint,
} from "@/lib/request";
import { importRequestSchema } from "@/lib/schemas";
import { ingestOutfitWorkflow } from "@/workflows/ingest-outfit";

export async function POST(request) {
  try {
    assertProviderConfiguration();
    const payload = importRequestSchema.parse(await request.json());
    const sourceUrl = normalizeInstagramUrl(payload.sourceUrl);
    const requesterHash = requestFingerprint(request);

    const job = await reserveJob({ sourceUrl, requesterHash });
    if (!job.isNew) {
      return NextResponse.json({
        jobId: job.id,
        reused: true,
      });
    }

    let run;
    try {
      run = await start(ingestOutfitWorkflow, [{ jobId: job.id, sourceUrl }]);
    } catch (error) {
      await updateJob(job.id, {
        status: "failed",
        error_message: "The background workflow could not start.",
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
    try {
      await updateJob(job.id, { workflow_run_id: run.runId });
    } catch (error) {
      console.error("Could not save workflow run ID", error);
    }

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    console.error("Could not start outfit import", error);
    const message =
      error?.name === "ZodError"
        ? "Enter a valid public Instagram post URL."
        : error.message;
    const status = message.includes("rate_limit")
      ? 429
      : message === "Unauthorized"
        ? 401
        : message.startsWith("Import service is not configured")
          ? 503
          : 400;
    const publicMessage =
      status === 429 ? "Import limit reached. Try again in an hour." : message;
    return NextResponse.json({ error: publicMessage }, { status });
  }
}
