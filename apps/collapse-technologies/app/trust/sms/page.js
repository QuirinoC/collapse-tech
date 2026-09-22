import Link from "next/link";

export const metadata = {
  title: "Trust verification texts | Collapse Technologies",
  description:
    "How Trust asks before texting a verification code. The control starts off. Trust works without it.",
  alternates: { canonical: "/trust/sms" },
};

export default function TrustSmsPage() {
  return (
    <main className="legal-page sms-evidence">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust · Verification texts</p>
      <h1>Texts are optional.</h1>
      <div className="consent-card" aria-label="Trust app phone screen, switch off">
        <p><strong>Your phone</strong></p>
        <p>A code is texted to this number.</p>
        <input className="phone-fake" value="(415) 555-0100" readOnly aria-label="Phone number, not collected on this page" />
        <div className="consent-row">
          <span className="consent-switch" aria-hidden="true" />
          <p>
            Text me a Trust verification code. Up to 8 texts a day. Message and data
            rates may apply. Reply HELP for help or STOP to opt out.
          </p>
        </div>
        <p>
          <Link href="/trust/privacy">Privacy</Link>
          {" · "}
          <Link href="/trust/terms">Terms</Link>
        </p>
        <span className="send-disabled">Send code</span>
      </div>
      <div className="legal-copy">
        <p>
          Last updated 22 September 2026. Collapse Technologies, operating as Trust, sends
          one kind of text: a one-time verification code to a mobile number the account holder
          types in. Trust does not text invites, alerts, or marketing.
        </p>

        <p><strong>Where consent happens</strong></p>
        <p>
          After Sign in with Apple, the app can show a phone screen. The consent control is a
          switch, and it starts off. Send code stays disabled until the person turns the switch
          on. They can leave the screen and keep using Trust without a phone number. Consent is
          not required to create an account, buy Plus, or use the app.
        </p>
        <p>The switch label reads:</p>
        <p>
          “Text me a Trust verification code. Up to 8 texts a day. Message and data rates may
          apply. Reply HELP for help or STOP to opt out.”
        </p>
        <p>
          On that same screen, Privacy Policy links to{" "}
          <Link href="/trust/privacy">https://collapsetechnologies.com/trust/privacy</Link> and
          Terms links to{" "}
          <Link href="/trust/terms">https://collapsetechnologies.com/trust/terms</Link>.
        </p>

        <p><strong>What the text says</strong></p>
        <p>Trust code: 123456. Expires in 10 minutes. Reply STOP to opt out.</p>

        <p><strong>Program</strong></p>
        <ul>
          <li>Sender: Trust, by Collapse Technologies.</li>
          <li>Frequency: only the codes you request, at most 8 texts a day.</li>
          <li>Message and data rates may apply.</li>
          <li>Reply HELP for help. Reply STOP to opt out.</li>
          <li>
            Help reply: Trust verification codes. Email hello@collapsetechnologies.com. Reply
            STOP to cancel.
          </li>
        </ul>
        <p>
          We do not share, sell, or provide your mobile phone number or messaging consent data
          to third parties or affiliates for marketing or promotional purposes. Text messaging
          originator opt-in data and consent will not be shared with any third parties.
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
