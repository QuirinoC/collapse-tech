import { getServiceClient } from "@/lib/supabase";

function assertResult(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function reserveJob({ sourceUrl, requesterHash }) {
  const db = getServiceClient();
  const { data, error } = await db
    .rpc("reserve_ingestion_job", {
      p_source_url: sourceUrl,
      p_requester_hash: requesterHash,
      p_hourly_limit: 5,
    })
    .single();
  assertResult(error, "Could not reserve import");
  return {
    id: data.id,
    status: data.status,
    outfitId: data.outfit_id,
    createdAt: data.created_at,
    isNew: data.is_new,
  };
}

export async function claimFailedJob(id) {
  const db = getServiceClient();
  const { data, error } = await db
    .rpc("claim_failed_ingestion_job", { p_job_id: id })
    .maybeSingle();
  assertResult(error, "Could not claim failed import");
  return data;
}

export async function updateJob(id, values) {
  const db = getServiceClient();
  const payload = {
    updated_at: new Date().toISOString(),
    ...values,
  };
  let query = db.from("ingestion_jobs").update(payload).eq("id", id);
  if (values.status && values.status !== "complete") {
    query = query.is("outfit_id", null);
  }
  const { error } = await query;
  assertResult(error, "Could not update import job");
}

export async function getJob(id) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("ingestion_jobs")
    .select("id,status,outfit_id,error_message,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  assertResult(error, "Could not load import job");
  if (!data) return null;

  return {
    id: data.id,
    status: data.status,
    outfitId: data.outfit_id,
    errorMessage: data.error_message,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function listRecentJobs(limit = 30) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("ingestion_jobs")
    .select("id,source_url,status,outfit_id,error_message,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  assertResult(error, "Could not list import jobs");
  return data;
}

export async function recordSearch({ query, sessionHash, resultCount }) {
  const db = getServiceClient();
  const { error } = await db.from("search_events").insert({
    normalized_query: query.trim().toLowerCase().slice(0, 160),
    session_hash: sessionHash,
    result_count: resultCount,
  });
  assertResult(error, "Could not record search");
}

export async function searchStoredPeople(query, limit = 8) {
  const db = getServiceClient();
  const normalized = query
    .trim()
    .toLowerCase()
    .replace(/[%_\\]/g, "\\$&")
    .slice(0, 160);
  const { data, error } = await db
    .from("person_aliases")
    .select("people!inner(slug,name,bio,is_published)")
    .ilike("normalized_alias", `%${normalized}%`)
    .eq("people.is_published", true)
    .limit(limit);
  assertResult(error, "Could not search people");

  return data.map(({ people }) => ({
    name: people.name,
    slug: people.slug,
    initials: people.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2),
    palette: "blue",
    description: people.bio || "A growing collection of outfit references.",
    tags: ["Community index"],
    aliases: [],
  }));
}

export async function listPopularPeople(limit = 12) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("popularity_rollups")
    .select("score,people!inner(slug,name,bio,is_published)")
    .eq("people.is_published", true)
    .order("period_start", { ascending: false })
    .order("score", { ascending: false })
    .limit(limit);
  assertResult(error, "Could not load popular people");

  const seen = new Set();
  return data.flatMap(({ people, score }) => {
    if (seen.has(people.slug)) return [];
    seen.add(people.slug);
    return [
      {
        name: people.name,
        slug: people.slug,
        initials: people.name
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2),
        palette: "blue",
        rank: Math.round(Number(score)),
        description: people.bio || "A growing collection of outfit references.",
        tags: ["Community index"],
        aliases: [],
      },
    ];
  });
}

export async function publishOutfit({
  jobId,
  source,
  analysis,
  productGroups,
}) {
  const db = getServiceClient();
  const { data, error } = await db.rpc("publish_outfit_result", {
    p_job_id: jobId,
    p_source: {
      canonicalUrl: source.canonicalUrl,
      caption: source.caption,
      title: source.title,
    },
    p_analysis: analysis,
    p_product_groups: productGroups,
  });
  assertResult(error, "Could not publish outfit");
  return data;
}

export async function getPublishedOutfit(id) {
  const db = getServiceClient();
  const { data, error } = await db
    .from("outfits")
    .select(
      "id,title,model_name,prompt_version,source_posts(canonical_url,source_title),garments(id,position,category,subtype,colors,materials,pattern,fit,details,brand_evidence,confidence,search_query,product_matches(id,title,merchant,price_text,product_url,image_url,rank))",
    )
    .eq("id", id)
    .eq("status", "published")
    .order("position", { referencedTable: "garments", ascending: true })
    .order("rank", {
      referencedTable: "garments.product_matches",
      ascending: true,
    })
    .maybeSingle();
  assertResult(error, "Could not load outfit");
  return data;
}
