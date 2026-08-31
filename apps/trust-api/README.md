# Trust API

ASP.NET Core 9 + Postgres backend for Trust. Location is held in escrow. Coordinates are never returned for sealed people. A Look requires an explicit confirm, writes an append-only receipt, and unlocks live location plus a short trail.

This is the product backend. The iOS app talks to it. **Postgres is the real store.** In-memory is an explicit Development/test fallback (`Trust:Store=memory`) and is refused outside Development. History in memory dies with the process.

## Location history

Postgres holds users, share modes, **time-series location points**, and look receipts. Coordinates are appended on ingest; Look reads the stored window. An API restart does not clear trails when Postgres is the store.

Until end-to-end encryption exists, location points are **plaintext on the server**. We do not sell location. Other clients still do not receive live GPS for sealed people until a confirmed Look, which then releases live plus the window below.

### Where it lives

| Table | What it stores |
| --- | --- |
| `trust.accounts` | Sign-in identity, display name, verified E.164 phone, Circle entitlement |
| `trust.phone_challenges` | Hashed SMS OTP in flight (not the plaintext code) |
| `trust.invites` | Pending/consumed invite codes |
| `trust.memberships` | Circle pairs |
| `trust.shares` | Until they look / Always / For a while (timer) |
| `trust.location_points` | Append-only GPS time series (`account_id`, `recorded_at`, lat/long) |
| `trust.look_events` | Append-only Look receipts (who, when, window hours — **no coordinates**) |
| `trust.active_looks` | Open Look sessions |
| `trust.presence` | Last active / battery / got-home / check-in — **no coordinates** |

Schema is applied on boot from `Infrastructure/Postgres/Migrations/*.sql`.

### Retention

| Data | Free | Circle |
| --- | --- | --- |
| Look trail released to a viewer | Last **2 hours** | Optional extend to last **24 hours** |
| GPS kept on the server | **26 hours**, then pruned (covers the 24h grant; not a 30-day dossier) | Same GPS window |
| Look log (receipts, not GPS) | **30 days** | **365 days** + export |
| Empty circle / revoke last person | GPS for that account is deleted | Same |
| Account delete | Location, looks, memberships removed | Same |

Ingest (`POST /api/v1/location`) appends one point or a `points` array while the account is sharing (at least one trusted person). Older-than-retention rows are pruned on ingest. Background Always on iOS keeps appending while sharing is on.

### Honesty

Plaintext GPS on our database is a current limitation, not a feature. Do not treat escrow as client-only sealed storage. The product promise is authorization (sealed until Look) and short retention, not encryption-at-rest yet.

## Map

Maps are **not** rendered here. The iOS client uses **MapKit** (see `apps/trust-ios/README.md`). This API only stores and authorizes location.

## Run locally

Postgres on host port **5433** (avoids colliding with other stacks):

```bash
cd apps/trust-api
docker compose up postgres -d
dotnet run --launch-profile TrustApi
```

