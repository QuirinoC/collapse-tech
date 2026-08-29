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

`DELETE /api/v1/account` removes account, entitlement, StoreKit binding, and Stripe customer records before the client deletes the Firebase identity. Placements and moderation evidence that must remain operationally consistent are retained under a random, unlinkable `deleted:` identifier; embedded Firebase UIDs are replaced and evidence hashes are regenerated. A one-way account tombstone prevents still-valid Firebase tokens or delayed Redis outbox events from recreating identifiable records. Clients must not delete the Firebase identity when this server request fails.

Placement is unavailable unless Firebase and PostgreSQL are enabled. Accepted writes atomically update the board, attribution outbox, idempotency record, and account cooldown in Redis. Free accounts receive a five-second cooldown; active Pro entitlements receive a one-second cooldown.

### Real-time v1 protocol

Platform-neutral SignalR clients connect to `/api/v1/realtime` and handle the `AcceptedPixelV1` client method. Its sole argument is a JSON envelope with `protocolVersion: 1`, `type: "pixel.accepted"`, the ordering `cursor` from the atomic Redis stream append, and `data` containing only the public placement ID and pixel state (`row`, `column`, `color`, and `placedAt`). Cursors use Redis stream ID ordering (`milliseconds-sequence`) and let clients discard duplicate or stale delivery. The coordinates preserve the legacy row/Y and column/X convention described above.

Only newly accepted atomic Redis writes are published; rejected placements and idempotent replays produce no event. Redis pub/sub fans events out across ASP.NET replicas, and each replica checks current moderation visibility immediately before sending to SignalR or legacy hub clients. Placements in quarantined regions are suppressed and metered as `pixelboard.realtime.suppressed`; if visibility cannot be verified, delivery fails closed. Publication failures are logged and metered as `pixelboard.realtime.publication_failed` but do not turn a persisted accepted placement into an HTTP failure. Each replica bounds its ephemeral subscriber queue and meters overload drops as `pixelboard.realtime.dropped`; legacy fan-out reads the authoritative stored pixel before broadcasting so reordered publications cannot regress old clients, and meters transient read failures as `pixelboard.realtime.legacy_delivery_failed` without stopping v1 delivery. Pub/sub is intentionally not a replay log: clients must reconcile visible state from `/api/v1/tiles/{tileRow}/{tileColumn}` after connecting, after reconnecting, when delivery arrives below the highest observed cursor, and periodically while connected. The durable private placement outbox remains exclusively for PostgreSQL attribution recovery and is never exposed to clients.

The legacy `/boardHub` coordinate and message contract remains active during migration. New web and iOS clients must use `/api/v1/realtime`; the legacy hub can be retired only after all clients place through `/api/v1/placements`, consume `AcceptedPixelV1`, and use v1 tile snapshots for reconnect reconciliation.

The modular web client negotiates the SignalR JSON protocol directly over WebSocket, applies accepted events only to tiles already backed by a snapshot, and automatically reconnects with bounded backoff. It refreshes visible snapshots after every successful connection or reconnect, when publication order indicates concurrent delivery was reordered, and every five seconds while visible. These authoritative snapshots are the v1 catch-up boundary for missed, reordered, or suppressed events.

## Firebase authentication

Set `Firebase__Enabled=true` and `Firebase__ProjectId=<project-id>` to enable bearer authentication. The API validates Firebase ID tokens through Google's OpenID metadata using the project-specific issuer and audience, RS256 signatures, token lifetime, subject, issued-at, and authentication-time claims. It does not require a Firebase Admin service-account key.

Firebase configuration is intentionally disabled by default. Protected placement endpoints must not be enabled until Google and Apple providers, authorized domains, and the production project ID are configured.

## Pixelboard Pro and StoreKit

StoreKit support is disabled by default and requires PostgreSQL. Authenticated iOS clients first request `/api/v1/storekit/account-token` and pass that opaque server-bound UUID to StoreKit as the purchase's App Account Token. They submit StoreKit's signed transaction JWS to `/api/v1/storekit/transactions` after purchase or restore. App Store Server Notifications V2 posts `{ "signedPayload": "..." }` to the unauthenticated `/api/v1/storekit/notifications` webhook so renewals, expirations, refunds, and revocations are applied while the app is closed.

Both client submissions and server notifications validate the ES256 signature and complete X.509 chain against explicitly configured Apple trust anchors, then enforce the bundle ID, product ID, environment, App Account Token, and signed timestamp. Subscription ownership is permanent, transaction ingestion is idempotent, and older events cannot overwrite newer entitlement state.

Configure `StoreKit__Enabled=true`, `StoreKit__BundleId`, `StoreKit__MonthlyProductId`, `StoreKit__AnnualProductId`, one or more base64 DER Apple root certificates under `StoreKit__TrustedRootCertificates__0`, and allowed App Store environments under `StoreKit__AllowedEnvironments__0`. Production should allow only `Production`; add `Sandbox` only in non-production/TestFlight environments.

## Pixelboard Pro on the website (Stripe)

Stripe Checkout is disabled by default, website-only, and requires PostgreSQL. It must stay off in the iOS app: native Settings continues to use StoreKit. Both processors write the same `pixelboard.entitlements` row. A Stripe cancellation does not clear an still-valid StoreKit Pro entitlement.

Authenticated web clients read `GET /api/v1/stripe/config` and, after sign-in, `GET /api/v1/stripe/status`. Subscribe posts `{ "interval": "month" | "year" }` to `/api/v1/stripe/checkout-session` and redirects to the returned Checkout URL. Manage/cancel posts to `/api/v1/stripe/portal`. Stripe sends `checkout.session.completed`, `customer.subscription.*`, and invoice paid/failed events to the unauthenticated `/api/v1/stripe/webhook` with `Stripe-Signature`.

