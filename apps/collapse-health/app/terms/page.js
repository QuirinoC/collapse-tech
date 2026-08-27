import Link from "next/link";

export const metadata = {
  title: "Terms of Use — Collapse Health",
  description: "Terms governing use of the Collapse Health concept-preview website.",
};

export default function Terms() {
  return (
    <main className="legal">
      <div className="container">
        <Link href="/">← Back to home</Link>
        <h1>Terms of Use</h1>
        <p className="updated">Last updated: August 2026</p>
        <h2>1. Current status</h2>
        <p>
          Collapse Health is a work in progress and is <strong>not currently operating</strong>.
          We are not accepting patients, providing referrals, arranging travel, taking bookings,
          handling payments, or offering health-travel services. This site is an informational
          concept preview only and is not an offer of services.
        </p>
        <h2>2. No medical, provider, insurance, or travel advice</h2>
        <p>
          Collapse Health is not a medical provider, clinician, hospital, insurer, travel agency,
          or emergency service. We do not diagnose, treat, assess, vet, certify, endorse, or
          recommend any provider, facility, procedure, destination, price, savings, or insurance
          option. Do not rely on this site when making healthcare, travel, or insurance decisions.
        </p>
        <h2>3. Emergencies</h2>
        <p>
          Do not use this site or its contact address for urgent or emergency help. Contact local
          emergency services or 911 immediately in an emergency.
        </p>
        <h2>4. No launch-update registration</h2>
        <p>
          This preview does not collect registrations, contact details, or launch-update consent. Do
          not submit medical records, symptoms, treatment, insurance, or other sensitive health
          information through this site.
        </p>
        <h2>5. No current operating terms</h2>
        <p>
          Any future service, if one is ever offered, would require separately reviewed terms,
          privacy disclosures, and operational safeguards before it is announced. Nothing on this
          preview promises that a service will launch or describes future services as available.
        </p>
      </div>
    </main>
  );
}
