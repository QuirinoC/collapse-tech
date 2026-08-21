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
npm run test:pixelboard:web
npm run test:pixelboard
npm run build:pixelboard
```

## Browser architecture

The Razor pages at `/` and `/board` share a progressively enhanced canvas shell. Browser behavior is split into dependency-free ES modules under `wwwroot/js/pixelboard`:

- `viewport.mjs` owns row/column transforms, negative-coordinate tile math, pan, and pointer-anchored zoom.
- `tile-cache.mjs` deduplicates visible tile reads and keeps a bounded in-memory cache.
- `pointer-controls.mjs` provides pointer, wheel, touch, and keyboard navigation.
- `renderer.mjs` draws device-pixel-aware hard-edged pixels and grid lines.
- `api.mjs` is the only browser transport and uses the v1 HTTP routes.
- `reconciliation.mjs` applies optimistic pixels and rolls them back when placement is rejected.
- `account-state.mjs` and `connection-state.mjs` expose cooldown and network state without coupling them to the UI.

Anonymous visitors can navigate and read public tiles. Painting only uses `POST /api/v1/placements`; legacy `SendPixel` is not used by the browser. Google and Apple controls are intentional placeholders until the production Firebase web configuration and provider flows are available.

## Frozen board compatibility contract

The deployed board uses a legacy coordinate convention that must remain stable while clients migrate:

- A server `x` coordinate is the visual **row/Y axis**.
- A server `y` coordinate is the visual **column/X axis**.
- Redis keys are `MainBoard_{tileRow}_{tileColumn}` (plus the configured `PixelBoard_` cache instance prefix).
- Each tile is a JSON `string[][]` with 128 rows and 128 columns, addressed as `pixels[row][column]`.
- Colors are persisted as their original CSS hex strings; the default is `#FFFFFF`.
- Negative positions use floor-based tile coordinates and positive offsets. For example, `(-1, -1)` is offset `(127, 127)` in tile `(-1, -1)`.

`Domain/BoardGeometry.cs` and `Domain/BoardTileSerializer.cs` are the source of truth for this format. Compatibility tests intentionally use row/column names instead of silently normalizing the old `x`/`y` terminology.

Versioned transport shapes and machine-readable errors for the shared web/iOS API live in `Contracts/V1`. Anonymous board metadata and tile snapshots are available at `/api/v1/board` and `/api/v1/tiles/{tileRow}/{tileColumn}`. Authenticated clients can read account state, accept the current community standards, submit idempotent placements, and report a current position or bounded region through `/api/v1/account`, `/api/v1/account/community-standards`, `/api/v1/placements`, and `/api/v1/reports`.

Placement is unavailable unless Firebase and PostgreSQL are enabled. Accepted writes atomically update the board, attribution outbox, idempotency record, and account cooldown in Redis. Free accounts receive a ten-second cooldown; active Pro entitlements receive a one-second cooldown. The existing SignalR endpoint remains active for compatibility until real-time v1 events and migrated clients are ready.

## Firebase authentication

Set `Firebase__Enabled=true` and `Firebase__ProjectId=<project-id>` to enable bearer authentication. The API validates Firebase ID tokens through Google's OpenID metadata using the project-specific issuer and audience, RS256 signatures, token lifetime, subject, issued-at, and authentication-time claims. It does not require a Firebase Admin service-account key.

Firebase configuration is intentionally disabled by default. Protected placement endpoints must not be enabled until Google and Apple providers, authorized domains, and the production project ID are configured.

## Pixelboard Pro and StoreKit

StoreKit support is disabled by default and requires PostgreSQL. Authenticated iOS clients first request `/api/v1/storekit/account-token` and pass that opaque server-bound UUID to StoreKit as the purchase's App Account Token. They submit StoreKit's signed transaction JWS to `/api/v1/storekit/transactions` after purchase or restore. App Store Server Notifications V2 posts `{ "signedPayload": "..." }` to the unauthenticated `/api/v1/storekit/notifications` webhook so renewals, expirations, refunds, and revocations are applied while the app is closed.

Both client submissions and server notifications validate the ES256 signature and complete X.509 chain against explicitly configured Apple trust anchors, then enforce the bundle ID, product ID, environment, App Account Token, and signed timestamp. Subscription ownership is permanent, transaction ingestion is idempotent, and older events cannot overwrite newer entitlement state.

Configure `StoreKit__Enabled=true`, `StoreKit__BundleId`, `StoreKit__MonthlyProductId`, `StoreKit__AnnualProductId`, one or more base64 DER Apple root certificates under `StoreKit__TrustedRootCertificates__0`, and allowed App Store environments under `StoreKit__AllowedEnvironments__0`. Production should allow only `Production`; add `Sandbox` only in non-production/TestFlight environments.

## Advertising safety gate

