# Collapse Technologies

The workspace behind [collapsetechnologies.com](https://collapsetechnologies.com): an independent technology studio making software, games, and long-term platforms.

## Applications

| Application | Directory | Purpose |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Studio landing site |
| Asymmetric Challenge | `apps/asymmetric-challenge` | 256-bit key challenge experiment |
| Dress Like Me | `apps/dress-like-me` | Creator-style discovery and shopping matches |
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

Create Vercel projects for the Next.js applications. In each project, set **Root Directory** before deploying:

| Application | Root Directory | Deployment target | Production domain |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Vercel | `collapsetechnologies.com` |
| Asymmetric Challenge | `apps/asymmetric-challenge` | Vercel | Configure separately |
| Dress Like Me | `apps/dress-like-me` | Vercel | `dresslikeme.collapsetechnologies.com` |
| Infinite Pixelboard | `apps/infinite-pixelboard` | Container image built from its `Dockerfile` | Configure separately |

Vercel automatically detects Next.js from the selected root directory. Each application owns its environment variables; do not share the challenge or Dress Like Me Supabase credentials with the studio project. Vercel Web Analytics is mounted in all three Vercel applications and intentionally omitted from Infinite Pixelboard.

Infinite Pixelboard requires a persistent ASP.NET Core process for SignalR and a Redis instance. It is not compatible with Vercel's serverless runtime, so it intentionally has no `vercel.json`. Its production container must set `ASPNETCORE_ENVIRONMENT=Production` and `redisconnectionstring`.
