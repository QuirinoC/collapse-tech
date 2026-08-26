"use client";

import { useState } from "react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const AUDIENCES = [
  {
    id: "01",
    title: "Beauty",
    note: "GRWM, skincare routines, tutorials and honest first-impression formats.",
    signal: "GRWM / reviews / routines",
    tone: "tone-pink",
  },
  {
    id: "02",
    title: "Fashion",
    note: "Outfit edits, thrift flips and style creators people actually save.",
    signal: "Hauls / OOTD / styling",
    tone: "tone-lilac",
  },
  {
    id: "03",
    title: "Wellness",
    note: "Daily rituals, self-care and feel-good creators with loyal communities.",
    signal: "Rituals / reset / self-care",
    tone: "tone-mint",
  },
  {
    id: "04",
    title: "Food",
    note: "Taste tests, recipes and craveable short-form product moments.",
    signal: "Taste tests / recipes / finds",
    tone: "tone-butter",
  },
  {
    id: "05",
    title: "Fitness",
    note: "Run crews, gym creators and trainers who make movement feel social.",
    signal: "Training / run clubs / gear",
    tone: "tone-sky",
  },
  {
    id: "06",
    title: "Lifestyle",
    note: "The trusted tastemakers behind tomorrow's saved tabs and wish lists.",
    signal: "Home / travel / everyday",
    tone: "tone-peach",
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
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          company: data.get("company"),
          kind: "brand",
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
    } catch {
      setContactStatus("Could not connect. Check your connection and try again.");
    }
  }

  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <div className="hero-copy reveal">
          <p className="eyebrow hero-kicker">
            <span aria-hidden="true">✦</span> Creator campaigns, handled
          </p>
          <h1>
            Make your brand{" "}
            <em>impossible</em>
            <br /> to scroll past.
          </h1>
          <p className="lede">
            One brief unlocks a handpicked crew of creators your audience
            already trusts. We handle the deals, deadlines and payouts.
          </p>
          <div className="hero-actions">
            <a href="/signup" className="button">
              Build my campaign <span>↗</span>
            </a>
            <a href="/creators" className="text-link">
              Meet the creators <span>→</span>
            </a>
          </div>
          <div className="hero-proof" aria-label="Platform benefits">
            <span><i>✓</i> Vetted creators</span>
            <span><i>✓</i> One payment</span>
            <span><i>✓</i> Verified delivery</span>
          </div>
        </div>
        <CampaignPreview />
      </section>

      <div className="culture-strip" aria-label="Supported creator categories">
        <div>
          <span>Beauty</span><i>✦</i><span>Fashion</span><i>✦</i>
          <span>Wellness</span><i>✦</i><span>Food</span><i>✦</i>
          <span>Fitness</span><i>✦</i><span>Lifestyle</span><i>✦</i>
        </div>
      </div>

      <section className="section" id="audiences">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Every corner of culture</p>
            <h2>Find your people.</h2>
          </div>
          <p className="section-intro">
            We match your brief to creators by content, audience, engagement
            and budget — not just follower count.
          </p>
        </div>
        <div className="discipline-grid">
          {AUDIENCES.map((item) => (
            <article key={item.id} className={`discipline-card ${item.tone}`}>
              <div className="niche-top">
                <span>{item.id}</span>
                <i>↗</i>
              </div>
              <h3>{item.title}</h3>
              <p>{item.note}</p>
              <span className="niche-signal">{item.signal}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <span className="manifesto-sticker">One brief</span>
        <p className="eyebrow">The smarter way to launch</p>
        <p>One brand.<br />A whole feed<br /><em>talking.</em></p>
        <div className="manifesto-note">
          <span>01</span>
          <p>Skip fifty DMs, scattered contracts and mystery results. We turn
          your campaign into a coordinated creator moment.</p>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <div>
            <p className="eyebrow">From idea to everywhere</p>
            <h2>We make it easy.</h2>
          </div>
          <p className="section-intro">Five clear steps. One accountable partner.</p>
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
            body="Your total budget includes our flat 18% fee. The remaining 82% is split across the creator slots and held until work is approved."
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
        <div className="split-grid value-grid">
          <div className="value-card brand-card">
            <p className="eyebrow">Why brands switch</p>
            <h3>No subscriptions. One contract.</h3>
            <p>
              Agencies charge retainers; tools charge seats and still leave you
              negotiating with fifty creators. Here you deal with one platform,
              one agreement, one invoice — and reach many accounts at once.
            </p>
          </div>
          <div className="value-card creator-value-card">
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
          <div>
            <p className="eyebrow">No mystery math</p>
            <h2>Fees, plainly.</h2>
          </div>
          <p className="section-intro">One line item. No retainers, subscriptions or hidden deductions.</p>
        </div>
        <div className="flow-list fee-list">
          <FlowStep
            mark="You pay"
            title="One all-in campaign budget"
            body="A $5,000 campaign allocates $4,100 to creator payouts and $900 to our fee. No additional software subscription or agency retainer."
          />
          <FlowStep
            mark="Creators receive"
            title="100% of the quoted payout"
            body="Each creator sees their exact slot payout before accepting. Our fee is reserved at campaign funding and never deducted again."
          />
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Good questions</p>
            <h2>Let&apos;s clear it up.</h2>
          </div>
          <p className="section-intro">Everything both sides of the market ask first.</p>
        </div>
        <div className="faq-list">
          {FAQS.map((faq, index) => (
            <div key={faq.q} className="faq-item">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                className="faq-question"
                aria-expanded={openFaq === index}
              >
                <span>{faq.q}</span>
                <i aria-hidden="true">{openFaq === index ? "−" : "+"}</i>
              </button>
              {openFaq === index && <p>{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-heading">
          <p className="eyebrow">Your next launch starts here</p>
          <h2>Let&apos;s make them <em>want it.</em></h2>
          <p>
            Tell us what you&apos;re launching and who should care. We&apos;ll
            return with a curated creator mix and a clear fixed price.
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

function CampaignPreview() {
  return (
    <div className="campaign-preview reveal" aria-label="Example creator campaign performance">
      <span className="spark spark-one" aria-hidden="true">✦</span>
      <span className="spark spark-two" aria-hidden="true">✦</span>
      <article className="ugc-card">
        <div className="ugc-media">
          <div className="ugc-author">
            <span className="avatar">LK</span>
            <span><strong>@lenaglow</strong><small>Paid partnership</small></span>
            <i>•••</i>
          </div>
          <div className="product-shot">
            <span>NEW</span>
            <strong>GLOW<br />DROP</strong>
            <i>skin + sun</i>
          </div>
          <div className="ugc-caption">
            <span>♡ 48.2K</span><span>↗ 12.4K</span><span>▱ 8.7K</span>
          </div>
        </div>
        <p><strong>The glow is unreal ✨</strong> My new 7am routine with @sundaylab</p>
      </article>
      <aside className="match-card">
        <span className="mini-label">Creator match</span>
        <div className="avatar-row">
          <span>LK</span><span>AM</span><span>JR</span><i>+9</i>
        </div>
        <strong>12 creators ready</strong>
        <small>Beauty · 18–24 · TikTok</small>
      </aside>
      <aside className="insight-card">
        <span className="mini-label">Campaign pulse</span>
        <strong>3.8M</strong>
        <span>projected reach <i>↗ 24%</i></span>
        <div className="mini-chart" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
      </aside>
      <aside className="escrow-badge">
        <span aria-hidden="true">✓</span>
        <p><strong>Budget protected</strong><small>Released on approval</small></p>
      </aside>
    </div>
  );
}
