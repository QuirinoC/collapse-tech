# Infinite Pixelboard

Collaborative, infinite canvas drawing application built with ASP.NET Core 9 Razor Pages, SignalR, and Redis.

## Local development

Start a local Redis instance, then restore and run the application from the workspace root:

```bash
docker run --rm -p 6379:6379 redis:7-alpine
npm run restore:pixelboard
npm run dev:pixelboard
```

The development configuration connects to Redis at `localhost:6379`. The board is available at `/board`.

## Validation

```bash
npm run lint:pixelboard
npm run test:pixelboard
npm run build:pixelboard
```

## Deployment

The application requires a persistent ASP.NET Core process for SignalR and Redis-backed shared state, so it is not compatible with Vercel's serverless runtime and intentionally has no `vercel.json`.

Build from this directory with the included Dockerfile. The production container listens on port `8080` and requires:

| Variable | Purpose |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT=Production` | Enables production ASP.NET Core behavior |
| `redisconnectionstring` | Redis connection string for the collaborative board state |

`Infrastructure/Cloud/ContainerApp.json` retains the source repository's Azure Container Apps deployment template.
