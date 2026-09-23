import Link from "next/link";

export const metadata = {
  title: "Trust Privacy Policy | Collapse Technologies",
  description:
    "What Trust collects, how long location is kept, who can look, and how to delete your account.",
  alternates: { canonical: "/trust/privacy" },
};

export default function TrustPrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust · Privacy Policy</p>
      <h1>We do not sell location.</h1>
      <div className="legal-copy">
        <p>
          Last updated 22 September 2026. This policy covers the Trust iOS app and the Trust
          API at trust.collapsetechnologies.com. Trust is made and operated by Collapse
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
            It is how people you add identify you.
          </li>
          <li>
            Phone number: only if you type your own number in the app and ask Trust to text you a
            verification code. After you enter the code, that number is stored on your account.
          </li>
          <li>
            Location: precise location points your phone sends while sharing is on. They are held
            in escrow so someone you added can look, and are removed on a rolling basis (see
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
            Share modes you set per person: Sealed (until they look), Always, Pause, or Off.
          </li>
          <li>
            Device identifiers for receipts: an app installation ID generated on your phone and
            your Apple Push Notification (APNs) device token, so we can send you a receipt when
            someone looks.
          </li>
          <li>
            Plus subscription status: signed StoreKit transaction records from Apple (product,
            purchase and expiry dates, transaction IDs) and an anonymous app account token. We
            receive an entitlement, never your card number.
          </li>
        </ul>

        <p><strong>How looking works</strong></p>
        <p>
          Sealed coordinates stay hidden until a look, or until that person sets Always for you.
          A look is one snapshot and sends a push receipt. Always is a live view. Looking is never
          silent.
        </p>

        <p><strong>How long we keep it</strong></p>
        <ul>
          <li>
            Location: Free keeps 24 hours. Plus keeps 30 days. Older points are removed as that
            window passes. If you have no one left you share with, your location is cleared.
          </li>
          <li>
            Look log: the app shows the last 30 days on Free and one year with Plus. Look events
            stay on our servers until you delete your account.
          </li>
          <li>
            Presence, handle, share modes, push tokens, and subscription records: kept while your
            account exists.
          </li>
        </ul>

        <p><strong>Text messages</strong></p>
        <p>
          Trust texts a verification code to finish the account. The box starts empty. You check
          it, then we send the code. At most 8 texts a day. Message and data rates may apply.
          Reply HELP for help or STOP to opt out. The screen is at{" "}
          <Link href="/trust/sms">collapsetechnologies.com/trust/sms</Link>.
        </p>
        <p>
          We do not share, sell, or provide your mobile phone number or messaging consent data to
          third parties or affiliates for marketing or promotional purposes. No mobile information
          will be shared with third parties or affiliates for marketing or promotional purposes.
          Text messaging originator opt-in data and consent will not be shared with any third
          parties. Twilio transmits the verification text we ask it to send and does not use your
          number for its own marketing.
        </p>

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
          order to deliver the service. Data is encrypted in transit with HTTPS. That operational
          processing does not include selling or providing your mobile phone number or SMS consent
          to anyone for marketing or promotional purposes.
        </p>

        <p><strong>Delete your account</strong></p>
        <p>
          In the Trust iOS app, open Settings → Delete account. That deletes your account
          record, Sign in with Apple identity mapping, handle, location points, presence, the
          people you added and invites, share settings, active and past looks, push device tokens,
          and Plus entitlement records from our servers, in one transaction. You can also email{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a> and
          we will delete it for you.
        </p>

        <p><strong>Age</strong></p>
        <p>
          Trust can be used by a household, including family. It is not a children&apos;s app and
          is not directed at children under 13.
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
          Trust
        </Link>
      </p>
    </main>
  );
}
