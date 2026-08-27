import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { normalizeInstagramUrl } from "@/lib/instagram";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/json";
import { reserveJob, updateJob } from "@/lib/repository";
import {
  assertProviderConfiguration,
  requestFingerprint,
} from "@/lib/request";
import { importRequestSchema } from "@/lib/schemas";
import { ingestOutfitWorkflow } from "@/workflows/ingest-outfit";

const MAX_IMPORT_REQUEST_BYTES = 4 * 1024;

export async function POST(request) {
  try {
    assertProviderConfiguration();
    const payload = importRequestSchema.parse(
      await readBoundedJson(request, MAX_IMPORT_REQUEST_BYTES),
    );
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
        : error instanceof Error
          ? error.message
          : "Import could not be started.";
    const status =
      error instanceof RequestBodyTooLargeError
        ? 413
        : message.includes("rate_limit")
          ? 429
          : message.startsWith("Import service is not configured") ||
              message === "Request origin is unavailable."
            ? 503
            : 400;
    const publicMessage =
      status === 429
        ? "Import limit reached. Try again in an hour."
        : status === 413
          ? "Import requests must be smaller than 4 KB."
          : status === 503
            ? "Import service is temporarily unavailable."
            : "Enter a valid public Instagram post URL.";
    return NextResponse.json({ error: publicMessage }, { status });
  }
}
