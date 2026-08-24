import Link from "next/link";
import LeadForm from "./LeadForm";
import { procedures, pctSaving } from "./data";

export default function Home() {
  return (
    <main>
      {/* Nav */}
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="logo">
            Collapse<span>Health</span>
          </Link>
          <nav className="nav-links">
            <a href="#procedures">Procedures</a>
            <a href="#destinations">Destinations</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a href="#quote" className="btn btn-primary btn-sm">
            Get a free quote
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Medical care in Mexico, coordinated end-to-end</p>
          <h1>
            World-class care in Mexico.
            <br />
            <span className="accent">Up to 70% less</span> than U.S. prices.
          </h1>
          <p className="sub">
            We connect American and Canadian patients with vetted, certified hospitals
            and specialists — and stay with you from first quote to safe return home.
          </p>
          <div className="hero-cta">
            <a href="#quote" className="btn btn-primary">
              Get my free quote
            </a>
            <a href="#how" className="btn btn-ghost">
              How it works →
            </a>
          </div>
          <ul className="hero-points">
            <li>Vetted, certified facilities only</li>
            <li>Transparent, all-in pricing</li>
            <li>English-speaking care coordinators</li>
          </ul>
        </div>
      </section>

      {/* Trust strip */}
      <section className="strip">
        <div className="container strip-grid">
          <div>
            <strong>40–70%</strong>
            <span>typical savings vs. U.S. list prices</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>of partner facilities hold valid sanitary licenses</span>
          </div>
          <div>
            <strong>$0</strong>
            <span>cost to you — providers pay our fee</span>
          </div>
          <div>
            <strong>1–2 days</strong>
            <span>to your personalized quote</span>
          </div>
        </div>
      </section>

      {/* Procedures */}
      <section id="procedures" className="section">
        <div className="container">
          <h2>Popular procedures &amp; real savings</h2>
          <p className="section-sub">
            Indicative all-in ranges. Your exact quote depends on your case and chosen provider.
          </p>
          <div className="cards">
            {procedures.map((p) => (
              <article key={p.name} className="card">
                <h3>{p.name}</h3>
                <p className="card-desc">{p.desc}</p>
                <div className="prices">
                  <div className="price-us">
                    <span>U.S. average</span>
                    <s>${p.usPrice.toLocaleString()}</s>
                  </div>
                  <div className="price-mx">
                    <span>Mexico from</span>
                    <em>${p.mxPrice.toLocaleString()}</em>
                  </div>
                  <div className="price-save">Save {pctSaving(p.usPrice, p.mxPrice)}%</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section id="destinations" className="section section-alt">
        <div className="container">
          <h2>Where you&apos;ll go</h2>
          <p className="section-sub">
            We only place patients in established medical hubs with strong safety records.
          </p>
          <div className="dest-grid">
            <div className="dest">
              <h3>Los Algodones</h3>
              <p>The dental capital of the world, minutes from Yuma, AZ. Ideal for drive-in dental work.</p>
            </div>
            <div className="dest">
              <h3>Tijuana</h3>
              <p>Bariatric and cosmetic hub across from San Diego. The highest-volume bariatric corridor anywhere.</p>
            </div>
            <div className="dest">
              <h3>Monterrey &amp; Guadalajara</h3>
              <p>Major hospital cities for orthopedic and complex procedures, served by direct U.S. flights.</p>
            </div>
            <div className="dest">
              <h3>Cancún &amp; Puerto Vallarta</h3>
              <p>Care plus recovery: surgery with a beachside recuperation, popular for cosmetic procedures.</p>
            </div>
            <div className="dest">
              <h3>Mexico City</h3>
              <p>The country&apos;s largest concentration of internationally certified hospitals and subspecialists.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section">
        <div className="container">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <span>1</span>
              <div>
                <h3>Tell us what you need</h3>
                <p>Send your request and any records. Free, no obligation.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Get your personalized quote</h3>
                <p>All-in price from 2–3 matched providers within 1–2 business days.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Talk to your surgeon</h3>
                <p>Video or phone consultation before you commit to anything.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <h3>We coordinate the trip</h3>
                <p>Scheduling, recovery accommodation guidance, airport transfer options, and pre-op checklist.</p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <h3>Care and follow-up</h3>
                <p>Your coordinator checks in during recovery and after you&apos;re home.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Quote form */}
      <section id="quote" className="section section-alt">
        <div className="container quote-wrap">
          <div className="quote-copy">
            <h2>Request your free quote</h2>
            <p>
              No cost, no obligation. A real care coordinator reviews every request —
              we never sell your information.
            </p>
            <ul>
              <li>Response within one business day</li>
              <li>Transparent, itemized pricing</li>
              <li>You choose whether to proceed</li>
            </ul>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section">
        <div className="container">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Is medical tourism to Mexico safe?</summary>
            <p>
              Millions of North Americans receive care in Mexico each year. Safety comes down to
              choosing the right facility — that&apos;s our job. We only work with licensed hospitals
              and clinics (many nationally certified), board-certified physicians, and we verify
              credentials before adding any partner. We also publish honest safety guidance for each city.
            </p>
          </details>
          <details>
            <summary>How much can I actually save?</summary>
            <p>
              Typically 40–70% versus U.S. hospital pricing — even after flights and hotels.
              Dental and bariatric procedures often save more; complex orthopedics still commonly
              save 50%+. You&apos;ll see an itemized quote before committing.
            </p>
          </details>
          <details>
            <summary>What if something goes wrong?</summary>
            <p>
              We require partner facilities to carry malpractice insurance and we plan follow-up
              care with you in advance. Collapse Health is a facilitator, not a healthcare
              provider — clinical care is delivered by the independent providers we match you
              with, and we make sure you understand exactly who is responsible for what, in writing.
            </p>
          </details>
          <details>
            <summary>Do I need to speak Spanish?</summary>
            <p>No. Partner hospitals in our network have English-speaking staff, and your care coordinator is English-speaking.</p>
          </details>
          <details>
            <summary>Will my U.S. doctor follow up with me after?</summary>
            <p>
              Many will. We provide complete procedure records in English, and we help coordinate
              post-operative communication with your home physician where needed.
            </p>
          </details>
          <details>
            <summary>How does Collapse Health make money?</summary>
            <p>
              Partner providers pay us a referral fee when a patient books — you never pay us a cent,
              and it doesn&apos;t change your price. We disclose every arrangement up front.
            </p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <p className="logo">Collapse<span>Health</span></p>
            <p>A Collapse Technologies company.</p>
          </div>
          <nav>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@collapsetechnologies.com">Contact</a>
          </nav>
        </div>
        <div className="container disclaimer">
          <p>
            Collapse Health is a medical travel facilitator. We do not practice medicine,
            employ physicians, or provide healthcare services. All clinical care is provided
            by independent, licensed Mexican providers. Savings figures are indicative
            comparisons against typical U.S. list prices and are not a guarantee. Content on
            this site is informational and is not medical advice. Consult your physician
            before traveling for any procedure.
          </p>
          <p>© {new Date().getFullYear()} Collapse Technologies. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
