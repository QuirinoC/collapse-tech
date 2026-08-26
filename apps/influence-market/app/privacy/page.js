import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata = { title: "Privacy — Influence.Market" };

export default function PrivacyPage() {
  return (
    <main>
      <div className="legal-page">
        <SiteHeader variant="static" />
        <p className="eyebrow">Legal</p>
        <h1>Privacy</h1>
        <p className="legal-copy">
          Influence.Market collects the minimum data required to operate the
          marketplace: account email and name, creator public listings (bio,
          niches, channels and follower counts), campaign briefs you submit,
          application and assignment records, and payment ledger entries.
        </p>
        <p className="legal-copy">
          We do not sell personal data. Creator contact emails are never exposed
          publicly or to other users; brands communicate with creators through
          campaign instructions on the platform. Payment card data is handled
          exclusively by our payment processor and never touches our servers.
        </p>
        <p className="legal-copy">
          Session cookies are HTTP-only and used solely for authentication. You
          may request export or deletion of your data at any time by writing to
          privacy@influence.market. Records required for financial compliance
          (ledger entries) are retained as legally required.
        </p>
        <SiteFooter />
      </div>
    </main>
  );
}
