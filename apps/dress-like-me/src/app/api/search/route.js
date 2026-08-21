import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";
import { recordSearch, searchStoredPeople } from "@/lib/repository";
import { requestFingerprint } from "@/lib/request";
import { hasSupabaseConfig } from "@/lib/supabase";

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query || query.length > 160) {
    return NextResponse.json(
      { error: "Enter a person or style term up to 160 characters." },
      { status: 400 },
    );
  }

  const curated = searchCatalog(query);
  let people = curated;
  if (hasSupabaseConfig()) {
    try {
      const stored = await searchStoredPeople(query);
      people = [...stored, ...curated].filter(
        (person, index, all) =>
          all.findIndex((candidate) => candidate.slug === person.slug) === index,
      );
    } catch (error) {
      console.error("Database people search failed", error);
    }
  }

  if (hasSupabaseConfig() && process.env.REQUEST_HASH_SALT) {
    try {
      await recordSearch({
        query,
        sessionHash: requestFingerprint(request),
        resultCount: people.length,
      });
    } catch (error) {
      console.error("Search analytics write failed", error);
    }
  }

  return NextResponse.json({ people });
}
