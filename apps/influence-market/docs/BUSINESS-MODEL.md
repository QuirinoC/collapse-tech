# Influence.Market — Business Model & Projections

*Companion to COMPETITIVE-LANDSCAPE.md. All figures USD. Currency of trust: integer cents in the ledger.*

> **Product status (August 2026):** Production payment funding and payouts are
> disabled. Escrow, processor, payout, revenue, and margin descriptions below
> are the planned operating model, not currently available product behavior.

## 1. Revenue model

**Single line item: flat 18% take on every funded campaign.** No subscriptions, no creator fees, no exclusivity contracts.

Brands fund only after every creator slot in the approved roster is filled. This
keeps the full creator pool allocated and prevents unassigned budget from being
stranded after settlement.

Unit economics per campaign:

| Example budget | Platform fee (18%) | Payout pool | 4-creator slot payout |
| --- | --- | --- | --- |
| $2,500 | $450 | $2,050 | $512.50 |
| $5,000 | $900 | $4,100 | $1,025 |
| $10,000 | $1,800 | $8,200 | $2,050 |
| $25,000 | $4,500 | $20,500 | $5,125 |

Contribution margin per campaign ≈ fee minus payment processing (~2.9% + $0.30 on charge, ~0.25% on payouts) minus verification labor. On a $5k campaign: $900 − ~$150 processing − ~$50 ops = **~$700 gross profit (~14% of GMV)**.

## 2. Cost structure

| Line item | Monthly (year 1) | Notes |
| --- | --- | --- |
| Infrastructure | <$100 | Cloudflare Workers (free→$5 tier) + Supabase (free→$25 tier) — see deployment note below |
| Payments | % of GMV | Stripe: 2.9%+$0.30 per charge; Connect transfers ~0.25% |
| Verification/ops labor | Founder time year 1; $3.5k/mo part-time contractor from ~40 campaigns/mo | Content link checks, dispute handling |
| Creator supply outreach | $0–$1k/mo | Seeding coordination; the model's honesty does the selling |
| Brand acquisition | $0–$2k/mo | Founder outbound + SEO content; paid ads only after PMF signal |

## 3. 24-month projections

Assumptions: avg campaign budget grows with brand mix ($4k → $6k); repeat rate compounds as escrow trust proves out; churn modeled on brands completing <2 campaigns.

### Base case

| Quarter | Campaigns | GMV | Fees (revenue) | Est. gross profit |
| --- | --- | --- | --- | --- |
| Q1 | 12 | $48,000 | $8,640 | $6,700 |
| Q2 | 24 | $105,000 | $18,900 | $14,600 |
| Q3 | 45 | $207,000 | $37,260 | $28,800 |
| Q4 | 70 | $350,000 | $63,000 | $48,700 |
| **Y1** | **151** | **$710,000** | **$127,800** | **$98,800** |
| Y1+Q5 | 95 | $589,000 | $106,020 | $82,000 |
| Y2Q2 | 120 | $756,000 | $136,080 | $105,200 |
| Y2Q3 | 145 | $928,000 | $167,040 | $129,200 |
| Y2Q4 | 175 | $1,136,000 | $204,480 | $158,300 |
| **Y2** | **535** | **$3,409,000** | **$613,620** | **$474,700** |

Base-case trajectory: breakeven on cash costs around Q4–Y1Q5; founder salary covered by mid-Y2 without outside capital.

### Bull case (repeat-rate flywheel + one anchor vertical wins)
Y1: 240 campaigns / $1.15M GMV / $207k revenue. Y2: 850 campaigns / $5.4M GMV / **$972k revenue**, first two ops hires, category benchmark reports as a data moat.

### Bear case (supply quality stalls, disputes run hot)
Y1: 60 campaigns / $240k GMV / $43k revenue — enough to keep building but triggers the pivot levers below before raising anything.

