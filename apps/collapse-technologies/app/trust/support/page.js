import Link from "next/link";

export const metadata = {
  title: "Trust Circle Support | Collapse Technologies",
  description:
    "Support for the Trust Circle iOS app: handles, looks and receipts, Circle billing, and account deletion.",
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
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>. Tell
          us your handle (not your password — there is none; Trust Circle uses Sign in with Apple).
        </p>

        <p><strong>Getting started</strong></p>
        <p>
          Sign in with Apple, choose a unique handle, then invite a trusted adult with
          &ldquo;I trust you with my location.&rdquo; Sharing is off until you turn it on. For
          looks to work while the app is closed, allow location <em>Always</em> in iOS Settings.
        </p>

        <p><strong>Looks and receipts</strong></p>
        <p>
          When someone looks at you, you get a push notification saying who looked and how much
          history they can see. If receipts are not arriving, check that notifications are allowed
          for Trust Circle in iOS Settings and that you are signed in on that phone.
        </p>

        <p><strong>Circle billing</strong></p>
        <p>
          Circle is $7.99/month or $69.99/year with a 7-day free trial, billed by Apple. Manage,
          cancel, or request a refund in iOS Settings → Apple ID → Subscriptions, or at{" "}
          <a href="https://support.apple.com/billing">support.apple.com/billing</a>. If you paid
          and Circle is not unlocked, open Settings in the app and tap Restore purchases.
        </p>

        <p><strong>Delete your account</strong></p>
        <p>
          In the app: Settings → Delete account. That removes your identity mapping, handle,
          location, presence, looks, share settings, push tokens, and circle membership from our
          servers. You can also email us and we will delete it for you.
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
        <Link className="text-link" href="/trust">
          Trust Circle
        </Link>
      </p>
    </main>
  );
}
