import Link from "next/link";

export function CreatorCard({ person, rank }) {
  return (
    <Link className="creator-card" href={`/people/${person.slug}`}>
      <div className={`creator-art portrait-${person.palette}`}>
        <span>{person.initials}</span>
        <small>Index {person.rank}</small>
      </div>
      <div className="creator-meta">
        <span>0{rank}</span>
        <div>
          <h3>{person.name}</h3>
          <p>{person.tags.join(" / ")}</p>
        </div>
        <b aria-hidden="true">↗</b>
      </div>
    </Link>
  );
}

export function OutfitCard({ outfit }) {
  return (
    <Link className="outfit-card" href={`/outfits/${outfit.id}`}>
      <div className={`outfit-art portrait-${outfit.palette}`}>
        <div className="garment-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>{outfit.garments.length} pieces</span>
      </div>
      <div>
        <p>
          {outfit.personName} <span>{outfit.date}</span>
        </p>
        <h3>{outfit.title}</h3>
      </div>
    </Link>
  );
}
