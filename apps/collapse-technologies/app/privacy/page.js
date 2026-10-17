import Link from "next/link";
import { LineIcon } from "../_components/LineIcon";

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
      <Link className="wordmark collapse-wordmark" href="/">
        <span>Collapse</span>
        <span>Technologies</span>
      </Link>
      <p className="eyebrow">Privacy</p>
      <h1>
        Keep it
        <br />
        simple.
      </h1>
      <div className="legal-copy">
        <p>
          Collapse Technologies does not sell personal information. If you
          contact us, we use the details you send only to respond to you.
        </p>
        <p>
          This site does not use advertising trackers. If that changes, this
          page will say so plainly.
        </p>
        <p>
          Trust is a separate product with its own privacy policy, including its
          location and verification-text practices. Read the current policy at{" "}
          <Link href="https://jointrust.app/privacy">
            jointrust.app/privacy
          </Link>
          .
        </p>
      </div>
      <Link className="text-link" href="/">
        Back to Collapse{" "}
        <LineIcon name="northwest" className="arrow" />
      </Link>
    </main>
  );
}
