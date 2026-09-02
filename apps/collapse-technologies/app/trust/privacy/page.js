import Link from "next/link";

export const metadata = {
  title: "Trust Circle Privacy Policy | Collapse Technologies",
  description:
    "What Trust Circle collects, how long location is kept, who can look, and how to delete your account.",
  alternates: { canonical: "/trust/privacy" },
};

export default function TrustPrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust Circle · Privacy Policy</p>
      <h1>We do not sell location.</h1>
      <div className="legal-copy">
        <p>
          Last updated 2 September 2026. This policy covers the Trust Circle iOS app and the Trust
          API at trust.collapsetechnologies.com. Trust Circle is made and operated by Collapse
          Technologies. Contact{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
        </p>

        <p><strong>What we collect</strong></p>
        <ul>
          <li>
            Sign in with Apple identity: the stable user identifier Apple gives us for this app,
            and a display name if Apple sends one. Apple may also send an email address (or a Hide
            My Email relay address); we read it only to suggest a display name when Apple sends no
            name. We do not require an email address and we do not send marketing email.
          </li>
          <li>
            Your handle: a unique name you choose (letters, numbers, underscore) after signing in.
            It is how people in your circle identify you. The app does not ask for your phone
            number.
          </li>
          <li>
            Location: precise location points your phone sends while sharing is on. They are held
            in escrow so a trusted adult peer can look, and are pruned on a rolling basis (see
            below).
          </li>
          <li>
            Presence without coordinates: last active time, battery level, whether you got home,
            and manual check-ins.
          </li>
          <li>
            Look receipts and look log: who looked at whom, when, and the history window (2 or 24
            hours). A receipt never contains coordinates.
          </li>
          <li>
            Share modes you set per person: Until they look, Always, or For a while (with its
            end time).
          </li>
          <li>
            Device identifiers for receipts: an app installation ID generated on your phone and
            your Apple Push Notification (APNs) device token, so we can send you a receipt when
            someone looks.
          </li>
          <li>
            Circle subscription status: signed StoreKit transaction records from Apple (product,
            purchase and expiry dates, transaction IDs) and an anonymous app account token. We
            receive an entitlement, never your card number.
          </li>
        </ul>

        <p><strong>How looking works</strong></p>
        <p>
          Sealed people&apos;s coordinates are not shown to anyone until they set Always or For a
          while for you, or until a look is confirmed. Every look sends a push receipt to the
          person being looked at, and is added to their look log. Looking is never silent.
        </p>

        <p><strong>How long we keep it</strong></p>
        <ul>
          <li>
            Location: the server keeps a rolling window of roughly 26 hours and prunes older
            points every time your phone sends new ones. A look shows the last 2 hours, or up to 24
            hours when Circle covers the pair. If you have no trusted people left, your location is
            cleared.
          </li>
          <li>
            Look log: the app shows the last 30 days on Free and one year with Circle. Look events
            stay on our servers until you delete your account.
          </li>
          <li>
            Presence, handle, share modes, push tokens, and subscription records: kept while your
            account exists.
          </li>
        </ul>

        <p><strong>What we do not do</strong></p>
        <p>
          We do not sell location or any other personal data. There are no ads, no ad SDKs, no
          analytics SDKs, and no data brokerage. We do not track you across other apps or websites.
          Data is shared only with Apple (Sign in with Apple, StoreKit, and push notifications)
          and with the hosting providers that run the service.
        </p>

        <p><strong>Where it runs</strong></p>
        <p>
          The Trust API and its Postgres database run on Render in the United States (Oregon),
          behind Cloudflare. These providers see IP addresses and standard request metadata in
          order to deliver the service. Data is encrypted in transit with HTTPS.
        </p>

        <p><strong>Delete your account</strong></p>
        <p>
          In the Trust Circle iOS app, open Settings → Delete account. That deletes your account
          record, Sign in with Apple identity mapping, handle, location points, presence, circle
          memberships and invites, share settings, active and past looks, push device tokens, and
          Circle entitlement records from our servers, in one transaction. You can also email{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a> and
          we will delete it for you.
        </p>

        <p><strong>Age</strong></p>
        <p>
          Trust Circle is for adults and older teens: 17 and up. It is not directed at children
          and has no child or family-supervision mode.
        </p>

        <p>
          If this policy changes, we will update the date above and post the new version at this
          address.
        </p>
      </div>
      <p>
        <Link className="text-link" href="/trust/terms">
          Terms
        </Link>
        {" · "}
        <Link className="text-link" href="/trust/support">
          Support
        </Link>
        {" · "}
        <Link className="text-link" href="/trust">
          Trust Circle
        </Link>
      </p>
    </main>
  );
}
