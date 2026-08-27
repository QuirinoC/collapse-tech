# Collapse Health — Pre-launch decision checklist

> **Current status: do not operate.** Collapse Health is a concept preview, not
> an operating medical-tourism, referral, booking, travel, insurance, or
> emergency service. This planning document is not legal, medical, financial,
> regulatory, privacy, or insurance advice. Obtain qualified advice for the
> actual service model and every applicable jurisdiction before any launch.

## Public lead capture is unavailable

- ☐ This preview has no public lead-capture activation path. Do not add one by
  changing environment variables or copy.
- ☐ Treat a future registration flow as a separately designed and reviewed
  project; complete every gate below before proposing it.
- ☐ Obtain written legal, privacy, and security review covering the exact
  business model, jurisdictions, compensation, marketing, data flow, and
  consumer disclosures.
- ☐ Establish a documented minimum-data intake policy that excludes medical
  records, symptoms, diagnoses, treatments, insurance information, payments,
  and free-text health questions unless and until an approved program requires
  them.
- ☐ Publish reviewed privacy disclosures, consent language, retention periods,
  a deletion process, and a contact route for privacy requests.
- ☐ Configure and test a Cloudflare-managed hostname, WAF rate limiting, and
  server-side human verification before making the endpoint public.
- ☐ Confirm email ownership (for example, double opt-in) before using an address
  for marketing communications or describing a registration as verified consent.
- ☐ Test the normal, duplicate, invalid, abuse, storage-failure, consent
  withdrawal, and deletion paths without using real health information.
- ☐ Define an owner, secure access controls, retention schedule, deletion
  procedure, incident response process, and audit trail for stored data.

## Legacy Worker data

- ☐ Before unbinding or deleting the legacy KV namespace, a designated data
  owner must make and document a retention decision for each existing
  `lead:` record and its corresponding `email:` index. Export or delete the
  data only through an approved privacy process; do not read, export, or delete
  it through this preview-site change.

## Before announcing or offering any future service

- ☐ Obtain counsel-approved terms, privacy notices, marketing review, and
  jurisdiction-specific regulatory analysis.
- ☐ Verify that operational, clinical, provider, travel, payment, insurance,
  and emergency-support statements are accurate before publishing them.
- ☐ Do not claim or imply provider vetting, licensing verification,
  certification, accreditation, quality, outcomes, availability, prices,
  savings, insurance coverage, or emergency support without independently
  supportable and reviewed evidence.
- ☐ Establish policies for provider conflicts, compensation disclosures,
  consumer complaints, safety escalation, record handling, and marketing
  claims before describing any service publicly.
- ☐ Complete a production security review, including access control, logging,
  secret management, rate limiting, human-verification replay handling, and
  incident response.
- ☐ Conduct a complete legal, privacy, accessibility, security, and
  end-to-end deployment review before removing the non-operating banner.

## Non-negotiable preview-site rules

- Keep the persistent work-in-progress banner and non-operating disclosures.
- Do not accept patients, make referrals, arrange bookings or travel, provide
  clinical or insurance guidance, collect health records, or handle emergencies.
- Do not publish provider, price, savings, insurance, or outcomes claims.
- Treat any later launch as a new, reviewed project rather than activating this
  preview by changing copy alone.