API: [http://127.0.0.1:5088](http://127.0.0.1:5088)  
Health: `/health/live`, `/health/ready`  
Privacy / ToS: `/Privacy`, `/Terms`

Or run API + Postgres together:

```bash
docker compose up --build
```

On first boot the API applies `Infrastructure/Postgres/Migrations/*.sql`.

If Docker is down, Development can use a **process-local** store. Location history will not survive API restart:

```bash
Trust__Store=memory ASPNETCORE_ENVIRONMENT=Development \
  Auth__SigningKey='development-signing-key-32bytes-min!!' \
  Auth__AllowDevelopmentSignIn=true Trust__SeedReviewCircle=true \
  StoreKit__AllowReviewUnlock=true \
  dotnet run --urls http://0.0.0.0:5088
```

Durable product data needs Postgres via compose.

Development (`ASPNETCORE_ENVIRONMENT=Development`):

- `Auth:AllowDevelopmentSignIn=true` — `POST /api/v1/session/google` without an ID token, and `POST /api/v1/session/development`, issue a real session JWT.
- `Trust:SeedReviewCircle=true` — first sign-in seeds Alex (sealed), Jordan (Always), Riley (For a while) as **database accounts** with escrowed trails. Not an iOS mock.
- `StoreKit:AllowReviewUnlock=true` — Settings → Unlock Circle for review grants Circle on the server.

Production must set `Auth:SigningKey` (32+ bytes). Do not ship the Development key.

## Auth

| Endpoint | What it does |
| --- | --- |
| `POST /api/v1/session/apple` | Verifies Apple `identityToken` against Apple JWKS (8s HTTP timeout, 12s overall), audience `com.collapsetechnologies.trust`. Apple directory timeouts return **503** instead of hanging. |
| `POST /api/v1/session/google` | Verifies Google `idToken` when `Google:ClientIds` is set. If not, Development may mint a session. |
| `POST /api/v1/session/development` | Development only. |

All other `/api/v1/*` routes require `Authorization: Bearer <session JWT>`.

## Product API

- `GET /api/v1/circle` — members, presence **without coordinates** unless Always / For a while / an open Look. Sealed `live` is `null`. `you.onboardingComplete` is true only after a chosen display name and a verified phone.
- `PATCH /api/v1/me` — display name (required for onboarding).
- `POST /api/v1/me/phone/send` `{ phone }` — SMS OTP to an E.164 number. Twilio when `Twilio:AccountSid` + `AuthToken` + `FromNumber` (or `MessagingServiceSid`) are set. In **Development only**, if Twilio is not configured, the JSON includes `developmentCode` (never logged, never returned in Production).
- `POST /api/v1/me/phone/verify` `{ phone, code }` — checks the hashed OTP and sets `phone_verified_at`.
- `POST /api/v1/location` — append point(s) only while sharing (Until they look / Always / For a while). Optional `points` array for a batch. Prunes GPS older than 26 hours. No-op (and clears GPS) if the circle is empty.
- `POST /api/v1/looks` `{ subjectId, confirmed: true }` — unlock **live + last 2 hours from stored points**, append look log.
- `POST /api/v1/looks/close`, `POST /api/v1/looks/{subjectId}/extend` — extend is Circle (24h).
- `PATCH /api/v1/people/{id}/share` `{ resting, timed }` — Until they look / Always / For a while (reverts).
- `POST /api/v1/invites`, `POST /api/v1/invites/accept` — copy: “I trust you with my location.”
- `POST /api/v1/presence/check-in`, `POST /api/v1/presence/place-ping` — ping is Circle.
- `POST /api/v1/circle/entitlement` — review unlock when allowed, or a signed transaction.
- `GET /api/v1/storekit/account-token`, `POST /api/v1/storekit/transactions` — StoreKit JWS, App Account Token, ownership lock.
- `POST /api/v1/storekit/notifications` — App Store Server Notifications V2.
- `POST /api/v1/push/devices` — APNs token for look receipts on the looked-at phone.
- `DELETE /api/v1/account` — App Store 5.1.1(v) account deletion.
- `POST /api/v1/stripe/checkout` — web Circle for Stripe product `prod_trust_circle` when keys are set.

Production host: Render service `trust-api`, custom domain `trust.collapsetechnologies.com`. Legal URLs also live on the studio site at `https://collapsetechnologies.com/trust`.

## Secrets (do not invent)

| Secret | Needed for | Local |
| --- | --- | --- |
| Postgres | Product store | docker compose (`trust` / `trust`) |
| `Auth:SigningKey` | Session JWTs | Development default in `appsettings.Development.json` |
| Apple JWKS | Sign in with Apple | No private key; bundle ID audience |
| `Google:ClientIds` | Production Google | Optional; iOS Google Sign-In client ID not in repo |
| `StoreKit:Enabled` + Apple Root CA G3 (embedded) | Verify App Store JWS | On in production |
| `StoreKit:AllowReviewUnlock` | Settings → Unlock Circle for review | Development / first App Review |
| `Apns:KeyId` + `Apns:PrivateKey` | Look receipts on the subject’s phone | User-supplied Auth Key; do not invent |
| `Twilio:AccountSid`, `Twilio:AuthToken`, `Twilio:FromNumber` or `Twilio:MessagingServiceSid` | Phone OTP SMS | Optional locally; Development returns `developmentCode` if unset. Production must set these. Do not commit secrets. |
| Stripe `SecretKey`, price IDs | Web checkout | Optional; iOS Circle is StoreKit |
| Mapbox | Not used | MapKit on iOS |

## Tests

```bash
dotnet test
```

Engine tests use the in-memory store. HTTP tests host the API with `Trust:Store=memory`. `PostgresHistoryTests` talks to local docker Postgres on port 5433 when it is up, and skips if it is not.
