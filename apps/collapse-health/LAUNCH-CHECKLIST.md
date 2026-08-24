# Collapse Health — Launch Checklist
Everything required before legally and safely operating as a medical tourism
referral facilitator (US/Canada → Mexico). Companion to [STARTUP-COSTS.md](./STARTUP-COSTS.md).

Status legend: ☐ not started · ◐ in progress · ☑ done

## Phase 1 — Legal & Corporate Foundation (weeks 1–3)

- ☑ Form US entity — **DONE (Washington)**
- ☐ Confirm WA Business Licensing Service (BLS) endorsement covers the new business line + city business license where operating
  - Note: WA has no seller-of-travel or medical-facilitator licensing regime; no special state license needed for pure referral facilitation
- ☐ Open/confirm business bank account for the entity
- ☐ General business attorney: Terms of Service, Privacy Policy, referral-commission disclosure language (~$500–1.5k)
  - Full healthcare-compliance memo is **optional pre-launch**; becomes required before any US-provider partnerships or employer-benefit channels (AKS exposure)
- ☐ Mexican counsel: bilingual EN/ES referral/commission agreement template enforceable under Mexican commercial law (~$1–2k)
  - No separate regulatory review needed: COFEPRIS licensing stays each provider's own obligation — we verify per provider in Phase 2
- ☐ USPTO trademark search on "Collapse Health" (free self-search; attorney opinion optional)
- ☐ E&O / professional liability insurance — **defer until go-live gate** (Phase 5); some partner hospital contracts will require it

## Phase 2 — Provider Network (weeks 3–10, overlaps Phase 1)

For each target specialty (start: dental + bariatric):

- ☐ Longlist 5–8 candidate facilities per hub (Tijuana/Los Algodones first)
- ☐ Verify credentials for each: COFEPRIS license number, physician board certification (cédula), malpractice insurance certificate — request documents, record in provider file
- ☐ Conduct on-site visits — interview staff, inspect surgical/recovery areas, review infection-control practices
- ☐ Collect patient references/outcome data where available
- ☐ Sign bilingual referral agreement per provider (commission rate, responsibilities, data handling, termination terms)
- ☐ **Mexican providers only** — never sign referral-fee agreements with US-based providers (AKS: commissions on referrals touching Medicare/Medicaid business are a federal crime)
- ☐ Build provider scorecards; schedule annual re-vetting
- ☐ Define escalation path: what happens on complication, complaint, or quality drift

## Phase 2b — Federal Anti-Kickback (AKS) Safeguards

AKS (42 U.S.C. § 1320a-7b(b)) criminalizes paying/receiving anything of value for referrals into care paid by Medicare, Medicaid, TRICARE, or VA. Our model is safe only because Mexican providers cannot bill federal programs and patients pay cash. Keep it that way.

Background: Medicare pays nothing for elective care outside the US (foreign-hospital coverage exists only for emergencies occurring on US soil near a border); Medicaid generally doesn't cover out-of-state, let alone out-of-country, care. There is no legitimate reimbursement path — any "claim" would be fraud (e.g., forged invoices or a US provider re-billing), which we must never assist or appear to assist:

- ☐ Add a screening question to intake: "Do you intend to seek reimbursement from Medicare/Medicaid for any part of this?" — document the answer per lead
- ☐ Written policy: commissions accepted only from Mexican providers; never from any US-based provider
- ☐ Written policy: never assist with any Medicare/Medicaid claim related to a medical travel trip
- ☐ Revisit compliance attorney review before: partnering with any US clinic, selling employer benefit products, or handling insurance navigation

## Phase 3 — Operations Setup (weeks 4–8)

- ☐ CRM configured (HubSpot free tier → paid when >50 leads/mo) with lead pipeline stages
- ☐ Lead capture endpoint live (Formspree or small Worker) wired to `NEXT_PUBLIC_LEAD_ENDPOINT`
- ☐ Business phone line + email addresses (hello@, care@)
- ☐ Intake questionnaire template (procedure, records, budget, timeline)
- ☐ Quote-request workflow documented: intake → match providers → collect quotes → present to patient
- ☐ Patient record templates: consent-to-facilitate form, disclosure forms, post-op survey
- ☐ Data-handling policy: minimize PHI collection, secure storage, retention limits
- ☐ Care-coordinator playbook (scripts, FAQ answers, city safety briefings)

## Phase 4 — Website & Marketing Readiness (weeks 6–12)

- ☑ Static site built (`apps/collapse-health`) with non-operating banner
- ☑ Compliance-safe copy: illustrative pricing only, facilitator disclosures, waitlist instead of quotes
- ☐ Remove "not currently operating" banner at actual launch (edit `SiteBanner.jsx`)
- ☐ Switch CTA copy from waitlist → free quote at launch (`page.js`, `LeadForm.jsx`, nav buttons)
- ☐ Deploy to Cloudflare Pages (`npx wrangler pages deploy out --project-name collapse-health --branch main`)
- ☐ Attach custom domain `health.collapsetechnologies.com` to the Pages project
- ☐ Analytics (privacy-friendly: Plausible/Fathom or GA4) + conversion tracking on lead form
- ☐ SEO foundation: procedure cost guides ×10, destination guides ×5, FAQ schema
- ☐ Launch ad tests: Google Search ($1.5–3k/mo) + Meta ($0.5–1.5k/mo), track CPL and booking rate

## Phase 5 — Go-Live Gates (do NOT operate until all checked)

- ☑ Entity formed, bank account confirmed
- ☐ Attorney-reviewed T&Cs, privacy policy, and referral disclosures live on site
- ☐ ≥3 anchor providers under signed Mexican referral agreements with verified licenses
- ☐ At least 1 completed on-site visit per anchor provider (documented = liability shield)
- ☐ E&O insurance bound (first booking is the trigger)
- ☐ AKS screening question + policies in place (Phase 2b)
- ☐ Lead pipeline tested end-to-end with a test inquiry
- ☐ Financial model reviewed: CAC targets, commission collection process (invoicing providers)
- ☐ Remove non-operating banner; switch site to live mode

## Phase 6 — Post-Launch (first 90 days)

- ☐ Weekly provider check-ins; monthly quality scorecard updates
- ☐ Post-return patient surveys after every booking
- ☐ Track: leads, consults, bookings, revenue/booking, CAC, complication reports
- ☐ First commission invoices collected from providers
- ☐ Iterate marketing toward lowest-CPL channel
- ☐ Phase-2 expansion decision: orthopedic + cosmetic specialties, second-city visits
