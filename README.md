# Collapse Technologies

The workspace behind [collapsetechnologies.com](https://collapsetechnologies.com): an independent technology studio making software, games, and long-term platforms.

## Applications

| Application | Directory | Purpose |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Studio landing site |
| Asymmetric Challenge | `apps/asymmetric-challenge` | 256-bit key challenge experiment |
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
| Infinite Pixelboard | `apps/infinite-pixelboard` | Container image built from its `Dockerfile` | Configure separately |

Vercel automatically detects Next.js from the selected root directory. The challenge's existing Supabase environment variables belong only to the Asymmetric Challenge project; they must not be added to the studio project.

Infinite Pixelboard requires a persistent ASP.NET Core process for SignalR and a Redis instance. It is not compatible with Vercel's serverless runtime, so it intentionally has no `vercel.json`. Its production container must set `ASPNETCORE_ENVIRONMENT=Production` and `redisconnectionstring`.
