import { notFound } from "next/navigation";
import ProductLink from "@/components/product-link";
import { findOutfit, outfits } from "@/lib/catalog";
import { getPublishedOutfit } from "@/lib/repository";
import { hasSupabaseConfig } from "@/lib/supabase";

export function generateStaticParams() {
  return outfits.map((outfit) => ({ id: outfit.id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const outfit = await loadOutfit(id);
  if (!outfit) return {};

  return {
    title: outfit.title,
    description: `${outfit.personName}: ${outfit.garments.map((item) => item.name).join(", ")}.`,
  };
}

export default async function OutfitPage({ params }) {
  const { id } = await params;
  const outfit = await loadOutfit(id);
  if (!outfit) notFound();

  return (
    <div className="page-shell">
      <div className="outfit-detail">
        <div className={`outfit-hero-art portrait-${outfit.palette}`}>
          <div className="garment-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span>{outfit.garments.length} detected pieces</span>
        </div>
        <div className="outfit-copy">
          <p className="kicker">{outfit.personName} / Outfit breakdown</p>
          <h1>{outfit.title}</h1>
          <p>
            These are AI-assisted descriptions and visually similar products.
            We only call something exact when there is reliable brand or product
            evidence.
          </p>
          <p className="source-link">
            <a
              className="arrow-link"
              href={outfit.sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              View {outfit.sourceLabel} <span aria-hidden="true">↗</span>
            </a>
          </p>
          <div className="garment-list">
            {outfit.garments.map((garment, index) => (
              <article className="garment-card" key={garment.id}>
                <header>
                  <div>
                    <p>Piece 0{index + 1} / Similar</p>
                    <h2>{garment.name}</h2>
                    <p>{garment.detail}</p>
                  </div>
                  <span className="confidence">
                    {Math.round(garment.confidence * 100)}% read
                  </span>
                </header>
                <div className="product-list">
                  {garment.products.length ? (
                    garment.products.map((product) => (
                      <ProductLink
                        className="product-link"
                        href={product.url}
                        key={`${product.merchant}-${product.title}`}
                        merchant={product.merchant}
                      >
                        <strong>{product.title}</strong>
                        <span>{product.merchant}</span>
                        <b>{product.price} ↗</b>
                      </ProductLink>
                    ))
                  ) : (
                    <ProductLink
                      className="product-link"
                      href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(garment.query)}`}
                      merchant="Google Shopping"
                    >
                      <strong>Compare live options</strong>
                      <span>Google Shopping</span>
                      <b>Open ↗</b>
                    </ProductLink>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function loadOutfit(id) {
  const curated = findOutfit(id);
  if (curated || !hasSupabaseConfig()) return curated;

  const stored = await getPublishedOutfit(id);
  if (!stored) return null;
  const source = Array.isArray(stored.source_posts)
    ? stored.source_posts[0]
    : stored.source_posts;

  return {
    id: stored.id,
    personName: "Community reference",
    title: stored.title,
    sourceLabel: source?.source_title || "original Instagram post",
    sourceUrl: source?.canonical_url,
    palette: "blue",
    date: "New",
    garments: stored.garments.map((garment) => ({
      id: garment.id,
      name: `${garment.colors[0] || ""} ${garment.subtype}`.trim(),
      detail: [garment.materials[0], garment.fit, garment.pattern]
        .filter(Boolean)
        .join(" / "),
      confidence: garment.confidence,
      query: garment.search_query,
      products: garment.product_matches.map((product) => ({
        title: product.title,
        merchant: product.merchant,
        price: product.price_text,
        url: product.product_url,
      })),
    })),
  };
}
