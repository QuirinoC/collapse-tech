const SEARCH_API_ENDPOINT = "https://www.searchapi.io/api/v1/search";

export function buildShoppingQuery(garment) {
  const fallback = [
    ...garment.colors,
    garment.pattern === "solid" ? null : garment.pattern,
    garment.fit,
    garment.subtype,
    garment.category,
  ]
    .filter(Boolean)
    .join(" ");

  return (garment.searchQuery || fallback).trim().slice(0, 220);
}

export function normalizeShoppingResults(results = []) {
  const seen = new Set();

  return results.flatMap((item) => {
    const url = item.product_link || item.link;
    if (!url || !item.title) return [];

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return [];
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return [];

    const key = `${item.title.toLowerCase()}|${item.source || ""}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [
      {
        providerId: String(item.product_id || item.position || key).slice(0, 220),
        title: item.title.slice(0, 300),
        merchant: (item.source || item.seller || "Unknown merchant").slice(0, 160),
        priceText: (item.price || item.extracted_price || "See price")
          .toString()
          .slice(0, 80),
        productUrl: url,
        imageUrl: item.thumbnail || null,
        rating: Number.isFinite(item.rating) ? item.rating : null,
      },
    ];
  });
}

export async function searchProducts(garment) {
  const apiKey = process.env.SEARCHAPI_API_KEY;
  if (!apiKey) throw new Error("SEARCHAPI_API_KEY is not configured.");

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: buildShoppingQuery(garment),
    api_key: apiKey,
    gl: process.env.SHOPPING_COUNTRY || "us",
    hl: "en",
  });
  const response = await fetch(`${SEARCH_API_ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`SearchAPI returned ${response.status}.`);
  }

  const payload = await response.json();
  return normalizeShoppingResults(payload.shopping_results).slice(0, 8);
}
