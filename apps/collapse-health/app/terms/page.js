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
        <h2>1. Current status: not operating</h2>
        <p>
          Collapse Health is a work in progress and is <strong>not currently operating</strong>.
          We are not accepting patients, providing referrals, arranging travel, or offering any
          services. This website is an informational preview only. Nothing on it constitutes an
          offer of services, medical advice, a diagnosis, or a price quote.
        </p>
        <h2>2. Who we would be (if launched)</h2>
        <p>
          If launched, Collapse Health intends to operate as a medical travel facilitator
          under Collapse Technologies — connecting patients in the United States and Canada
          with independent, licensed healthcare providers in Mexico. We are not a healthcare
          provider, hospital, clinic, insurer, or travel agency, and we do not practice medicine.
        </p>
        <h2>3. No medical services; no warranties on clinical outcomes</h2>
        <p>
          All clinical care would be provided solely by independent providers selected by you.
          If launched, using our facilitation services would mean entering into a direct
          relationship with the provider you choose — we would not be a party to that
          relationship, and we would have no responsibility or liability of any kind for the
          medical services a provider delivers or fails to deliver. We intend to make reasonable
          efforts to verify licenses, certifications, and credentials, but medical standards,
          regulation, and outcomes differ by country; you remain responsible for evaluating any
          provider&rsquo;s credentials and accreditation before traveling for care. Individual
          results and recovery experiences vary, and no clinical outcome can be guaranteed.
        </p>
        <h2>4. Compensation disclosure</h2>
        <p>
          Our intended model is that network providers would pay us a referral fee when a
          patient books through us. This would cost the patient nothing extra and would not
          affect quoted prices. Any financial relationship relevant to a specific referral
          would be disclosed upon request.
        </p>
        <h2>5. Pricing information</h2>
        <p>
          All prices shown on this site are illustrative examples based on publicly reported
          market rates. They are not quotes, estimates for any specific case, or guarantees,
          and actual prices vary by provider, case complexity, and time. Any future estimate
          obtained through facilitation would be non-binding until confirmed in writing by the
          provider after in-person examination; final charges may differ from any preliminary
          figure.
        </p>
        <h2>6. Travel and personal responsibility</h2>
        <p>
          Anyone considering medical travel is responsible for their own travel arrangements,
          documentation (e.g., passport), compliance with government travel advisories, and
          follow-up care at home.
        </p>
        <h2>7. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Collapse Technologies&rsquo; total liability
          arising from your use of this website is limited to the amount you paid to us
          (currently zero).
        </p>
        <h2>8. Governing law</h2>
        <p>
          These terms are governed by the laws of the State of Texas, USA, without regard to
          conflict-of-law principles.
        </p>
      </div>
    </main>
  );
}
