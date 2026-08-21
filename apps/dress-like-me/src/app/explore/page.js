import { CreatorCard, OutfitCard } from "@/components/cards";
import SearchExperience from "@/components/search-experience";
import { featuredPeople, outfits } from "@/lib/catalog";
import { listPopularPeople } from "@/lib/repository";
import { hasSupabaseConfig } from "@/lib/supabase";

export const metadata = {
  title: "Explore",
  description: "Explore the people and outfits being searched right now.",
};

export default async function ExplorePage() {
  let people = featuredPeople;
  if (hasSupabaseConfig()) {
    try {
      const stored = await listPopularPeople();
      people = [...stored, ...featuredPeople].filter(
        (person, index, all) =>
          all.findIndex((candidate) => candidate.slug === person.slug) === index,
      );
    } catch (error) {
      console.error("Popularity load failed", error);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="kicker">Live index / Ranked by first-party searches</p>
        <h1 className="page-title">Who are you dressing like?</h1>
        <p>
          Popularity here means people searched for the look—not follower count,
          sponsorship, or an algorithm deciding what matters.
        </p>
      </div>
      <div className="explore-controls">
        <SearchExperience compact />
      </div>
      <div className="creator-grid">
        {people.map((person, index) => (
          <CreatorCard key={person.slug} person={person} rank={index + 1} />
        ))}
      </div>
      <section className="profile-outfits">
        <div className="section-heading">
          <div>
            <p className="kicker">Latest references</p>
            <h2>Freshly broken down.</h2>
          </div>
        </div>
        <div className="outfit-grid">
          {outfits.map((outfit) => (
            <OutfitCard key={outfit.id} outfit={outfit} />
          ))}
        </div>
      </section>
    </div>
  );
}
