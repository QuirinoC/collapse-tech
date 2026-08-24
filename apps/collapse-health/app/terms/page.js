import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Collapse Health",
  description: "Terms governing use of Collapse Health facilitation services.",
};

export default function Terms() {
  return (
    <main className="legal">
      <div className="container">
        <Link href="/">← Back to home</Link>
        <h1>Terms of Service</h1>
        <p className="updated">Last updated: August 2026</p>
        <h2>1. Who we are</h2>
        <p>
          Collapse Health is a medical travel facilitator operated by Collapse Technologies.
          We connect patients in the United States and Canada with independent, licensed
          healthcare providers in Mexico. We are not a healthcare provider, hospital,
          clinic, insurer, or travel agency, and we do not practice medicine.
        </p>
        <h2>2. No medical services; no warranties on clinical outcomes</h2>
        <p>
          All clinical care is provided solely by independent providers you select from our
          referrals. We make reasonable efforts to verify licenses, certifications, and
          credentials, but we do not guarantee clinical outcomes and we are not liable for
          the acts or omissions of any provider. You are responsible for discussing risks,
          alternatives, and suitability directly with your treating physician.
        </p>
        <h2>3. Compensation disclosure</h2>
        <p>
          Providers in our network typically pay us a referral fee when you book through us.
          This costs you nothing extra and does not affect the price quoted to you. We will
          disclose any financial relationship relevant to a specific referral upon request.
        </p>
        <h2>4. Travel and personal responsibility</h2>
        <p>
          You are responsible for your own travel arrangements, documentation (e.g., passport),
          compliance with government travel advisories, and follow-up care at home. We provide
          guidance but do not assume responsibility for travel risks.
        </p>
        <h2>5. Quotes and pricing</h2>
        <p>
          Prices shown on this site are indicative ranges based on typical market rates and are
          subject to change. Binding pricing is provided only in a written quote from a specific
          provider.
        </p>
        <h2>6. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Collapse Technologies&rsquo; total liability
          arising from your use of this website or our facilitation services is limited to the
          amount you paid to us (which is typically zero, as providers pay our fee).
        </p>
        <h2>7. Governing law</h2>
        <p>
          These terms are governed by the laws of the State of Texas, USA, without regard to
          conflict-of-law principles.
        </p>
      </div>
    </main>
  );
}
