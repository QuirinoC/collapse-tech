import Link from "next/link";
import { CreatorCard, OutfitCard } from "@/components/cards";
import SearchExperience from "@/components/search-experience";
import { featuredPeople, outfits } from "@/lib/catalog";
import { hasImportConfiguration } from "@/lib/request";

export const dynamic = "force-dynamic";

export default function Home() {
  const shia = featuredPeople[0];
  const importsEnabled = hasImportConfiguration();

  return (
    <>
      <section className="hero shell">
        <div className="eyebrow-row">
          <p>Find it. Name it. Wear it.</p>
          <p>Public beta / source-first fashion search</p>
        </div>
        <h1>
          You know the <em>look.</em>
          <br />
          We know the <span>name.</span>
        </h1>
        <p className="hero-copy">
          {importsEnabled
            ? "Search anyone whose style you rate—or paste a public Instagram post. We identify each piece and find options you can actually buy."
            : "Search anyone whose style you rate. Public-post imports are coming soon."}
        </p>
        <SearchExperience importsEnabled={importsEnabled} />
        <div className="search-hints" aria-label="Search examples">
          <span>Try</span>
          {featuredPeople.slice(0, 4).map((person) => (
            <Link href={`/people/${person.slug}`} key={person.slug}>
              {person.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="feature-strip">
        <div className="shell strip-grid">
          <div className={`portrait portrait-${shia.palette}`}>
            <span>{shia.initials}</span>
            <small>Reference profile</small>
          </div>
          <div className="feature-copy">
            <p className="kicker">Most copied this week / 01</p>
            <h2>{shia.name}</h2>
            <p>{shia.description}</p>
            <div className="style-tags">
              {shia.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <Link className="arrow-link" href={`/people/${shia.slug}`}>
              Break down the look <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="piece-stack">
            {outfits[0].garments.slice(0, 3).map((garment, index) => (
              <div className="piece-card" key={garment.id}>
                <span>0{index + 1}</span>
                <strong>{garment.name}</strong>
                <small>{garment.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell section-block">
        <div className="section-heading">
          <div>
            <p className="kicker">People are searching / Live index</p>
            <h2>Style, by person.</h2>
          </div>
          <Link className="arrow-link" href="/explore">
            Explore everyone <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="creator-grid">
          {featuredPeople.map((person, index) => (
            <CreatorCard key={person.slug} person={person} rank={index + 1} />
          ))}
        </div>
      </section>

      <section className="shell section-block">
        <div className="section-heading">
          <div>
            <p className="kicker">Recent breakdowns / Source linked</p>
            <h2>Pieces, not guesswork.</h2>
          </div>
        </div>
        <div className="outfit-grid">
          {outfits.map((outfit) => (
            <OutfitCard key={outfit.id} outfit={outfit} />
          ))}
        </div>
      </section>

      <section className="method-section">
        <div className="shell method-grid">
          <p className="kicker">How the machine sees clothes / 03 steps</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Bring a reference</strong>
                <p>
                  {importsEnabled
                    ? "Search a person or paste a supported public post URL."
                    : "Search a person today; public-post imports are coming soon."}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Read the outfit</strong>
                <p>AI turns the look into specific, searchable garment details.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Shop the idea</strong>
                <p>
                  Compare live similar pieces without pretending every match is
                  exact.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}
