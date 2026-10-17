import Link from "next/link";
import { LineIcon } from "../_components/LineIcon";

export const metadata = {
  title: "Terms | Collapse Technologies",
  description:
    "Terms for using the Collapse Technologies website and its published material.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms | Collapse Technologies",
    description:
      "Terms for using the Collapse Technologies website and its published material.",
    siteName: "Collapse Technologies",
    type: "website",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="wordmark collapse-wordmark" href="/">
        <span>Collapse</span>
        <span>Technologies</span>
      </Link>
      <p className="eyebrow">Terms</p>
      <h1>
        Use good
        <br />
        judgment.
      </h1>
      <div className="legal-copy">
        <p>
          The material on this site is provided as-is. Project availability,
          features, and timelines can change while we are building.
        </p>
        <p>
          Collapse Technologies and its project names are not available for use
          without permission.
        </p>
        <p>
          Trust is a separate product with its own terms and text-message
          disclosures. Read the current terms at{" "}
          <Link href="https://jointrust.app/terms">jointrust.app/terms</Link>.
        </p>
      </div>
      <Link className="text-link" href="/">
        Back to Collapse{" "}
        <LineIcon name="northwest" className="arrow" />
      </Link>
    </main>
  );
}
