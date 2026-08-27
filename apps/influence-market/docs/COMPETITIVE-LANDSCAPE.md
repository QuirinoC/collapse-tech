# Influence.Market — Competitive Landscape

*Prepared August 2026. Sources: public pricing pages, G2/Capterra reviews, agency rate cards, FTC endorsement guides.*

> **Product status:** Payment funding and payouts are disabled in production.
> References to escrow, guaranteed payment, and payment operations in this
> document describe the planned model, not a currently available service.

## 1. Market structure

Influencer marketing spend keeps growing double-digits annually, but the **tooling** layer is saturated while the **transaction** layer is not. Incumbents sell software; almost nobody sells the outcome itself with money movement built in.

### Incumbent matrix

| Player | Model | Price point | What you actually get | Weakness we exploit |
| --- | --- | --- | --- | --- |
| **Grin** | SaaS + managed-ish | ~$2,500+/mo (annual contract) | Discovery + CRM + reporting | Retainer-sized commitment; SMBs priced out; you still run the campaign |
| **Aspire** | SaaS marketplace-lite | ~$2,000+/mo | Creator marketplace + workflows | Subscription regardless of usage; no escrow; brand does all vetting |
| **Upfluence** | SaaS | $478–$998/mo | Search database + outreach | Database-heavy, execution-light; pay to search, then do the work |
| **CreatorIQ** | Enterprise SaaS | $36k–$100k+/yr | Full enterprise suite | Mid-market and below cannot enter |
| **Modash** | Data/discovery | <$500/mo | 200M+ profile search API | Zero campaign management, zero payments |
| **Traditional agencies** | Service retainer | 15–30% of spend, monthly minimums | Done-for-you campaigns | Opaque markups, slow, long contracts, no self-serve |

### Why the barrier to entry favors us now

1. **Discovery data commoditized.** Public APIs and scrapable metrics (followers, engagement, topics) mean curation is an engineering problem, not a moat-blocking relationship game.
2. **Payments infrastructure mature.** Stripe Connect escrow-style flows (separate charges & transfers) make "hold funds, release on verification" a two-week build, not a legal labyrinth.
3. **Incumbents can't follow without cannibalizing.** A subscription business adding pay-per-campaign undercuts its own MRR. Their pricing page is their prison.
4. **Trust gap is the real barrier — and it's ours to win.** Brands fear paying creators who ghost; creators fear net-60 invoices. Escrow kills both fears. Whoever brands trust with *held money* wins the category.

## 2. Our wedge: the agency-marketplace hybrid

**Position:** "One brief. Every audience." — a single agency interface with marketplace economics.

| Dimension | Incumbent norm | Influence.Market |
| --- | --- | --- |
| Pricing | Monthly subscription / retainer | **Pay per campaign only** |
| Fee | 15–30% opaque markup or $2k+ seats | **Flat 18%, published** |
| Money flow | Brand pays creator directly | **Escrowed upfront; released on verified delivery** |
| Contracts | One per creator | **One platform agreement** |
| Creators' cost | Often paid placement fees | **Free, no exclusivity, pre-funded work** |
| Failure mode | Brand eats the loss | **Rejected content = unpaid slot** |

### Defensibility roadmap
- **Phase 1 (now):** speed + transparency. Same-week roster, fixed price, live ledger.
- **Phase 2:** performance data flywheel — every completed assignment feeds creator reliability scores (on-time %, approval-first-pass %) that competitors can't replicate without transaction volume.
- **Phase 3:** vertical depth (fitness, beauty first). Category-level benchmark data ("what a CPM looks like for skincare TikTok") becomes proprietary.

## 3. GTM — demand side (brands)

- Target: DTC brands $1M–$20M revenue running 4+ campaigns/quarter who already feel Grin/Aspire sticker shock.
- Channel: founder-led outbound to ecom operators; case study after every successful campaign; comparison SEO ("grin alternative", "influencer marketing without subscription").
- Hook: free curated roster preview within 48h of a brief — show the creators before asking for commitment.

## 4. GTM — supply side (creators)

The unproven assumption *"acquiring influencers is cheap because they want money"* is **challenged** in BUSINESS-MODEL.md §Risks. Reality:

- Creators are drowning in pitch spam; response rates to cold outreach are low.
- What works: (a) **guaranteed-paid first campaign** — our escrow model makes this honest marketing; (b) product seeding with clear "paid if you perform" terms; (c) referrals from creators who actually got paid fast (our NET-0 payout is the differentiator).
- Product seeding standard: brands ship directly to accepted creators; reimbursement models are rare and add friction — we default to direct ship.
- No exclusivity ever. Supply stays liquid; lock-in comes from reliable payment speed instead.

## 5. Entry risks

| Risk | Mitigation |
| --- | --- |
| Stripe/money-transmission compliance | Use platform charge + Connect transfer model; never hold funds in our own bank accounts beyond processor float |
| Fraud (fake engagement, stolen content) | Manual review of first 100 assignments; verification links must be public posts; reliability scores later |
| Disintermediation (brand + creator go direct after match) | Value = escrow + curation + multi-campaign management; fee charged upfront makes bypassing pointless mid-campaign |
| Platform API changes (Instagram/TikTok metric access) | Metrics power ranking only, not eligibility; keep ingestion pluggable |
