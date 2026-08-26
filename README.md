# Collapse Technologies

The workspace behind [collapsetechnologies.com](https://collapsetechnologies.com): an independent technology studio making software, games, and long-term platforms.

## Applications

| Application | Directory | Purpose |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Studio landing site |
| Asymmetric Challenge | `apps/asymmetric-challenge` | 256-bit key challenge experiment |
| Dress Like Me | `apps/dress-like-me` | Creator-style discovery and shopping matches |
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
| Asymmetric Challenge | `apps/asymmetric-challenge` | Cloudflare Workers via `@opennextjs/cloudflare` | `challenge.collapsetechnologies.com` (pending) |
| Dress Like Me | `apps/dress-like-me` | Cloudflare Workers via `@opennextjs/cloudflare` | `dresslikeme.collapsetechnologies.com` (parked) |
| Influence.Market | `apps/influence-market` | Cloudflare Workers via `@opennextjs/cloudflare` + Cloudflare D1 (native `DB` binding; Supabase Postgres optional) | `influence-market.juanquirino-workers.workers.dev` · `influence.market` (domain pending) |
| CoachGG | `apps/coach-gg` | Render web service (`srv-da56cr2jobas73dmulv0`) | `coachgg-api.onrender.com` ✅ live |
| Infinite Pixelboard | `apps/infinite-pixelboard` | Render web service (`srv-da55t78u01pc73e3rlu0`) + Render Key Value (Redis) | `infinite-pixelboard.onrender.com` ✅ live |

### Cloudflare Pages / Workers

Frontends deploy from the repo with `wrangler`. The Collapse Technologies site is fully static — build the static export, then deploy the `out/` folder:

```bash
cd apps/collapse-technologies
npx next build
npx wrangler pages deploy out --project-name collapse-technologies --branch main
```

> **Gotcha:** `next.config.mjs` sets `output: "export"`. Deploy `out/` (the static export), not `.next/` or `.next/server/app`. The old `.next/server/app` recipe shipped HTML without any `_next/static` chunks, so every stylesheet/script request fell through to the HTML fallback and the page rendered unstyled and broken.

DNS lives on Cloudflare (zone `collapsetechnologies.com`). Apex and `www` are proxied CNAMEs to `collapse-technologies.pages.dev`. Email records are untouched. Product subdomains get attached as custom domains on their Pages/Workers projects during cutover.

Each application owns its environment variables; do not share the challenge or Dress Like Me Supabase credentials with the studio project.

### Render (backends)

Render services live in project **collapse-tech**; `apps/render.yaml` documents the intended blueprint. Both backends are Docker builds from their app directories and auto-deploy on push to `main`:

- **Pixelboard** — root dir `apps/infinite-pixelboard`, env: `ASPNETCORE_ENVIRONMENT=Production`, `REDISCONNECTIONSTRING` (Render KV internal URL), `Firebase__Enabled=true`, `Firebase__ProjectId`, `FORWARDEDHEADERS__TRUSTPLATFORMPROXY=true`.
- **CoachGG** — root dir `apps/coach-gg`, env: `STARTGG_APIKEY`, `ASPNETCORE_ENVIRONMENT=Production`, `FORWARDEDHEADERS__TRUSTPLATFORMPROXY=true`.

Custom domains (`pixelboard.collapsetechnologies.com`, `coach.collapsetechnologies.com`) attach to the Render services after DNS cutover.

The legacy Azure Container Apps stack (`apps/infinite-pixelboard/Infrastructure/Cloud/ContainerApp.json` + `.github/workflows/deploy-pixelboard.yml`) is retired pending decommission of the Azure resource group.
