# Collapse Health

Collapse Health is an early Collapse Technologies concept preview. **It is not
currently operating.** The site does not provide medical advice, clinical care,
provider recommendations, referrals, bookings, travel arrangements, insurance
guidance, or emergency services.

**Live preview:** https://health.collapsetechnologies.com

Internal planning documents: [STARTUP-COSTS.md](./STARTUP-COSTS.md),
[LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md), and
[PROCEDURE-COMPARISON.md](./PROCEDURE-COMPARISON.md).

## Current data and safety posture

- The persistent work-in-progress banner is intentional and must remain until a
  separately reviewed launch decision.
- The preview collects no contact details, medical records, symptoms, treatment
  requests, insurance details, provider preferences, or free-text notes.
- The static form is deliberately unavailable, and the Worker rejects every
  registration request. It has no storage binding or public `workers.dev` URL.

## Stack

- Next.js 16 static export (`output: "export"`).
- The Cloudflare Worker under `worker/` provides a defensive, unavailable
  response for legacy requests while this remains a concept preview.

## Local validation

```bash
npm ci
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run --config worker/wrangler.jsonc
```

## Future launch-update work

This repository deliberately contains no activation switch for public
registration. A future registration flow must be a separately reviewed project;
do not add an endpoint or enable collection by changing environment variables or
copy. At a minimum, it requires:

1. Obtain legal, privacy, and security review appropriate to every target
   jurisdiction and the actual service model.
2. Put the endpoint behind a Cloudflare-managed hostname and configure a
   Cloudflare WAF rate-limiting rule before exposing it. CORS and a honeypot are
   defense in depth, not access control.
3. Add and validate a server-side human-verification control such as Turnstile
   before accepting public registrations. Never rely on a client-side widget
   without server-side validation.
4. Use confirmed email ownership (for example, double opt-in) before treating
   an address as marketing consent.
5. Test consent recording, retention expiry, deletion handling, abuse controls,
   and the failure path before publishing the endpoint.

## Static deployment

Deploy `out/`, never `.next/`:

```bash
npm run build
npx wrangler pages deploy out --project-name collapse-health --branch main --commit-dirty=true
```

Do not set `NEXT_PUBLIC_LEAD_ENDPOINT` for this preview deployment.