Do not commit secret keys. Enable only after applying `009_stripe.sql` (or `--provision-postgres`) and creating a Customer Portal configuration in Stripe. Local forwarding:

```bash
stripe listen --forward-to http://localhost:5262/api/v1/stripe/webhook
```

Configure `Stripe__Enabled=true`, `Stripe__SecretKey`, `Stripe__WebhookSecret`, `Stripe__MonthlyPriceId`, and `Stripe__AnnualPriceId`. Production webhook URL: `https://pixelboard.collapsetechnologies.com/api/v1/stripe/webhook`.

## Advertising safety gate

Advertising is disabled by default. The web client supports exactly one manually positioned horizontal AdSense unit on the Pixelboard surface. It never enables Auto Ads, anchors, vignettes, interstitials, automatic refresh, or rewarded placement advantages. The Google script is loaded only after account state is known and is never requested for Pro accounts. A failed Google request falls back to a first-party Pro promotion.

Production startup rejects advertising unless `Advertising__ModerationOperationsEnabled=true`. This setting is an operational assertion: do not enable it merely because report intake exists. A staffed report queue, moderator actions, emergency ad shutdown, and the moderation runbooks must be working first. Set `Advertising__WebEnabled=true`, a `ca-pub-...` publisher ID, and the numeric manual unit ID in `Advertising__AdSenseBoardSlotId` only after that gate is met.

Before launch, block sexual and other unsuitable sensitive categories in AdSense and AdMob, use Ad Review Center, and complete Google consent/CMP configuration. When the respective ad platform is safely enabled, the service publishes the configured authorized-seller record at `/ads.txt` or `/app-ads.txt`; otherwise those routes return 404. Do not use production ad identifiers outside production. Mobile ads remain configuration-only until the native client implements a reserved banner with the configured maximum content rating; `MA` is intentionally rejected.

## Deployment

The application requires a persistent ASP.NET Core process for SignalR and Redis-backed shared state. Production runs as a Render web service (auto-deploy on push to `main`) with Render Key Value providing Redis.

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
| `Stripe__Enabled` | Enables website Stripe Checkout, Customer Portal, and webhooks |
| `Stripe__SecretKey` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `Stripe__WebhookSecret` | Stripe webhook signing secret (`whsec_...`) |
| `Stripe__MonthlyPriceId` / `Stripe__AnnualPriceId` | Stripe Price IDs for Pixelboard Pro |
| `Advertising__ModerationOperationsEnabled` | Operational assertion required before any Google advertising can start |
| `Advertising__WebEnabled` | Enables the single manual AdSense board unit |
| `Advertising__AdSensePublisherId` | AdSense publisher ID in `ca-pub-...` format |
| `Advertising__AdSenseBoardSlotId` | Numeric ID for the manual board unit |
| `Advertising__MobileEnabled` | Enables mobile ad eligibility for the future native client |
| `Advertising__AdMobApplicationId` | AdMob app ID in `ca-app-pub-...~...` format |
| `Advertising__AdMobMaxContentRating` | Maximum mobile ad content rating (`G`, `PG`, or `T`) |

`Infrastructure/Cloud/ContainerApp.json` retains the retired Azure Container Apps deployment template for historical reference only; production is Render (see root README and `apps/render.yaml`).

## Moderation ledger

PostgreSQL-backed attribution is feature-gated with `Postgres:Enabled`. Production
keeps Pixelboard data in its own `pixelboard` schema and uses a restricted
runtime role. Apply the ordered scripts with the image's
`--provision-postgres` one-off command before enabling the service; see
`Infrastructure/Postgres/Migrations/README.md`. The runtime role must not own
the schema.

Accepted authenticated placements will use an atomic Redis operation that updates the compatible board tile, updates current-pixel ownership, and appends a durable outbox event. `PlacementOutboxWorker` idempotently copies that stream into PostgreSQL, acknowledges and removes an entry only after the database write succeeds, and reclaims abandoned pending entries after a configurable idle period. The worker emits ingested, failed, and reclaimed counters through `System.Diagnostics.Metrics`.

### Reporting safety foundation

`POST /api/v1/reports` accepts authenticated reports for a single current pixel or a region of at most 64 by 64 pixels (4,096 pixels total). Coordinates retain the legacy row/column convention. The server validates the reason, optional 500-character note, and client metadata; rechecks the durable account-ban policy; and applies per-account Redis duplicate suppression and a five-reports-per-ten-minutes limit before writing PostgreSQL.

Evidence is server-authored. The service captures current Redis board colors and up to 500 attributed PostgreSQL placements in the region from the preceding 24 hours, hashes the serialized evidence, and stores it with the report. Clients cannot submit screenshots or attribution. Firebase UIDs in evidence remain private in PostgreSQL and are never returned by the public report response, which contains only an opaque report ID, status, and submission time.

### Moderator operations

The private `/moderation` console and `/api/v1/moderation` routes require an authenticated Firebase token with the exact custom claim `moderator=true`. They expose the report queue and server-authored evidence plus audited, idempotent dismiss, quarantine, rollback, warn, suspend, ban, placement-freeze, and ad-shutdown actions. Quarantine masks active regions from public tile snapshots. Rollback only changes selected placements that are still current and restores the prior color and ownership state.

Redis board state and the asynchronous PostgreSQL placement ledger can briefly differ, and rollback spans Redis, board storage, and PostgreSQL rather than a distributed transaction. Keep placements frozen after any partial failure and reconcile against the durable action and placement ledgers. Follow [`docs/MODERATION_RUNBOOK.md`](docs/MODERATION_RUNBOOK.md) for launch gates, triage, incidents, appeals, and routine access checks. Advertising must remain disabled until those operational gates are staffed and exercised.
