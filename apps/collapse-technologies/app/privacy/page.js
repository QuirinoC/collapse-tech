export const metadata = {
  title: "Privacy | Collapse Technologies",
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
      </div>
      <Link className="text-link" href="/">Back to Collapse <span>↖</span></Link>
    </main>
  );
}
import Link from "next/link";
