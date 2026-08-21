import { notFound } from "next/navigation";
import { OutfitCard } from "@/components/cards";
import {
  featuredPeople,
  findPerson,
  getOutfitsForPerson,
} from "@/lib/catalog";

export function generateStaticParams() {
  return featuredPeople.map((person) => ({ slug: person.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const person = findPerson(slug);
  if (!person) return {};

  return {
    title: person.name,
    description: `Explore ${person.name}'s style and find similar pieces.`,
  };
}

export default async function PersonPage({ params }) {
  const { slug } = await params;
  const person = findPerson(slug);
  if (!person) notFound();

  const personOutfits = getOutfitsForPerson(slug);

  return (
    <div className="page-shell">
      <div className="profile-heading">
        <div>
          <p className="kicker">Canonical style profile / Source-linked</p>
          <h1>{person.name}</h1>
          <p>{person.description}</p>
          <div className="style-tags">
            {person.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className="profile-index">
          <strong>{person.rank}</strong>
          <span>Search index</span>
        </div>
      </div>
      <div className={`profile-portrait portrait-${person.palette}`}>
        <span>{person.initials}</span>
      </div>
      <section className="profile-outfits">
        <div className="section-heading">
          <div>
            <p className="kicker">Outfit references / {personOutfits.length}</p>
            <h2>The breakdowns.</h2>
          </div>
        </div>
        {personOutfits.length ? (
          <div className="outfit-grid">
            {personOutfits.map((outfit) => (
              <OutfitCard key={outfit.id} outfit={outfit} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>No published breakdowns yet.</h2>
            <p>Paste a public post featuring this person to begin one.</p>
          </div>
        )}
      </section>
    </div>
  );
}
