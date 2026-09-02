import Link from "next/link";

export const metadata = {
  title: "Trust Circle | Collapse Technologies",
  description:
    "Adult-peer location escrow. Location stays hidden until someone looks. No ads. We do not sell location.",
  alternates: {
    canonical: "/trust",
  },
  openGraph: {
    title: "Trust Circle | Collapse Technologies",
    description:
      "Adult-peer location escrow. Location stays hidden until someone looks.",
    siteName: "Collapse Technologies",
    type: "website",
    url: "/trust",
  },
};

export default function TrustPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust Circle</p>
      <h1>Location stays<br />hidden until they look.</h1>
      <div className="legal-copy">
        <p>
          Trust Circle, by Collapse Technologies, is adult-peer location escrow for
          iPhone. Sign in with Apple, pick a handle, invite someone you trust. A look
          returns live location plus the last two hours, after a confirm, and sends a
          quiet receipt to the person being looked at. Circle is optional. One paid
          seat covers unpaid people in the circle. We do not sell location. There
          are no ads.
        </p>
        <p>
          Circle is $7.99 per month or $69.99 per year, with a 7-day free trial,
          auto-renewing through Apple on iPhone. Cancel any time in iOS Settings →
          Apple ID → Subscriptions.
        </p>
      </div>
      <p>
        <Link className="text-link" href="/trust/privacy">
          Privacy
        </Link>
        {" · "}
        <Link className="text-link" href="/trust/terms">
          Terms
        </Link>
        {" · "}
        <Link className="text-link" href="/trust/support">
          Support
        </Link>
      </p>
    </main>
  );
}
