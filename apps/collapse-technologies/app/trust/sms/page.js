import Link from "next/link";

export const metadata = {
  title: "Trust verification texts | Collapse Technologies",
  description:
    "A Trust account needs a verification text. The box starts empty. Check it, then we send the code.",
  alternates: { canonical: "/trust/sms" },
};

export default function TrustSmsPage() {
  return (
    <main className="legal-page sms-evidence">
      <Link className="wordmark" href="/">
        Collapse<span>Technologies</span>
      </Link>
      <p className="eyebrow">Trust</p>
      <h1>Your phone.</h1>
      <div className="legal-copy">
        <p>
          A code is texted to this number. The account needs it. The box starts empty.
          Check it, then Send code.
        </p>
        <p>
          <img
            src="/trust/sms-opt-in.png"
            alt="Trust phone screen with the verification-text checkbox unchecked and Send code disabled"
            width={760}
            height={420}
          />
        </p>
      </div>
      <div className="legal-copy">
        <p>
          Last updated 22 September 2026. Trust sends one kind of text: a verification code,
          to finish the account. No invites, no alerts, no marketing. Up to 8 texts a day.
          Message and data rates may apply. Reply HELP for help or STOP to opt out.
        </p>
        <p>The text says: Trust code: 123456. Expires in 10 minutes. Reply STOP to opt out.</p>
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
