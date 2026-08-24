import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Collapse Health",
  description: "How Collapse Health collects, uses, and protects your information.",
};

export default function Privacy() {
  return (
    <main className="legal">
      <div className="container">
        <Link href="/">← Back to home</Link>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: August 2026</p>
        <p>
          Collapse Health (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a medical travel facilitation
          service operated by Collapse Technologies. This policy explains what information we
          collect and how we use it.
        </p>
        <h2>Information we collect</h2>
        <ul>
          <li>Contact details you submit through our quote form (name, email, phone) and any notes you provide.</li>
          <li>Health-related information you choose to share with us for the purpose of obtaining quotes (e.g., procedure of interest). Please share only what you are comfortable sharing.</li>
          <li>Basic usage data such as pages visited.</li>
        </ul>
        <h2>How we use it</h2>
        <ul>
          <li>To prepare and send you personalized provider quotes.</li>
          <li>To coordinate care logistics if you choose to proceed.</li>
          <li>We never sell your personal information.</li>
        </ul>
        <h2>Sharing</h2>
        <p>
          When you request a quote, we share the relevant details with the vetted Mexican
          providers matched to your request. We do not share your information with anyone
          else without your consent, except where required by law.
        </p>
        <h2>Data retention &amp; your rights</h2>
        <p>
          You may request access to, correction of, or deletion of your personal information at
          any time by emailing hello@collapsetechnologies.com. We retain inquiry data only as
          long as needed to serve you or as required by law.
        </p>
        <h2>Not medical advice</h2>
        <p>
          Content on this website is informational only and is not medical advice. Clinical
          decisions should be made with licensed healthcare providers.
        </p>
      </div>
    </main>
  );
}
