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
          independent content creators. Payment funding, fund holding, and
          creator payouts are not currently available through the production
          site.
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
          The planned platform fee is a flat 18% of the total campaign budget.
          Any funding, refunds, disputes, and payout terms will be presented
          before payment services are launched. These terms are a summary; an
          operating agreement will govern any paid campaign where it differs.
        </p>
        <SiteFooter />
      </div>
    </main>
  );
}
