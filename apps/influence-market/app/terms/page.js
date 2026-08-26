import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata = { title: "Terms — Influence.Market" };

export default function TermsPage() {
  return (
    <main>
      <div className="legal-page">
        <SiteHeader variant="static" />
        <p className="eyebrow">Legal</p>
        <h1>Terms</h1>
        <p className="legal-copy">
          Influence.Market operates a curated marketplace connecting brands with
          independent content creators. Brands fund campaigns upfront; funds are
          held through the payment processor and released to creators only after
          the brand approves content that complies with the campaign brief.
        </p>
        <p className="legal-copy">
          Creators are independent contractors, not employees; no exclusivity is
          granted or required either way. Brands grant each accepted creator a
          limited license to use provided product materials solely for the
          deliverables in the brief. Creators warrant that submitted content is
          original and must carry clear disclosure (e.g. #ad) consistent with
          FTC endorsement guidelines.
        </p>
        <p className="legal-copy">
          Our fee is a flat 18% of the total campaign budget, charged at funding
          time. If an accepted slot cannot be filled after funding, the
          unallocated portion of that slot&apos;s budget is refunded to the brand.
          Disputed submissions may be escalated for platform review within 14
          days of rejection. These terms are a summary; the operating agreement
          presented at first campaign creation governs where they differ.
        </p>
        <SiteFooter />
      </div>
    </main>
  );
}
