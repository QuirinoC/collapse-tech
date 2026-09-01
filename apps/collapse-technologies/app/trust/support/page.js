import Link from "next/link";

export const metadata = {
  title: "Trust Circle Support | Collapse Technologies",
  description: "Support for the Trust Circle iOS app.",
  alternates: { canonical: "/trust/support" },
};

export default function TrustSupportPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust Circle · Support</p>
      <h1>We are here.</h1>
      <div className="legal-copy">
        <p>
          Email{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
        </p>
        <p>
          Delete your account in the Trust Circle iOS app: Settings → Delete account. That removes your
          location, identity, looks, and circle membership.
        </p>
        <p>Manage Circle in Settings → Apple ID → Subscriptions.</p>
      </div>
      <Link className="text-link" href="/trust">
        Trust Circle
      </Link>
    </main>
  );
}
