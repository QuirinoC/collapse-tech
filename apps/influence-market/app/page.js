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
    a: "Influence.Market is designed around curated, per-campaign creator work rather than a software subscription. Payment funding is not currently available on the production site.",
  },
  {
    q: "When does my budget leave my account?",
    a: "The production site does not currently collect campaign payments. Funding will remain unavailable until a processor-backed payment flow is launched.",
  },
  {
    q: "What if a creator underdelivers?",
    a: "Deliverable and dispute terms will be presented before payment funding is launched. No funds are currently collected or held through this site.",
  },
  {
    q: "Do creators pay or sign exclusivity?",
    a: "Creators can create a profile without a fee or exclusivity commitment. Paid work is not currently available through the production site.",
  },
  {
    q: "Which platforms can creators list?",
    a: "Creators can list TikTok, YouTube, Instagram, Facebook, X, and Twitch channels, along with the topics and follower counts they provide.",
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
            already trusts. We help organize briefs, creator profiles, and
            proposed campaign terms.
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
            <span><i>✓</i> Curated briefs</span>
            <span><i>✓</i> Creator profiles</span>
            <span><i>✓</i> Payment launch in progress</span>
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
            Shape your brief around the content, channels, audience, and budget
            you want to reach.
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
            body="Build a proposed roster from creator profiles matched to your brief, channels, and budget."
          />
          <FlowStep
            mark="Step 03 — Funding"
            title="Payment launch in progress"
            body="The production site does not currently collect or hold funds. Processor-backed funding will be announced when available."
          />
          <FlowStep
            mark="Step 04 — Ship"
            title="Creators publish"
            body="Creator delivery workflows are available only after payment funding launches."
          />
          <FlowStep
            mark="Step 05 — Release"
            title="Verify, then pay"
            body="Approval and payout workflows are not available on the production site yet."
          />
        </div>
      </section>

      <section className="section" id="why-us">
        <div className="split-grid value-grid">
          <div className="value-card brand-card">
            <p className="eyebrow">Why brands switch</p>
            <h3>Curated campaign planning.</h3>
            <p>
              Build a campaign brief, explore creator profiles, and prepare a
              proposed roster without representing unavailable payment services
              as live.
            </p>
          </div>
          <div className="value-card creator-value-card">
            <p className="eyebrow">Why creators stay</p>
            <h3>Profiles without exclusivity.</h3>
            <p>
              Creators can maintain a profile without a fee or exclusivity
              requirement. Payment-backed assignments are not currently live.
            </p>
          </div>
        </div>
        <div className="stat-band">
          <StatCell value="18%" label="Planned campaign fee" />
          <StatCell value="$0" label="Profile signup fee" />
          <StatCell value="Soon" label="Payment funding" />
        </div>
      </section>

      <section className="section" id="fees">
        <div className="section-heading">
          <div>
            <p className="eyebrow">No mystery math</p>
            <h2>Fees, plainly.</h2>
          </div>
          <p className="section-intro">Proposed pricing for the future payment launch.</p>
        </div>
        <div className="flow-list fee-list">
          <FlowStep
            mark="You pay"
            title="A future all-in campaign budget"
            body="A planned $5,000 campaign would allocate $4,100 to creator payouts and $900 to our fee. The production site does not collect this payment today."
          />
          <FlowStep
            mark="Creators receive"
            title="Quoted rates before acceptance"
            body="If payment funding launches, creators will see their exact slot payout before accepting. No payout is currently available through this site."
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
        <strong>Example roster</strong>
        <small>Illustrative creator plan</small>
      </aside>
      <aside className="insight-card">
        <span className="mini-label">Illustrative campaign preview</span>
        <strong>Example only</strong>
        <span>Reach estimates are not live data</span>
        <div className="mini-chart" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
      </aside>
      <aside className="escrow-badge">
        <span aria-hidden="true">✓</span>
        <p><strong>Payments unavailable</strong><small>Funding launch in progress</small></p>
      </aside>
    </div>
  );
}
