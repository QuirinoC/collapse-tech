import Link from "next/link";
import LeadForm from "./LeadForm";
import { procedures } from "./data";

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
            Join the waitlist
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">A planned medical travel service — currently in development</p>
          <h1>
            Considering care in Mexico?
            <br />
            We&apos;re building a <span className="accent">safer way to get there</span>.
          </h1>
          <p className="sub">
            Collapse Health is developing a service to connect American and Canadian patients
            with licensed Mexican hospitals and specialists. We&apos;re not operating yet —
            join the waitlist and we&apos;ll let you know when we launch.
          </p>
          <div className="hero-cta">
            <a href="#quote" className="btn btn-primary">
              Join the waitlist
            </a>
            <a href="#how" className="btn btn-ghost">
              What we&apos;re planning →
            </a>
          </div>
          <ul className="hero-points">
            <li>Planned: licensed, credentialed partner facilities</li>
            <li>Planned: transparent, itemized pricing</li>
            <li>Planned: English-speaking care coordination</li>
          </ul>
        </div>
      </section>

      {/* Info strip */}
      <section className="strip">
        <div className="container strip-grid">
          <div>
            <strong>Licensed only</strong>
            <span>our plan is to work exclusively with facilities holding valid sanitary licenses</span>
          </div>
          <div>
            <strong>Credential-checked</strong>
            <span>planned verification of physician credentials before any partner is added</span>
          </div>
          <div>
            <strong>English-speaking</strong>
            <span>planned care coordination in English from first contact to follow-up</span>
          </div>
          <div>
            <strong>Coming soon</strong>
            <span>this is a concept preview — no services are offered yet</span>
          </div>
        </div>
      </section>

      {/* Procedures */}
      <section id="procedures" className="section">
        <div className="container">
          <h2>Procedures patients commonly consider in Mexico</h2>
          <p className="section-sub">
            When operating, every patient receives itemized quotes directly from providers
            for their specific case — no generic price lists, no surprises.
          </p>
          <div className="cards">
            {procedures.map((p) => (
              <article key={p.name} className="card">
                <h3>{p.name}</h3>
                <p className="card-desc">{p.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section id="destinations" className="section section-alt">
        <div className="container">
          <h2>Where we plan to operate</h2>
          <p className="section-sub">
            Cities we are researching for established medical hubs. No partnerships have been
            finalized and no referrals are being made.
          </p>
          <div className="dest-grid">
            <div className="dest">
              <h3>Los Algodones</h3>
              <p>A well-known dental destination near Yuma, AZ, popular for drive-in dental care.</p>
            </div>
            <div className="dest">
              <h3>Tijuana</h3>
              <p>A high-volume bariatric and cosmetic corridor across from San Diego.</p>
            </div>
            <div className="dest">
              <h3>Monterrey &amp; Guadalajara</h3>
              <p>Major hospital cities for orthopedic and complex procedures, served by direct U.S. flights.</p>
            </div>
            <div className="dest">
              <h3>Cancún &amp; Puerto Vallarta</h3>
              <p>Cities combining medical facilities with recuperation-friendly environments.</p>
            </div>
            <div className="dest">
              <h3>Mexico City</h3>
              <p>The country&apos;s largest concentration of hospitals and subspecialists.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section">
        <div className="container">
          <h2>What we&apos;re planning</h2>
          <p className="section-sub">
            The intended patient experience once the service launches. None of this is
            available today.
          </p>
          <ol className="steps">
            <li>
              <span>1</span>
              <div>
                <h3>Tell us what you need</h3>
                <p>Planned: share your request and records — free, no obligation.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Receive matched provider options</h3>
                <p>Planned: itemized pricing from vetted providers for your case.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Talk to the clinician first</h3>
                <p>Planned: consultation before any commitment, so you can judge fit yourself.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <h3>Trip coordination support</h3>
                <p>Planned: scheduling guidance, recovery accommodation guidance, and pre-travel checklists.</p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <h3>Follow-up</h3>
                <p>Planned: coordinator check-ins during recovery and after returning home.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Quote form */}
      <section id="quote" className="section section-alt">
        <div className="container quote-wrap">
          <div className="quote-copy">
            <h2>Join the waitlist</h2>
            <p>
              We&apos;re not accepting patients yet. Leave your details and we&apos;ll notify
              you when the service launches — no spam, and we never sell your information.
            </p>
            <ul>
              <li>Launch notification only</li>
              <li>No obligation, unsubscribe anytime</li>
              <li>Nothing to pay, ever, for updates</li>
            </ul>
          </div>
          <div className="form-card">
            <LeadForm />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section">
        <div className="container">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Is medical tourism to Mexico safe?</summary>
            <p>
              Many North Americans receive care in Mexico each year, and outcomes depend heavily
              on choosing reputable, licensed facilities. When we launch, our plan is to work only
              with facilities holding valid sanitary licenses, to verify physician credentials
              before adding any partner, and to publish safety guidance for each destination.
            </p>
          </details>
          <details>
            <summary>What does care in Mexico cost?</summary>
            <p>
              Costs vary widely by procedure, provider, case complexity, and time — which is
              exactly why we plan not to publish generic price lists. Publicly reported rates
              suggest care in Mexico can cost substantially less than comparable U.S. hospital
              pricing. When operating, our process is built around itemized written quotes from
              providers for your specific case before any commitment.
            </p>
          </details>
          <details>
            <summary>What if something goes wrong?</summary>
            <p>
              When operating, we intend to require partner facilities to carry malpractice
              insurance and to help you plan follow-up care in advance. Collapse Health would be a
              facilitator, not a healthcare provider — clinical care would be delivered by the
              independent providers we match you with, with responsibilities documented in writing.
            </p>
          </details>
          <details>
            <summary>Do I need to speak Spanish?</summary>
            <p>Many Mexican hospitals in major medical hubs have English-speaking staff. We also intend to provide English-speaking coordination when the service launches.</p>
          </details>
          <details>
            <summary>Will my U.S. doctor follow up with me after?</summary>
            <p>
              Many will. We intend to provide procedure records in English and help coordinate
              post-operative communication with your home physician where needed.
            </p>
          </details>
          <details>
            <summary>Will my insurance cover treatment in Mexico?</summary>
            <p>
              Almost certainly not. US health insurance — employer plans, ACA marketplace plans,
              HMOs, Medicare, and Medicaid — generally does not pay for planned (non-emergency)
              care delivered outside the United States, regardless of referrals. Travel insurance
              covers emergencies abroad only, never scheduled surgery. This is exactly why the
              self-pay market exists: the service is designed for patients paying directly,
              whose savings versus US prices are largest. Some border-area insurers do offer
              plans with Mexican provider networks, but those come with their own providers.
              Check your policy documents for the definitive answer on your specific plan.
            </p>
          </details>
          <details>
            <summary>How would Collapse Health make money?</summary>
            <p>
              Our intended model is that partner providers pay us a referral fee when a patient
              books — patients would not pay us directly, and that arrangement would be disclosed
              up front.
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
            <strong>Status:</strong> Collapse Health is a work in progress and is not
            currently operating. We are not accepting patients, providing referrals,
            arranging travel, or offering any services at this time. Nothing on this site
            is an offer of services, medical advice, or a price quote.
          </p>
          <p>
            When operating, Collapse Health intends to act solely as a medical travel
            facilitator. We do not and will not practice medicine, employ physicians, or
            provide healthcare services; all clinical care would be provided by independent,
            licensed Mexican providers. Content on this site is informational only and is
            not medical advice — consult a qualified physician before making any healthcare
            or travel decision.
          </p>
          <p>© {new Date().getFullYear()} Collapse Technologies. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
