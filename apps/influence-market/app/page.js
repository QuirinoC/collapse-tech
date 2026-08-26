"use client";

import { useState } from "react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const AUDIENCES = [
  {
    id: "01",
    title: "Fitness",
    note: "Trainers, run crews, gym creators with engaged local followings.",
  },
  {
    id: "02",
    title: "Beauty",
    note: "GRWM, skincare routines and honest product-test formats.",
  },
  {
    id: "03",
    title: "Gaming",
    note: "Streamers and short-form clip channels across Twitch and TikTok.",
  },
  {
    id: "04",
    title: "Food",
    note: "Recipe pages, taste tests and restaurant-grade production.",
  },
  {
    id: "05",
    title: "Finance",
    note: "Explainer channels reaching high-intent professional audiences.",
  },
  {
    id: "06",
    title: "Travel",
    note: "Destination storytellers with cinematic long-form reach.",
  },
];

const FAQS = [
  {
    q: "How is this different from an influencer SaaS tool?",
    a: "Those sell software subscriptions from $500 to $2,500+ per month and leave the work to you. Influence.Market is the agency: we source, vet, contract, escrow and verify — you pay per campaign, never a retainer.",
  },
  {
    q: "When does my budget leave my account?",
    a: "Once, upfront — when you approve your creator roster. Funds are held by the platform and only released to creators after their content is approved and verified as published.",
  },
  {
    q: "What if a creator underdelivers?",
    a: "You reject the submission. The creator revises or the funds for that slot stay in escrow — they are never released without your sign-off.",
  },
  {
    q: "Do creators pay or sign exclusivity?",
    a: "No. Creators join free, keep full independence, and get paid on verified delivery. Guaranteed-paid campaigns mean zero risk for trying us.",
  },
  {
    q: "Which platforms do you cover?",
    a: "TikTok, YouTube, Instagram, Facebook and X today — with channel metrics (followers, engagement, topics) powering curation and search rank.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(-1);
  const [contactStatus, setContactStatus] = useState("");

  async function submitContact(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setContactStatus("Sending…");
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        company: data.get("company"),
        message: data.get("message"),
      }),
    });
    if (response.ok) {
      event.target.reset();
      setContactStatus("Received. We reply within one business day.");
    } else {
      const { error } = await response.json().catch(() => ({}));
      setContactStatus(error || "Could not send. Try again.");
    }
  }

  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <div className="reveal">
          <p className="eyebrow">The agency-marketplace hybrid</p>
          <h1>
            One brief.
            <br />
            Every audience.
          </h1>
          <p className="lede">
            Fund a multi-creator campaign in one payment. We hold the budget,
            curate vetted creators to your targets, and release pay only when
            deliverables are verified.
          </p>
          <div className="hero-actions">
            <a href="/signup" className="button">
              Launch a campaign <span>↗</span>
            </a>
            <a href="/creators" className="text-link">
              Browse creators <span>→</span>
            </a>
          </div>
        </div>
        <div className="signal-field" aria-hidden="true">
          <canvas className="orbit-canvas" />
          <Orbits />
        </div>
      </section>

      <section className="section" id="audiences">
        <div className="section-heading">
          <h2>Curated niches</h2>
          <p className="eyebrow">Matched to followers, topics &amp; budget</p>
        </div>
        <div className="discipline-grid">
          {AUDIENCES.map((item) => (
            <article key={item.id} className="discipline-card">
              <span>{item.id}</span>
              <i>◎</i>
              <h3>{item.title}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <p className="eyebrow">Our position</p>
        <p>
          Stop buying software.
          <br />
          Start buying <em>reach</em> —<br />
          verified before it&apos;s paid.
        </p>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <h2>The flow</h2>
          <p className="eyebrow">Brief → roster → escrow → verified payout</p>
        </div>
        <div className="flow-list">
          <FlowStep
            mark="Step 01 — Brief"
            title="Describe the promotion"
            body="Product, platforms (TikTok, YouTube, Instagram…), demographics, topics and total budget. We translate it into creator criteria."
          />
          <FlowStep
            mark="Step 02 — Roster"
            title="Curate and approve creators"
            body="We surface creators matched to follower counts, content topics and your budget. You accept or decline every applicant."
          />
          <FlowStep
            mark="Step 03 — Escrow"
            title="Fund once, upfront"
            body="A single payment covers all creator slots plus our flat 18% fee. Funds sit in escrow — no creator is paid yet."
          />
          <FlowStep
            mark="Step 04 — Ship"
            title="Creators publish"
            body="Creators receive brief instructions and product (shipped direct, seeded by us, or self-purchased). They submit content links."
          />
          <FlowStep
            mark="Step 05 — Release"
            title="Verify, then pay"
            body="Approve each submission and its payout releases instantly. Reject it and that slot's funds stay held until it's right."
          />
        </div>
      </section>

      <section className="section" id="why-us">
        <div className="split-grid">
          <div>
            <p className="eyebrow">Why brands switch</p>
            <h3>No subscriptions. One contract.</h3>
            <p>
              Agencies charge retainers; tools charge seats and still leave you
              negotiating with fifty creators. Here you deal with one platform,
              one agreement, one invoice — and reach many accounts at once.
            </p>
          </div>
          <div>
            <p className="eyebrow">Why creators stay</p>
            <h3>Paid on delivery, guaranteed.</h3>
            <p>
              No exclusivity, no upfront cost, no chasing invoices. Campaigns
              arrive pre-funded: when your content is approved, your payout
              releases immediately.
            </p>
          </div>
        </div>
        <div className="stat-band">
          <StatCell value="18%" label="Flat fee per campaign" />
          <StatCell value="$0" label="Subscriptions or retainers" />
          <StatCell value="NET-0" label="Creator payouts on approval" />
        </div>
      </section>

      <section className="section" id="fees">
        <div className="section-heading">
          <h2>Fees, plainly</h2>
          <p className="eyebrow">One line item. No surprises.</p>
        </div>
        <div className="flow-list">
          <FlowStep
            mark="You pay"
            title="18% of campaign budget"
            body="A $5,000 campaign costs $5,900 total: $5,000 reaches creators, $900 is our entire fee. Compare that to $24,000+/yr for typical agency software."
          />
          <FlowStep
            mark="Creators receive"
            title="100% of their slot"
            body="The 18% covers curation, contracts, escrow and verification — it is never deducted from creator payouts."
          />
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section-heading">
          <h2>Questions</h2>
          <p className="eyebrow">Asked by both sides of the market</p>
        </div>
        <div className="faq-list">
          {FAQS.map((faq, index) => (
            <div key={faq.q} className="faq-item">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                style={{
                  width: "100%", textAlign: "left", border: 0, background: "none",
                  padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: "1.15rem",
                }}
                aria-expanded={openFaq === index}
              >
                {faq.q}
              </button>
              {openFaq === index && <p>{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-heading">
          <p className="eyebrow">Start here</p>
          <h2>Talk scope</h2>
          <p>
            Tell us the audience you need. We&apos;ll come back with a curated
            roster and a fixed price.
          </p>
        </div>
        <form className="contact-form" onSubmit={submitContact}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label className="full">
              Company / brand
              <input name="company" />
            </label>
            <label className="full">
              What are you promoting?
              <textarea name="message" rows={4} required minLength={10} />
            </label>
          </div>
          <button className="button" type="submit">
            Send brief <span>↗</span>
          </button>
          <p className="form-status" aria-live="polite">{contactStatus}</p>
        </form>
      </section>

      <SiteFooter />
    </main>
  );
}

function FlowStep({ mark, title, body }) {
  return (
    <div className="flow-step">
      <span className="step-mark">{mark}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function StatCell({ value, label }) {
  return (
    <div className="stat-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Orbits() {
  return (
    <svg viewBox="0 0 400 400" className="orbit-canvas" aria-hidden="true">
      <circle cx="200" cy="196" r="60" fill="none" stroke="#11110f" strokeWidth="1" opacity=".35" />
      <circle cx="200" cy="196" r="105" fill="none" stroke="#11110f" strokeWidth="1" opacity=".22" />
      <circle cx="200" cy="196" r="150" fill="none" stroke="#11110f" strokeWidth="1" opacity=".12" />
      <circle cx="260" cy="196" r="5" fill="#11110f" />
      <circle cx="126" cy="122" r="4" fill="#11110f" />
      <circle cx="305" cy="288" r="3" fill="#11110f" />
      <circle cx="200" cy="196" r="9" fill="#11110f" />
    </svg>
  );
}
