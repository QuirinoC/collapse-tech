import Link from "next/link";

export const metadata = {
  title: "Privacy | Collapse Technologies",
  description:
    "How Collapse Technologies handles contact information and website tracking.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy | Collapse Technologies",
    description:
      "How Collapse Technologies handles contact information and website tracking.",
    siteName: "Collapse Technologies",
    type: "website",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">Collapse<span>Technologies</span></Link>
      <p className="eyebrow">Privacy</p>
      <h1>Keep it<br />simple.</h1>
      <div className="legal-copy">
        <p>
          Collapse Technologies does not sell personal information. If you contact
          us, we use the details you send only to respond to you.
        </p>
        <p>
          This site does not use advertising trackers. If that changes, this page
          will say so plainly.
        </p>
        <p>
          Trust, our iOS app, may text a verification code you request. We do not share,
          sell, or provide your mobile phone number or messaging consent data to third parties
          or affiliates for marketing or promotional purposes. Text messaging originator opt-in
          data and consent will not be shared with any third parties. The Trust policy is at{" "}
          <Link href="/trust/privacy">/trust/privacy</Link>.
        </p>
      </div>
      <Link className="text-link" href="/">Back to Collapse <span>↖</span></Link>
    </main>
  );
}
