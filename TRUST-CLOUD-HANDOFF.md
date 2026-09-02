# Trust Circle — cloud session handoff

Read this instead of the prior chat. Work **only** on branch `quirinoc-ship-pending-wip` (already on origin). Do **not** merge to `main` unless Juan asks. Do **not** force-push. Do **not** `--no-verify`. Do **not** change git config.

Repo: `https://github.com/QuirinoC/collapse-tech`  
Branch URL: `https://github.com/QuirinoC/collapse-tech/tree/quirinoc-ship-pending-wip`  
No PR on purpose.

Snapshot when this file was last updated (2 Sep 2026, Pacific): **before-submit escrow fixes + presence-grant foundation shipped** on this branch (Look TTL sweep, honest 24h extend + receipt dedupe, review switches OFF in `render.yaml`, JWT → Keychain, sealed presence redaction, Home/Away grants without coords). Production API auto-deploys from this branch. App Store Connect still stops before **Add for Review**.

---

## Do not

- Submit Trust Circle to App Review until **build 3** is uploaded and attached — or Juan explicitly decides to submit build 2 as-is. Connect listing/IAPs are otherwise ready (§1); **Add for Review / Submit** remain Juan’s clicks.
- Force-push, `--no-verify`, or rewrite this branch’s history.
- Push a **phone-OTP-only** onboarding story. Production and the IPA use **handle** onboarding (`PUT /api/v1/me/handle`). Phone OTP endpoints exist unused; do not revive them as the first-open path.
- Point Release iOS at a LAN URL. Release `TRUST_BASE_URL` is `https://trust.collapsetechnologies.com` (`apps/trust-ios/project.yml`).
- Start a web SEO program. Table-stakes on jointrust.app is enough.
- Rank / keyword as Life360 (family tracker, safety check, find my kids).
- Touch Infinite Pixelboard App Store (app `6804066543`, 3.1.2 EULA rejection). Separate product. Do not resubmit it.
- Commit secrets: `.env`, credentials, `*.p8` / `AuthKey_*.p8`, Render URLs with passwords, APNs private key PEM.
- Commit `apps/iphone-rover-ios/.build/**` or other SwiftPM ModuleCache pcm, DerivedData, `.lock` that is not source.
- Deploy from `origin/main`. **`main` still lacks** `apps/trust-api`, `apps/trust-ios`, `apps/jointrust-web`, `apps/trust-oci-registry`. Render builds from **this branch**; merging or renaming it means repointing Render’s branch first (§2).
- Push `apps/trust-api/**` changes untested: pushes on this branch **auto-deploy production** (§2).
- Leave `Trust__SeedReviewCircle` / `StoreKit__AllowReviewUnlock` **true** in Production except while Apple is actively reviewing.

---

## 1. App Store Connect — stop before Submit

| | |
| --- | --- |
| App | **Trust Circle.** (period — exact `Trust Circle` was taken) |
| Apple ID | `6806879060` |
| Bundle | `com.collapsetechnologies.trust` |
| Team | `3S529795M9` |
| Listing | https://appstoreconnect.apple.com/apps/6806879060/distribution |
| iOS version | **1.0 Prepare for Submission** |
| Build | **3** attached (`f6b95d62-f489-4adf-a8c0-c2a888caa259`, VALID). Build 2 remains available. |
| Group | https://appstoreconnect.apple.com/apps/6806879060/distribution/subscription-groups/22346972 — en-US localization **Trust Circle** |
| IAPs | Monthly `6806880712` and Annual `6806880974` both `READY_TO_SUBMIT` |
| App Privacy | Republished with **Product Interaction** (7 data types; no phone number, no tracking) |
| Add for Review | **Enabled, not clicked** |

**Remaining clicks (Juan):** after build 3 is attached → iOS 1.0 **Add for Review** → Subscriptions group **Add for Review** (Monthly + Annual) → **Submit to App Review**. Do not submit the app without the subscriptions.

IAP facts: Monthly `com.collapsetechnologies.trust.circle.monthly` $7.99 / mo; Annual `com.collapsetechnologies.trust.circle.annual` $69.99 / yr; both 7-day trial, Family Sharing **off**.

