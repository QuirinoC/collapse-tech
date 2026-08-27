import Link from "next/link";
import LeadForm from "./LeadForm";
import { topics } from "./data";

export default function Home() {
  return (
    <main>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="logo">
            Collapse<span>Health</span>
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#topics">Topics</a>
            <a href="#locations">Locations</a>
            <a href="#status">Status</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a href="#updates" className="btn btn-primary btn-sm">
            Current status
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Concept preview - no services are available</p>
          <h1>
            Exploring a future <span className="accent">health-travel information concept</span>.
          </h1>
          <p className="sub">
            Collapse Health is an early concept from Collapse Technologies. We are not operating
            and do not provide medical advice, clinical care, provider recommendations, referrals,
            bookings, travel arrangements, insurance guidance, or emergency services.
          </p>
          <div className="hero-cta">
            <a href="#status" className="btn btn-ghost">
              Current status
            </a>
          </div>
          <ul className="hero-points">
            <li>No patients or referrals are accepted</li>
            <li>No medical records are collected</li>
            <li>No providers, treatments, prices, or savings are recommended</li>
          </ul>
        </div>
      </section>

      <section className="strip" aria-label="Current service status">
        <div className="container strip-grid">
          <div>
            <strong>Concept stage</strong>
            <span>No health-travel service is operating today</span>
          </div>
          <div>
            <strong>No clinical advice</strong>
            <span>We cannot assess care, providers, or treatment options</span>
          </div>
          <div>
            <strong>No provider claims</strong>
            <span>We do not vet, certify, endorse, or recommend providers</span>
          </div>
          <div>
            <strong>No registrations</strong>
            <span>We are not collecting contact details during this preview</span>
          </div>
        </div>
      </section>

      <section id="topics" className="section">
        <div className="container">
          <h2>Topics under preliminary research</h2>
          <p className="section-sub">
            These broad topics are provided only to describe the concept&apos;s research scope.
            They are not medical information, a recommendation, or an offer to help arrange care.
          </p>
          <div className="cards">
            {topics.map((topic) => (
              <article key={topic} className="card">
                <h3>{topic}</h3>
                <p className="card-desc">
                  We do not assess individual needs or recommend a clinician, facility, or treatment.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="locations" className="section section-alt">
        <div className="container">
          <h2>Locations under preliminary research</h2>
          <p className="section-sub">
            We are reviewing general information about travel to several Mexican cities. No
            partnerships are finalized, and we do not recommend destinations, facilities, or care.
          </p>
          <div className="dest-grid">
            <div className="dest">
              <h3>Los Algodones</h3>
              <p>Border-area travel information is under preliminary review.</p>
            </div>
            <div className="dest">
              <h3>Tijuana</h3>
              <p>Border-area travel information is under preliminary review.</p>
            </div>
            <div className="dest">
              <h3>Monterrey &amp; Guadalajara</h3>
              <p>General city and travel information is under preliminary review.</p>
            </div>
            <div className="dest">
              <h3>Cancún &amp; Puerto Vallarta</h3>
              <p>General city and travel information is under preliminary review.</p>
            </div>
            <div className="dest">
              <h3>Mexico City</h3>
              <p>General city and travel information is under preliminary review.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="status" className="section">
        <div className="container">
          <h2>Current status</h2>
          <p className="section-sub">
            This site is a preview only. Service details have not been finalized, and no
            health-travel operations are available.
          </p>
          <ol className="steps">
            <li>
              <span>1</span>
              <div>
                <h3>No patient intake</h3>
                <p>Do not send us medical records, symptoms, treatment questions, or insurance details.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>No referrals or bookings</h3>
                <p>We do not route people to providers or arrange appointments, travel, or follow-up.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>No launch-update registration</h3>
                <p>We are not collecting contact details or sending launch updates from this preview.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="updates" className="section section-alt">
        <div className="container quote-wrap">
          <div className="quote-copy">
            <h2>Launch updates are unavailable</h2>
            <p>
              This preview does not collect contact details or offer launch updates. It is not a
              channel for medical, travel, insurance, or emergency questions.
            </p>
            <ul>
              <li>No personal, medical, or sensitive health information is collected</li>
              <li>No provider routing, appointment, travel, or payment services</li>
              <li>No launch-update registration is available</li>
            </ul>
          </div>
          <div className="form-card">
            <LeadForm />
          </div>
        </div>
      </section>

      <section id="faq" className="section">
        <div className="container">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Can Collapse Health tell me whether care or travel is safe for me?</summary>
            <p>
              No. We do not provide medical or travel advice and cannot assess a procedure,
              provider, facility, destination, or your individual situation. Speak with qualified
              professionals you choose before making healthcare or travel decisions.
            </p>
          </details>
          <details>
            <summary>Do you recommend, vet, certify, or endorse providers?</summary>
            <p>
              No. We do not currently operate a provider network and make no claims about any
              provider&apos;s credentials, quality, availability, or suitability.
            </p>
          </details>
          <details>
            <summary>Can you quote costs, savings, or insurance coverage?</summary>
            <p>
              No. We do not provide price quotes, savings claims, or insurance-coverage guidance.
              Ask the relevant provider and insurer directly for information about your circumstances.
            </p>
          </details>
          <details>
            <summary>What should I do in an emergency?</summary>
            <p>
              Contact local emergency services or 911 immediately. Do not use this site or any
              future signup form for urgent or emergency help.
            </p>
          </details>
          <details>
            <summary>Can I request launch updates?</summary>
            <p>
              No. This preview does not collect contact details or offer launch-update registration.
              It does not start intake, create a patient relationship, or request health information.
            </p>
          </details>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <p className="logo">Collapse<span>Health</span></p>
            <p>A Collapse Technologies concept.</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
        <div className="container disclaimer">
          <p>
            <strong>Status:</strong> Collapse Health is a work in progress and is not currently
            operating. We are not accepting patients, providing referrals, arranging travel, or
            offering any services at this time. Nothing on this site is an offer of services,
            medical advice, or a price quote.
          </p>
          <p>
            Collapse Health is not a medical provider, clinician, hospital, insurer, travel agency,
            or emergency service. We do not assess or recommend providers, facilities, treatments,
            travel, prices, savings, or insurance coverage. In an emergency, contact local emergency
            services or 911.
          </p>
          <p>© {new Date().getFullYear()} Collapse Technologies. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
