export const metadata = {
  title: "How it works",
};

export default function AboutPage() {
  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="kicker">Method / Honest matching</p>
        <h1 className="page-title">A visual reference, translated.</h1>
        <p>
          Dress Like Me turns a public outfit reference into language a store
          search can understand. It is a discovery tool—not an authenticity
          oracle.
        </p>
      </div>
      <div className="about-grid">
        <p className="kicker">What happens after you paste a post</p>
        <article>
          <section>
            <h2>1. We inspect the public source.</h2>
            <p>
              Only supported public Instagram post and reel URLs are accepted.
              We do not sign in, access private content, bypass blocks, or crawl
              an account. The source stays linked for attribution.
            </p>
          </section>
          <section>
            <h2>2. Gemini describes visible garments.</h2>
            <p>
              The model returns structured categories, colors, materials,
              patterns, fits, and confidence. Image bytes are handled
              transiently and discarded after analysis.
            </p>
          </section>
          <section>
            <h2>3. Shopping search finds similar pieces.</h2>
            <p>
              Live results are ranked against the garment description. Unless
              brand and item evidence is strong, every result is clearly labeled
              similar—not exact.
            </p>
          </section>
          <section>
            <h2>Removal and corrections</h2>
            <p>
              Creators and rights holders can request a correction or takedown
              at hello@collapsetechnologies.com. Removed sources are blocked from
              automatic re-import.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
