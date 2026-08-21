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

## Frozen board compatibility contract

The deployed board uses a legacy coordinate convention that must remain stable while clients migrate:

- A server `x` coordinate is the visual **row/Y axis**.
- A server `y` coordinate is the visual **column/X axis**.
- Redis keys are `MainBoard_{tileRow}_{tileColumn}` (plus the configured `PixelBoard_` cache instance prefix).
- Each tile is a JSON `string[][]` with 128 rows and 128 columns, addressed as `pixels[row][column]`.
- Colors are persisted as their original CSS hex strings; the default is `#FFFFFF`.
- Negative positions use floor-based tile coordinates and positive offsets. For example, `(-1, -1)` is offset `(127, 127)` in tile `(-1, -1)`.

`Domain/BoardGeometry.cs` and `Domain/BoardTileSerializer.cs` are the source of truth for this format. Compatibility tests intentionally use row/column names instead of silently normalizing the old `x`/`y` terminology.

Versioned transport shapes and machine-readable errors for the shared web/iOS API live in `Contracts/V1`. Anonymous board metadata and tile snapshots are available at `/api/v1/board` and `/api/v1/tiles/{tileRow}/{tileColumn}`. Authenticated clients can read account state, accept the current community standards, and submit idempotent placements through `/api/v1/account`, `/api/v1/account/community-standards`, and `/api/v1/placements`.

Placement is unavailable unless Firebase and PostgreSQL are enabled. Accepted writes atomically update the board, attribution outbox, idempotency record, and account cooldown in Redis. Free accounts receive a ten-second cooldown; active Pro entitlements receive a one-second cooldown. The existing SignalR endpoint remains active for compatibility until real-time v1 events and migrated clients are ready.

## Firebase authentication

Set `Firebase__Enabled=true` and `Firebase__ProjectId=<project-id>` to enable bearer authentication. The API validates Firebase ID tokens through Google's OpenID metadata using the project-specific issuer and audience, RS256 signatures, token lifetime, subject, issued-at, and authentication-time claims. It does not require a Firebase Admin service-account key.

Firebase configuration is intentionally disabled by default. Protected placement endpoints must not be enabled until Google and Apple providers, authorized domains, and the production project ID are configured.

## Deployment

The application requires a persistent ASP.NET Core process for SignalR and Redis-backed shared state, so it is not compatible with Vercel's serverless runtime and intentionally has no `vercel.json`.

Build from this directory with the included Dockerfile. The production container listens on port `8080` and requires:

| Variable | Purpose |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT=Production` | Enables production ASP.NET Core behavior |
| `redisconnectionstring` | Redis connection string for the collaborative board state |
| `Firebase__Enabled` | Enables Firebase bearer-token validation |
| `Firebase__ProjectId` | Firebase project ID used as token issuer and audience |
| `Postgres__Enabled` | Enables the durable placement ledger and outbox worker |
| `Postgres__ConnectionString` | PostgreSQL runtime connection string |

`Infrastructure/Cloud/ContainerApp.json` retains the source repository's Azure Container Apps deployment template.

## Moderation ledger

PostgreSQL-backed attribution is feature-gated with `Postgres:Enabled` and remains off until the database is provisioned and every ordered script in `Infrastructure/Postgres/Migrations` has been applied by a dedicated migration identity. The runtime role must not own the schema.

Accepted authenticated placements will use an atomic Redis operation that updates the compatible board tile, updates current-pixel ownership, and appends a durable outbox event. `PlacementOutboxWorker` idempotently copies that stream into PostgreSQL, acknowledges and removes an entry only after the database write succeeds, and reclaims abandoned pending entries after a configurable idle period. The worker emits ingested, failed, and reclaimed counters through `System.Diagnostics.Metrics`.
