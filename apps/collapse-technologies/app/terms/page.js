import Link from "next/link";

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
      <Link className="wordmark" href="/">Collapse<span>Technologies</span></Link>
      <p className="eyebrow">Terms</p>
      <h1>Use good<br />judgment.</h1>
      <div className="legal-copy">
        <p>
          The material on this site is provided as-is. Project availability,
          features, and timelines can change while we are building.
        </p>
        <p>
          Collapse Technologies and its project names are not available for use
          without permission.
        </p>
      </div>
      <Link className="text-link" href="/">Back to Collapse <span>↖</span></Link>
    </main>
  );
}
