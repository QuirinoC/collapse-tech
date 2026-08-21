import { analyzeOutfitImage } from "@/lib/gemini";
import {
  fetchInstagramImage,
  fetchInstagramMetadata,
} from "@/lib/instagram";
import { searchProducts } from "@/lib/products";
import { publishOutfit, updateJob } from "@/lib/repository";

async function resolveAndAnalyze(jobId, sourceUrl) {
  "use step";
  await updateJob(jobId, { status: "fetching", error_message: null });
  const source = await fetchInstagramMetadata(sourceUrl);
  const image = await fetchInstagramImage(source.imageUrl);
  await updateJob(jobId, { status: "analyzing" });
  const analysis = await analyzeOutfitImage(image);
  return { source, analysis };
}

async function matchGarments(jobId, garments) {
  "use step";
  await updateJob(jobId, { status: "matching" });
  return Promise.all(garments.map((garment) => searchProducts(garment)));
}

async function persistResult(jobId, source, analysis, productGroups) {
  "use step";
  return publishOutfit({ jobId, source, analysis, productGroups });
}

async function failJob(jobId, message) {
  "use step";
  await updateJob(jobId, {
    status: "failed",
    error_message: message.slice(0, 500),
    completed_at: new Date().toISOString(),
  });
}

export async function ingestOutfitWorkflow({ jobId, sourceUrl }) {
  "use workflow";

  try {
    const { source, analysis } = await resolveAndAnalyze(jobId, sourceUrl);
    const productGroups = await matchGarments(jobId, analysis.garments);
    return await persistResult(jobId, source, analysis, productGroups);
  } catch (error) {
    await failJob(
      jobId,
      error instanceof Error ? error.message : "The import failed unexpectedly.",
    );
    throw error;
  }
}
