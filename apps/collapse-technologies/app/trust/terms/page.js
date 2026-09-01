import Link from "next/link";

export const metadata = {
  title: "Trust Circle Terms | Collapse Technologies",
  description: "Terms for using Trust Circle, Circle subscriptions, and adult-peer location escrow.",
  alternates: { canonical: "/trust/terms" },
};

export default function TrustTermsPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust Circle · Terms</p>
      <h1>Adult peers. You decide who looks.</h1>
      <div className="legal-copy">
        <p>Last updated 30 August 2026.</p>
        <p>
          Trust Circle is for people 17 and older. You decide who can look, and you can revoke. Looking
          requires an explicit confirm. Coordinates stay hidden until then, unless you set Always
          or For a while for that person.
        </p>
        <p>
          Circle is an optional auto-renewing Apple subscription ($7.99/month or $69.99/year, 7-day
          trial). Payment is charged to your Apple ID. The subscription renews unless you cancel at
          least 24 hours before the end of the current period. Manage or cancel in Settings → Apple
          ID → Subscriptions. Family Sharing is off. Looking at one trusted person is included
          without Circle. One paid Circle seat covers unpaid people in that circle.
        </p>
        <p>
          We do not sell location and we do not run ads. The service is provided as-is. Contact{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
        </p>
      </div>
      <Link className="text-link" href="/trust/privacy">
        Privacy
      </Link>
    </main>
  );
}