### Sensitivity
Every +1pt of average take (e.g., surge pricing on expedited rosters) adds ~11% revenue at constant volume. Every −10% on repeat rate cuts Y2 revenue ~22%. **Repeat rate is the single most leveraged metric.**

## 4. Where to invest (in order)

1. **Supply quality first.** Vetted roster beats big roster. Manual curation until >500 creators, then reliability scores from real assignment data.
2. **Verification speed second.** Approve-to-payout latency is our word-of-mouth engine for creators; target <24h median.
3. **Metrics ingestion third.** Channel stats (followers, engagement, topics) power search rank and curation claims — build ingestion once volume justifies it.
4. **Brand acquisition last.** Outbound converts fine at this deal shape; don't buy ads until repeat rate >50%.

## 5. Profit-maximization levers

- **Repeat campaigns** — same-brand second campaigns cost ~zero CAC. Nudge at completion +30d.
- **Slot fill rate** — unfilled slots strand goodwill; over-invite applicants 3× slots.
- **Budget mix** — nudge budgets up in $2,500 steps; fee scales linearly, ops cost doesn't.
- **Vertical concentration** — fitness & beauty first; category density compounds curation quality and lets us publish benchmark pricing.
- **Surge service tier** — "roster in 48h" premium (fee 22%) for launch-date-bound brands; optional, never default.
- **Payout float discipline** — funds held are processor-held, not interest-bearing; never let float become the business model (regulatory + reputational risk).

## 6. Key risks (incl. the challenged assumption)

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **"Creators come free" is unproven.** They're pitched constantly; attention is the scarce asset, not money. | High | Guaranteed-paid first campaigns; NET-0 payout proof points; creator referral bonus ($150 after their referred creator completes a paid assignment); measure response-per-outreach-channel weekly and kill what underperforms |
| Fraudulent submissions (recycled content, bought engagement) | High | Public-post verification links; manual review until volume forces tooling; reliability scores gate premium briefs |
| Chargebacks/disputes on upfront charges | Medium | Clear brief records + signed platform agreement at funding; ledger evidence trail already built into schema |
| Regulatory (money transmission, FTC disclosure) | Medium | Processor-held funds (Stripe Connect), mandatory #ad disclosure in instructions text shipped with every assignment |
| Incumbent copies pay-per-campaign | Low | They'd cannibalize subscription MRR; our transaction data compounds meanwhile |

## 7. KPIs to instrument next

1. Repeat campaign rate (>50% target)
2. Slot fill rate (>90%)
3. First-pass content approval rate (>70%)
4. Median approve→payout hours (<24h)
5. Dispute rate (<3% of assignments)
6. Creator outreach response rate by channel

---

### Deployment note (per repo convention)

Platform runs on **Cloudflare Workers via `@opennextjs/cloudflare`** with a native **D1** binding in production; Supabase remains an optional alternative store. No servers to babysit, so infrastructure stays in the noise floor of the cost table above. Sandbox payments are local/test-only, and stable operation keys make retries idempotent across Worker isolates. Production funding remains explicitly disabled until a Stripe Connect Checkout + webhook flow and creator destination accounts are configured; the platform never represents simulated funds as real escrow.

### Forward-only database rollout

Apply D1 migrations in numeric order (`0001` through `0004`) with
`wrangler d1 migrations apply influence-market --remote`; do not edit or
reapply an already-recorded migration. Release `0004` in a maintenance window
with the application version that writes `assignments.payout_cents`: older
application code cannot create assignments after the new integrity trigger is
installed, and newer code requires the new column. The migration invalidates
all existing sessions so browser tokens are no longer stored replayably.

Supabase deployments require the matching forward-only `003_security_and_payout_integrity.sql`
after `001` and `002`, in the same maintenance window. It invalidates legacy
sessions, adds and backfills assignment payouts, replaces the acceptance RPC
with its six-argument version, and enables deny-by-default RLS for every
exposed application table. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is
the only role granted direct application-table access.
