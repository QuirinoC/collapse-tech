# Collapse Technologies

The workspace behind [collapsetechnologies.com](https://collapsetechnologies.com): an independent technology studio making software, games, and long-term platforms.

## Applications

| Application | Directory | Purpose |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Studio landing site |
| Asymmetric Challenge | `apps/asymmetric-challenge` | 256-bit key challenge experiment |
| Dress Like Me | `apps/dress-like-me` | Creator-style discovery and shopping matches |
| Collapse Health | `apps/collapse-health` | Medical tourism referral site (US/Canada → Mexico) |
| Influence.Market | `apps/influence-market` | Influencer marketing agency-marketplace: escrowed multi-creator campaigns |
| CoachGG | `apps/coach-gg` | Super Smash Bros. Ultimate player analysis with live SignalR updates |
| Infinite Pixelboard | `apps/infinite-pixelboard` | Collaborative, infinite canvas built with ASP.NET Core SignalR |

## Local development

Each application owns its dependencies and can run independently:

```bash
npm --prefix apps/collapse-technologies install
npm run dev:studio
```

```bash
npm --prefix apps/asymmetric-challenge install
npm run dev:challenge
```

```bash
npm --prefix apps/dress-like-me install
npm run dev:dress
```

Collapse Health is a fully static export, same as the studio site:

```bash
npm --prefix apps/collapse-health install
npx --prefix apps/collapse-health next dev   # or: cd apps/collapse-health && npm run dev
```

```bash
npm --prefix apps/influence-market install
npm run dev:influence
# Runs in demo mode with seeded creators; add Supabase/Stripe env for production mode.
```

```bash
docker run --rm -p 6379:6379 redis:7-alpine
npm run restore:coach
STARTGG_APIKEY=your_token REDIS_CONNECTION=localhost:6379 npm run dev:coach
```

```bash
docker run --rm -p 6379:6379 redis:7-alpine
npm run restore:pixelboard
npm run dev:pixelboard
```

Root scripts run the relevant command in each app:

```bash
npm run build
npm run lint
npm test
```

## Deployments

**Current architecture (Aug 2026): Cloudflare for frontends + DNS, Render for backends. Azure and Vercel are retired.**

| Application | Directory | Host | Production URL |
| --- | --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Cloudflare Pages (static export) | `collapsetechnologies.com` ✅ live |
| Asymmetric Challenge | `apps/asymmetric-challenge` | Cloudflare Workers via `@opennextjs/cloudflare` | `challenge.collapsetechnologies.com` ✅ live (`x-opennext: 1`) |
| Dress Like Me | `apps/dress-like-me` | Cloudflare Workers via `@opennextjs/cloudflare` | `dresslikeme.collapsetechnologies.com` ✅ live (app itself still pre-launch) |
| Collapse Health | `apps/collapse-health` | Cloudflare Pages (static export) + lead Worker `collapse-health-leads` (KV-backed) | `health.collapsetechnologies.com` ✅ live — WIP/not-operating banner, no prices |
| Influence.Market | `apps/influence-market` | Cloudflare Workers via `@opennextjs/cloudflare` + Cloudflare D1 (native `DB` binding; Supabase Postgres optional) | `influence-market.juanquirino-workers.workers.dev` · `influence.market` (domain pending) |
| CoachGG | `apps/coach-gg` | Render web service (`srv-da56cr2jobas73dmulv0`) | `coachgg-api.onrender.com`, custom domain `coach.collapsetechnologies.com` ✅ live |
| Infinite Pixelboard | `apps/infinite-pixelboard` | Render web service (`srv-da55t78u01pc73e3rlu0`) + Render Key Value (Redis) | `infinite-pixelboard.onrender.com`, custom domain `pixelboard.collapsetechnologies.com` ✅ live |
| Infinite Pixelboard iOS | `apps/infinite-pixelboard-ios` | Native SwiftUI app (TestFlight/App Store) — no server deploys; talks to the pixelboard API + Firebase Auth | n/a |

### Cloudflare Pages / Workers

Frontends deploy from the repo with `wrangler`. The Collapse Technologies site is fully static — build the static export, then deploy the `out/` folder:

```bash
cd apps/collapse-technologies
npx next build
npx wrangler pages deploy out --project-name collapse-technologies --branch main
```

> **Gotcha:** `next.config.mjs` sets `output: "export"`. Deploy `out/` (the static export), not `.next/` or `.next/server/app`. The old `.next/server/app` recipe shipped HTML without any `_next/static` chunks, so every stylesheet/script request fell through to the HTML fallback and the page rendered unstyled and broken.

Collapse Health deploys the same way, plus a lead-capture Worker:

```bash
cd apps/collapse-health
NEXT_PUBLIC_LEAD_ENDPOINT=https://collapse-health-leads.juanquirino-workers.workers.dev \
  npm run build
npx wrangler pages deploy out --project-name collapse-health --branch main --commit-dirty=true
npx wrangler deploy --config worker/wrangler.jsonc
```

The lead form posts JSON to that Worker (KV namespace `LEADS`, email-deduped).
See `apps/collapse-health/README.md` for the Worker's API and architecture.
`NEXT_PUBLIC_LEAD_ENDPOINT` is baked at build time — always rebuild before
deploying; without it the form shows a fallback email address.

DNS lives on Cloudflare (zone `collapsetechnologies.com`). Apex and `www` are proxied CNAMEs to `collapse-technologies.pages.dev`. Email records are untouched. Product subdomains are attached as custom domains on their Pages/Workers projects.

Each application owns its environment variables; do not share the challenge or Dress Like Me Supabase credentials with the studio project.

### Render (backends)

Render services live in project **collapse-tech**; `apps/render.yaml` documents the blueprint (currently covers the pixelboard service; CoachGG is managed directly in the Render dashboard). Both backends are Docker builds from their app directories and auto-deploy on push to `main`:

- **Pixelboard** — root dir `apps/infinite-pixelboard`, env: `ASPNETCORE_ENVIRONMENT=Production`, `REDISCONNECTIONSTRING` (Render KV internal URL), `Firebase__Enabled=true`, `Firebase__ProjectId`, `FORWARDEDHEADERS__TRUSTPLATFORMPROXY=true`.
- **CoachGG** — root dir `apps/coach-gg`, env: `STARTGG_APIKEY`, `ASPNETCORE_ENVIRONMENT=Production`, `FORWARDEDHEADERS__TRUSTPLATFORMPROXY=true`.

Custom domains (`pixelboard.collapsetechnologies.com`, `coach.collapsetechnologies.com`) are attached to the Render services.

The legacy Azure Container Apps stack (`apps/infinite-pixelboard/Infrastructure/Cloud/ContainerApp.json` + `.github/workflows/deploy-pixelboard.yml`) is retired pending decommission of the Azure resource group.
