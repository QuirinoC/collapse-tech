import Link from "next/link";

export const metadata = {
  title: "Trust Terms of Use | Collapse Technologies",
  description:
    "Terms for using Trust, the optional Plus subscription, and location sharing you control.",
  alternates: { canonical: "/trust/terms" },
};

export default function TrustTermsPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust · Terms of Use</p>
      <h1>You decide who looks.</h1>
      <div className="legal-copy">
        <p>
          Last updated 22 September 2026. Trust is made and operated by Collapse
          Technologies. By using the Trust iOS app you agree to these terms and to the{" "}
          <Link href="/trust/privacy">Privacy Policy</Link>. Agreeing to these terms is not
          consent to text messages.
        </p>

        <p><strong>Who it is for</strong></p>
        <p>
          Trust can be used by a household, including family. It is not a children&apos;s app and
          is not directed at children under 13. You need an Apple ID (Sign in with Apple) and a
          handle. You are responsible for who you add and for the share mode you set for each
          person. The account needs a verification text to your phone.
        </p>

        <p><strong>How looking works</strong></p>
        <p>
          Your coordinates stay hidden until someone you added confirms a look, unless you set
          Always for that person. A look is one snapshot and sends a receipt to the person being
          looked at. Free history is 24 hours. Plus history is 30 days. You can remove anyone at
          any time, and you can delete your account in Settings. Free includes up to 5 people.
        </p>

        <p><strong>Plus subscription</strong></p>
        <p>
          Plus is an optional auto-renewing subscription bought through Apple in the app:
          <strong> $7.99 per month</strong> or <strong>$69.99 per year</strong> (prices in USD;
          local prices may vary), each with a <strong>7-day free trial</strong> for new
          subscribers. Plus is on your own account. It is not shared with the people you add.
          Plus adds Always, up to 20 people, live pins, 30 days of history, and a one-year look
          log with export. Family Sharing is off.
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
          The account needs a verification code. You ask for it on the phone screen by checking
          a box that starts empty. That box is the consent. It is separate from these terms.
          Send code stays off until the box is checked. At most 8 texts a day. Message and data
          rates may apply. Reply <strong>HELP</strong> for help or <strong>STOP</strong> to
          cancel. The screen is at{" "}
          <Link href="/trust/sms">collapsetechnologies.com/trust/sms</Link>. Support is{" "}
          <a href="mailto:hello@collapsetechnologies.com">hello@collapsetechnologies.com</a> and{" "}
          <Link href="/trust/support">the support page</Link>. Carriers are not liable for delayed
          or undelivered messages.
        </p>
        <p>
          We do not share, sell, or provide your mobile phone number or messaging consent data to
          third parties or affiliates for marketing or promotional purposes. Text messaging
          originator opt-in data and consent will not be shared with any third parties. The{" "}
          <Link href="/trust/privacy">Privacy Policy</Link> describes what the text program
          collects.
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
