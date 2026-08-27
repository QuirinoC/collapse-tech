import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Collapse Health",
  description: "Privacy information for the Collapse Health concept-preview website.",
};

export default function Privacy() {
  return (
    <main className="legal">
      <div className="container">
        <Link href="/">← Back to home</Link>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: August 2026</p>
        <p>
          Collapse Health is an early concept operated by Collapse Technologies. <strong>We are
          not currently operating and do not provide health-travel services.</strong> This policy
          describes the limited information handled by this preview site.
        </p>
        <h2>Information we collect</h2>
        <p>
          This concept preview does not collect registrations, contact details, or sensitive health
          information. Do not submit medical records, symptoms, treatment information, insurance
          information, or other sensitive health information through this site.
        </p>
        <h2>How we use and share it</h2>
        <p>
          Because this preview accepts no registrations, it does not use or share submitted personal
          information. We do not sell information, use it for clinical decisions, or share it with
          healthcare providers. Our hosting providers may process limited technical information
          solely to deliver and secure the site.
        </p>
        <h2>Retention and your choices</h2>
        <p>
          There are no registrations or public contact submissions to retain. Any future collection
          process would need a separately reviewed retention, access, correction, and deletion
          process before it is made available.
        </p>
        <h2>Website data</h2>
        <p>
          This preview does not intentionally use analytics or advertising trackers. Service
          providers may process technical information needed to deliver and secure the site under
          their own terms and policies.
        </p>
        <h2>Not medical or emergency advice</h2>
        <p>
          This website is informational only. It does not provide medical, insurance, travel, or
          emergency advice. For an emergency, contact local emergency services or 911.
        </p>
      </div>
    </main>
  );
}
