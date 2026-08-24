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
          Collapse Health (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a planned medical travel
          facilitation service operated by Collapse Technologies. <strong>We are not
          currently operating and are not providing services.</strong> This policy explains
          what information this preview site collects and how we use it.
        </p>
        <h2>Information we collect</h2>
        <ul>
          <li>Contact details you submit through the waitlist form (name, email, phone) and any notes you choose to provide.</li>
          <li>Basic usage data such as pages visited.</li>
        </ul>
        <h2>How we use it</h2>
        <ul>
          <li>Solely to notify you when (and if) the service launches.</li>
          <li>We never sell your personal information.</li>
        </ul>
        <h2>Sharing</h2>
        <p>
          While we are not operating, your details are not shared with healthcare providers.
          If the service launches, we would share relevant details only with providers you
          approve, for the purpose of preparing quotes. We do not otherwise share your
          information except where required by law.
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
