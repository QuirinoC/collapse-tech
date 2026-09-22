import Link from "next/link";

export const metadata = {
  title: "Trust Terms of Use | Collapse Technologies",
  description:
    "Terms for using Trust, the optional Circle subscription, and adult-peer location escrow.",
  alternates: { canonical: "/trust/terms" },
};

export default function TrustTermsPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust · Terms of Use</p>
      <h1>Adult peers. You decide who looks.</h1>
      <div className="legal-copy">
        <p>
          Last updated 21 September 2026. Trust is made and operated by Collapse
          Technologies. By using the Trust iOS app you agree to these terms and to the{" "}
          <Link href="/trust/privacy">Privacy Policy</Link>.
        </p>

        <p><strong>Who it is for</strong></p>
        <p>
          Trust is for people 17 and older who share location with other adults they
          trust. You need an Apple ID (Sign in with Apple) and a handle. You are responsible for
          who you invite and for the share mode you set for each person.
        </p>

        <p><strong>How looking works</strong></p>
        <p>
          Your coordinates stay hidden until someone you trust confirms a look, unless you set
          Always or For a while for that person. A look shows live location plus the last 2 hours
          (24 hours when Circle covers the pair) and sends a receipt to the person being looked
          at. You can revoke anyone at any time, and you can delete your account in Settings.
          Looking at one trusted person is included without paying.
        </p>

        <p><strong>Circle subscription</strong></p>
        <p>
          Circle is an optional auto-renewing subscription bought through Apple in the app:
          <strong> $7.99 per month</strong> or <strong>$69.99 per year</strong> (prices in USD;
          local prices may vary), each with a <strong>7-day free trial</strong> for new
          subscribers. Circle adds up to 6 trusted people, 24-hour history on an open look, place
          pings, a one-year look log with export, and covers the unpaid people in your circle.
          Family Sharing is off.
        </p>
        <ul>
          <li>Payment is charged to your Apple ID account when you confirm the purchase.</li>
          <li>
            The subscription renews automatically unless you cancel at least 24 hours before the
            end of the current period. Your account is charged for renewal within 24 hours before
            the current period ends.
          </li>
          <li>
            Manage or cancel in iOS Settings → Apple ID → Subscriptions. Deleting the app does not
            cancel the subscription.
          </li>
          <li>
            Any unused part of a free trial is forfeited when you buy a subscription. Refunds are
            handled by Apple under App Store rules.
          </li>
        </ul>
        <p>
          The{" "}
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
            Apple Licensed Application End User License Agreement
          </a>{" "}
          also applies to your download of the app from the App Store.
        </p>

        <p><strong>Text messages</strong></p>
        <p>
          Collapse Technologies, operating as Trust, texts a one-time verification code only after
          you sign in with Apple, type your own mobile number, and turn on “Text me a Trust
          verification code.” Message frequency is the codes you request, at most 8 texts a day.
          Message and data rates may apply. Reply <strong>HELP</strong> for help or{" "}
          <strong>STOP</strong> to cancel. Support is{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a> and{" "}
          <Link href="/trust/support">the support page</Link>. Carriers are not liable for delayed
          or undelivered messages. The <Link href="/trust/privacy">Privacy Policy</Link> describes
          what the text program collects.
        </p>

        <p><strong>Acceptable use</strong></p>
        <p>
          Do not use Trust to track anyone without their knowledge and consent, to
          impersonate someone with a handle, or to interfere with the service. We may suspend
          accounts that do.
        </p>

        <p><strong>No sale, no ads, as is</strong></p>
        <p>
          We do not sell location and we do not run ads. The service is provided as is. Location
          depends on your phone, iOS permissions, and network coverage, so it can be late or
          missing. Trust is not an emergency service. Contact{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a>.
        </p>
      </div>
      <p>
        <Link className="text-link" href="/trust/privacy">
          Privacy
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