**Already on the product page (leave it):** en-US description includes  
`Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

**Review notes for Connect (update when submitting):** Production seeds **no** demo circle by default. For App Review only, set Render env `Trust__SeedReviewCircle=true` and `StoreKit__AllowReviewUnlock=true`, then flip both back to `false` after approval. Unlock Circle for review still works when the flag is on. Sign in with Apple only; no password demo account.

**ASO:** Prefer escrow / look / receipt / adult-peer language over family-safety-find. Do not start a web SEO blog program.

---

## 2. Production API

Runtime is **Git-backed**. Render web service `trust-api` (`srv-daabv1lg1s2s73co5gm0`) builds from GitHub **`quirinoc-ship-pending-wip`**, rootDir `apps/trust-api`, Dockerfile, health check `/health/ready`, auto-deploy on push filtered to `apps/trust-api/**`. Plans: web **Starter**, Postgres **basic_256mb** (no expiry).

- Merging or renaming this branch requires repointing Render’s branch first.
- Rollback: `dep-daael49srm7s73eo8oq0` (last OCI-image deploy). `oci.collapsetechnologies.com/trust-api:handle` still pullable from `apps/trust-oci-registry`.
- `apps/render.yaml` blueprint defaults: `Trust__SeedReviewCircle=false`, `StoreKit__AllowReviewUnlock=false`. **Live Render dashboard env is source of truth** — confirm both are false after blueprint/env edits; set true only for Apple review window.
- Additive migration `005_presence_grants.sql` (presence grants, home place label, current home/away state, promises). No PostGIS; Home coords stay on device.

Handle onboarding is what production and the IPA expect. Do not ship phone-OTP-only.

Secrets live in Render env (do not commit, do not print PEM):

- `Auth__SigningKey` (32+ bytes)
- `ConnectionStrings__Postgres`
- APNs: last known KeyId `K5G3DA277J`, Team `3S529795M9`, `Apns__Enabled=true` on the live service. Blueprint still defaults `Apns__Enabled=false` + `sync: false` for KeyId/PrivateKey — preserve the live env values; never re-sync them from the blueprint.
- StoreKit notification URLs should already point at this host (`POST /api/v1/storekit/notifications`).

Local API: `cd apps/trust-api && docker compose up postgres -d && dotnet run --launch-profile TrustApi` → `http://127.0.0.1:5088`. Tests: `dotnet test`.

### Shipped in this pass (escrow + presence foundation)

**A — escrow / before-submit**

1. Active Look TTL ~30 min + `TrustSweepService` closes expired looks and prunes stale GPS.
2. Extend 24h updates `look_events.history_window_hours` + quiet extend receipt; Look POST skips receipt when reusing an active Look.
3. Review switches default **OFF** in Production blueprint; Development remains on.
4. iOS hides Place ping / Check in.
5. Sealed members: battery/last-active/gotHome omitted unless inbound live (Look / Always / timed).
6. Session JWT in Keychain (migrates off UserDefaults).
7. Timed “home” chip copy → **For 4 hours** (still fixed 4h window).

**B — Trust as grants (foundation)**

- Presence grant API + Home place (id/label only) + home/away/unknown transitions + promises table/endpoints.
- iOS: set Home (coords Keychain + CLCircularRegion), grant toggle on person sheet, Home/Away on strip, promise API wired (full promise picker UI can stay thin).
- Engine tests: presence not leaked without grant; Look TTL; extend log hours; Look reopen not new.

**Deferred:** full promise deadline picker UI polish, cheaper sealed GPS battery mode, StoreKit expiry recompute, offline copy polish, build 3 IPA upload if Xcode unavailable on the agent host.

---

## 3. Legal / marketing sites

| Host | Role | Status |
| --- | --- | --- |
| https://jointrust.app | Marketing (Cloudflare Worker `apps/jointrust-web`) | Live. Deploy: `npx wrangler deploy --config apps/jointrust-web/wrangler.jsonc`. |
| https://collapsetechnologies.com/trust | Studio listing + Apple Support/Privacy/Terms | Live Trust Circle copy. Cloudflare Pages direct upload. |
| https://trust.collapsetechnologies.com | API + invite links `/i/CODE` | Keep. |

**Keep Apple Connect URLs on collapsetechnologies.com** until jointrust has first-party HTTPS `/privacy`, `/terms`, `/support`.

---

## 4. Product

Shipped: adult peers, MapKit home, Until they look / Always / For a while, Look = confirm → live + 2h + receipt, handle onboarding, Circle IAP, presence **grant** (Home/Away without where).

Family expected-back: Home geofence on device + server promise/overdue foundation landed; polish UI and end-to-end APNs “Alex is home” smoke still optional.

Do not: second places, arrival history log, family dashboard, SOS, kid-mode, Pixelboard.

---

## 5. iOS device / APNs / atlas

- APNs look-receipt delivery on production still wants a two-phone smoke.
- Debug simulator → `http://127.0.0.1:5088`. Device Debug remaps loopback to production unless `TRUST_BASE_URL=http://<mac-lan-ip>:5088`.
- `xcodegen generate` then Trust scheme. Team `3S529795M9`. Full Xcode required to archive/upload.

---

## 6. Paths that matter

```
apps/trust-ios/                 SwiftUI client
apps/trust-api/                 ASP.NET Core 9 + Postgres
apps/trust-oci-registry/        pull-only OCI on R2 (rollback image)
apps/jointrust-web/             jointrust.app Worker
apps/collapse-technologies/app/trust/   studio legal + listing
apps/render.yaml                Render blueprint (review switches OFF)
TRUST-CLOUD-HANDOFF.md          this file
TRUST-FOLLOWUP-OPTIONS.md       pre-submit memo (mostly landed for submit:yes set)
```

---

## Suggested next steps

1. `/health/ready` is **200** on restored deploy `dep-dac6n6qd0e5s73fpqb50` (`44eb211`).
2. Build **3** is attached — Juan: **Add for Review** (app + subscriptions) → **Submit**. Do not flip review env until that moment.
3. For Apple review window only: Render `Trust__SeedReviewCircle=true` + `StoreKit__AllowReviewUnlock=true`; flip off after approval.
4. Optional: two-device APNs smoke on prod (signing key rotated — re-register devices after re-login).
5. Do not merge to `main` unless Render’s branch is repointed first.
