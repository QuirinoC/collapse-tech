# Collapse Health

Planned medical travel service connecting US/Canada patients with licensed
Mexican hospitals and specialists. **Not currently operating** — the site is a
concept preview with a persistent work-in-progress banner and no prices.

**Live:** https://health.collapsetechnologies.com

Business docs (internal only): [STARTUP-COSTS.md](./STARTUP-COSTS.md),
[LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md),
[PROCEDURE-COMPARISON.md](./PROCEDURE-COMPARISON.md).

## Compliance posture

- Pure facilitator framing everywhere: "we do not practice medicine; all care
  by independent, licensed Mexican providers."
- No prices or savings percentages anywhere customer-facing. When operating,
  patients receive itemized quotes directly from providers.
- WIP banner (`SiteBanner.jsx`) states the service is not accepting patients.

## Stack & architecture

- Next.js 16 static export (`output: "export"` in `next.config.mjs`).
- Light clinical theme in `app/globals.css` (white / teal `#0e7c66` /
  navy `#12314f`), matching monorepo design conventions.
- Lead capture: the waitlist form (`LeadForm.jsx`) POSTs JSON to
  `NEXT_PUBLIC_LEAD_ENDPOINT`, baked at build time.
- Endpoint is Cloudflare Worker [`collapse-health-leads`](#lead-worker) backed
  by KV. Without the env var the form falls back to an email address message.

### Lead Worker

| Piece | Value |
|---|---|
| Worker | `collapse-health-leads` |
| URL | `https://collapse-health-leads.juanquirino-workers.workers.dev` |
| KV namespace | `LEADS` → `collapse-health-leads` (`70cad5f5e57648639b93e60f3f0aaa93`) |

POST-only, accepts `{name, email, phone?, procedure?, notes?}` plus a honeypot
field. Validates email shape, dedupes via index key `email:<addr>` → lead id,
and stores the record at `lead:<uuid>` (name, email, phone, procedure, notes,
UA, country, timestamp).

The Worker source and its KV binding are versioned under `worker/`:

```bash
npm test
npx wrangler deploy --config worker/wrangler.jsonc
```

## Local development

```bash
npm install
npm run dev            # form shows fallback email message without endpoint
NEXT_PUBLIC_LEAD_ENDPOINT=https://collapse-health-leads.juanquirino-workers.workers.dev npm run dev
```

## Build & deploy

Static export — deploy `out/`, never `.next/`:

```bash
NEXT_PUBLIC_LEAD_ENDPOINT=https://collapse-health-leads.juanquirino-workers.workers.dev \
  npm run build
npx wrangler pages deploy out --project-name collapse-health --branch main --commit-dirty=true
```

Custom domain `health.collapsetechnologies.com` is attached to the Pages
project (DNS zone lives on Cloudflare). If changing anything the lead endpoint
depends on, rebuild before deploying so the env var is re-baked.

At real launch: remove the WIP banner, complete Phase 5 gates in
[LICENSE-CHECKLIST](./LAUNCH-CHECKLIST.md) (E&O binding, provider visits).
