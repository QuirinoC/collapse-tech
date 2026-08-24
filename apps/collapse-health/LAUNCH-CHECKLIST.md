# Collapse Health — Launch Checklist
Everything required before legally and safely operating as a medical tourism
referral facilitator (US/Canada → Mexico). Companion to [STARTUP-COSTS.md](./STARTUP-COSTS.md).

Status legend: ☐ not started · ◐ in progress · ☑ done

## Phase 1 — Legal & Corporate Foundation (weeks 1–3)

- ☐ Form US entity (LLC/C Corp) and obtain EIN
- ☐ Open business bank account (+ optional Mercury/Relay for startups)
- ☐ Retain US healthcare-compliance attorney for one-time posture review
  - Confirm facilitator (non-broker) positioning per state
  - Review marketing language for FTC risk
  - Draft Terms of Service, Privacy Policy, referral disclosure language
  - Written memo: AKS/Stark boundaries (no Medicare/Medicaid patients, no physician ownership)
- ☐ Retain Mexican healthcare attorney
  - Template referral/commission agreement (bilingual EN/ES) enforceable under Mexican commercial law
  - Verification checklist for COFEPRIS sanitary licenses and physician cédulas
  - Guidance on Mexican medical-tourism council registration (optional legitimacy boost)
- ☐ Purchase E&O / professional liability insurance (~$2–6k/yr)
- ☐ Decide brand entity naming (Collapse Health as DBA/trademark check)

## Phase 2 — Provider Network (weeks 3–10, overlaps Phase 1)

For each target specialty (start: dental + bariatric):

- ☐ Longlist 5–8 candidate facilities per hub (Tijuana/Los Algodones first)
- ☐ Verify credentials for each: COFEPRIS license, physician board certification (cédula), malpractice insurance certificate
- ☐ Conduct on-site visits — interview staff, inspect surgical/recovery areas, review infection-control practices
- ☐ Collect patient references/outcome data where available
- ☐ Sign bilingual referral agreement per provider (commission rate, responsibilities, data handling, termination terms)
- ☐ Build provider scorecards; schedule annual re-vetting
- ☐ Define escalation path: what happens on complication, complaint, or quality drift

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

- ☐ Entity formed, bank account open, E&O insurance bound
- ☐ ≥3 anchor providers under signed referral agreements with verified licenses
- ☐ At least 1 completed on-site visit per anchor provider
- ☐ Attorney-reviewed T&Cs, privacy policy, and referral disclosures live on site
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