Advertising is disabled by default. The web client supports exactly one manually positioned horizontal AdSense unit on the Pixelboard surface. It never enables Auto Ads, anchors, vignettes, interstitials, automatic refresh, or rewarded placement advantages. The Google script is loaded only after account state is known and is never requested for Pro accounts. A failed Google request falls back to a first-party Pro promotion.

Production startup rejects advertising unless `Advertising__ModerationOperationsEnabled=true`. This setting is an operational assertion: do not enable it merely because report intake exists. A staffed report queue, moderator actions, emergency ad shutdown, and the moderation runbooks must be working first. Set `Advertising__WebEnabled=true`, a `ca-pub-...` publisher ID, and the numeric manual unit ID in `Advertising__AdSenseBoardSlotId` only after that gate is met.

Before launch, block sexual and other unsuitable sensitive categories in AdSense and AdMob, use Ad Review Center, and complete Google consent/CMP configuration. When the respective ad platform is safely enabled, the service publishes the configured authorized-seller record at `/ads.txt` or `/app-ads.txt`; otherwise those routes return 404. Do not use production ad identifiers outside production. Mobile ads remain configuration-only until the native client implements a reserved banner with the configured maximum content rating; `MA` is intentionally rejected.

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
| `StoreKit__Enabled` | Enables signed StoreKit transaction and notification processing |
| `StoreKit__BundleId` | Exact iOS application bundle identifier |
| `StoreKit__MonthlyProductId` / `StoreKit__AnnualProductId` | Accepted Pro subscription product identifiers |
| `StoreKit__TrustedRootCertificates__0` | Base64 DER Apple root certificate trust anchor |
| `StoreKit__AllowedEnvironments__0` | Accepted App Store environment (`Production` in production) |
| `Advertising__ModerationOperationsEnabled` | Operational assertion required before any Google advertising can start |
| `Advertising__WebEnabled` | Enables the single manual AdSense board unit |
| `Advertising__AdSensePublisherId` | AdSense publisher ID in `ca-pub-...` format |
| `Advertising__AdSenseBoardSlotId` | Numeric ID for the manual board unit |
| `Advertising__MobileEnabled` | Enables mobile ad eligibility for the future native client |
| `Advertising__AdMobApplicationId` | AdMob app ID in `ca-app-pub-...~...` format |
| `Advertising__AdMobMaxContentRating` | Maximum mobile ad content rating (`G`, `PG`, or `T`) |

`Infrastructure/Cloud/ContainerApp.json` retains the source repository's Azure Container Apps deployment template.

## Moderation ledger

PostgreSQL-backed attribution is feature-gated with `Postgres:Enabled` and remains off until the database is provisioned and every ordered script in `Infrastructure/Postgres/Migrations` has been applied by a dedicated migration identity. The runtime role must not own the schema.

Accepted authenticated placements will use an atomic Redis operation that updates the compatible board tile, updates current-pixel ownership, and appends a durable outbox event. `PlacementOutboxWorker` idempotently copies that stream into PostgreSQL, acknowledges and removes an entry only after the database write succeeds, and reclaims abandoned pending entries after a configurable idle period. The worker emits ingested, failed, and reclaimed counters through `System.Diagnostics.Metrics`.

### Reporting safety foundation

`POST /api/v1/reports` accepts authenticated reports for a single current pixel or a region of at most 64 by 64 pixels (4,096 pixels total). Coordinates retain the legacy row/column convention. The server validates the reason, optional 500-character note, and client metadata; rechecks the durable account-ban policy; and applies per-account Redis duplicate suppression and a five-reports-per-ten-minutes limit before writing PostgreSQL.

Evidence is server-authored. The service captures current Redis board colors and up to 500 attributed PostgreSQL placements in the region from the preceding 24 hours, hashes the serialized evidence, and stores it with the report. Clients cannot submit screenshots or attribution. Firebase UIDs in evidence remain private in PostgreSQL and are never returned by the public report response, which contains only an opaque report ID, status, and submission time.

### Moderator operations

The private `/moderation` console and `/api/v1/moderation` routes require an authenticated Firebase token with the exact custom claim `moderator=true`. They expose the report queue and server-authored evidence plus audited, idempotent dismiss, quarantine, rollback, warn, suspend, ban, placement-freeze, and ad-shutdown actions. Quarantine masks active regions from public tile snapshots. Rollback only changes selected placements that are still current and restores the prior color and ownership state.

Redis board state and the asynchronous PostgreSQL placement ledger can briefly differ, and rollback spans Redis, board storage, and PostgreSQL rather than a distributed transaction. Keep placements frozen after any partial failure and reconcile against the durable action and placement ledgers. Follow [`docs/MODERATION_RUNBOOK.md`](docs/MODERATION_RUNBOOK.md) for launch gates, triage, incidents, appeals, and routine access checks. Advertising must remain disabled until those operational gates are staffed and exercised.
