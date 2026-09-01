import Link from "next/link";

export const metadata = {
  title: "Trust Circle Privacy | Collapse Technologies",
  description:
    "How Trust Circle holds location in escrow, who can look, and how to delete your account.",
  alternates: { canonical: "/trust/privacy" },
};

export default function TrustPrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust Circle · Privacy</p>
      <h1>We do not sell location.</h1>
      <div className="legal-copy">
        <p>Last updated 30 August 2026. This policy covers the Trust Circle iOS app and the Trust API.</p>
        <p>
          Trust Circle is operated by Collapse Technologies. Contact{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
        </p>
        <p>We collect:</p>
        <ul>
          <li>Account identifiers from Sign in with Apple (subject, and a display name when you provide one).</li>
          <li>A unique handle you choose (letters, numbers, underscore). Completing it is required before the map. Phone number is not collected for onboarding.</li>
          <li>Location points you send while sharing is on, held in escrow so a trusted adult peer can look if they confirm.</li>
          <li>Presence without coordinates: last active, battery, got-home, check-in.</li>
          <li>Look events (who looked, when, history window).</li>
          <li>Share settings per person (Until they look, Always, For a while).</li>
          <li>Circle subscription status from StoreKit. We receive an entitlement, not your card number.</li>
        </ul>
        <p>
          We do not sell location. There are no ads and no data brokerage. Sealed people’s
          coordinates are not shown until Always, For a while, or a confirmed Look. Looking is
          never silent.
        </p>
        <p>
          Location history is kept long enough for a two-hour look (24 hours if Circle covers the
          pair), then pruned. Look logs are kept 30 days on Free and one year on Circle.
        </p>
        <p>
          In the Trust Circle iOS app, Settings → Delete account removes your Sign in with Apple identity
          mapping, location, presence, circle membership, look history, push tokens, and Circle
          entitlement on our servers.
        </p>
      </div>
      <Link className="text-link" href="/trust/terms">
        Terms
      </Link>
    </main>
  );
}
