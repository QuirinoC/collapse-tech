import Link from "next/link";

export const metadata = {
  title: "Trust | Collapse Technologies",
  description:
    "Location stays hidden until someone looks. No ads. We do not sell location.",
  alternates: {
    canonical: "/trust",
  },
  openGraph: {
    title: "Trust | Collapse Technologies",
    description:
      "Location stays hidden until someone looks.",
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
      <p className="eyebrow">Trust</p>
      <h1>Location stays<br />hidden until they look.</h1>
      <div className="legal-copy">
        <p>
          Trust, by Collapse Technologies, is location sharing for iPhone. Sign in with
          Apple, pick a handle, and add someone you choose. A look is one snapshot and
          sends a receipt to the person being looked at. Sharing stays off until you
          turn it on. We do not sell location. There are no ads.
        </p>
        <p>
          Plus is optional, on your own account, and is not shared with the people you
          add. Plus is $7.99 per month or $69.99 per year, with a 7-day free trial,
          auto-renewing through Apple on iPhone. Cancel any time in iOS Settings →
          Apple ID → Subscriptions.
        </p>
        <p>
          Verification texts are optional. The consent screen, privacy policy, and terms
          are at{" "}
          <Link href="/trust/sms">/trust/sms</Link>.
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
