# Trust Circle — cloud session handoff

Read this instead of the prior chat. Work **only** on branch `quirinoc-ship-pending-wip` (already on origin). Do **not** merge to `main` unless Juan asks. Do **not** force-push. Do **not** `--no-verify`. Do **not** change git config.

Repo: `https://github.com/QuirinoC/collapse-tech`  
Branch URL: `https://github.com/QuirinoC/collapse-tech/tree/quirinoc-ship-pending-wip`  
No PR on purpose.

Snapshot when this file was last updated (2 Sep 2026, Pacific): Trust code unchanged since `b550876` (*Align Trust Circle legal pages with App Privacy and Circle terms.*); worktree clean. Production API is Git-backed from this branch, App Store Connect is submit-ready, and the pre-submit code fixes are parked in `TRUST-FOLLOWUP-OPTIONS.md`. This file is the pending-work brief for the next cloud agent.

---

## Do not

- Submit Trust Circle to App Review until the **before-submit** items in `TRUST-FOLLOWUP-OPTIONS.md` are in an uploaded **build 3** — or Juan explicitly decides to submit build 2 as-is. Connect is otherwise ready (§1); the remaining clicks are Juan’s.
- Force-push, `--no-verify`, or rewrite this branch’s history.
- Push a **phone-OTP-only** onboarding story. Production and the uploaded IPA use **handle** onboarding (`PUT /api/v1/me/handle`). Phone OTP endpoints exist unused; do not revive them as the first-open path.
- Point Release iOS at a LAN URL. Release `TRUST_BASE_URL` is `https://trust.collapsetechnologies.com` (`apps/trust-ios/project.yml`).
- Start a web SEO program. Table-stakes on jointrust.app is enough.
- Rank / keyword as Life360 (family tracker, safety check, find my kids).
- Touch Infinite Pixelboard App Store (app `6804066543`, 3.1.2 EULA rejection). Separate product. Do not resubmit it.
- Commit secrets: `.env`, credentials, `*.p8` / `AuthKey_*.p8`, Render URLs with passwords, APNs private key PEM.
- Commit `apps/iphone-rover-ios/.build/**` or other SwiftPM ModuleCache pcm, DerivedData, `.lock` that is not source.
- Deploy from `origin/main`. **`main` still lacks** `apps/trust-api`, `apps/trust-ios`, `apps/jointrust-web`, `apps/trust-oci-registry`. Render builds from **this branch**; merging or renaming it means repointing Render’s branch first (§2).
- Push `apps/trust-api/**` changes untested: pushes on this branch **auto-deploy production** (§2).

---

## 1. App Store Connect — ready; stop before Submit

| | |
| --- | --- |
| App | **Trust Circle.** (period — exact `Trust Circle` was taken) |
| Apple ID | `6806879060` |
| Bundle | `com.collapsetechnologies.trust` |
| Team | `3S529795M9` |
| Listing | https://appstoreconnect.apple.com/apps/6806879060/distribution |
| iOS version | **1.0 Prepare for Submission**, build **2** attached (delivery `b5c990d9-3809-4fb0-9166-2018e395cb65`, VALID) |
| Group | https://appstoreconnect.apple.com/apps/6806879060/distribution/subscription-groups/22346972 — en-US localization **Trust Circle** created (loc `da9545aa-a073-4591-8e32-c3d3d2cc8491`) |
| IAPs | Monthly `6806880712` and Annual `6806880974` both `READY_TO_SUBMIT` |
| App Privacy | Republished with **Product Interaction** (7 data types; no phone number, no tracking) |
| Add for Review | **Enabled, not clicked** |

**Remaining clicks (Juan, in the browser; do not invent API keys):** iOS 1.0 **Add for Review** → Subscriptions group **Add for Review** (Monthly + Annual) → **Submit to App Review**. Do not submit the app without the subscriptions.

IAP facts: Monthly `com.collapsetechnologies.trust.circle.monthly` $7.99 / mo; Annual `com.collapsetechnologies.trust.circle.annual` $69.99 / yr; both 7-day trial, Family Sharing **off**.

**Recommendation before submitting:** land the before-submit items in [`TRUST-FOLLOWUP-OPTIONS.md`](./TRUST-FOLLOWUP-OPTIONS.md) — Look TTL + sweep (item 1), honest 24h extend with no duplicate receipts (item 2), review switches `Trust__SeedReviewCircle` / `StoreKit__AllowReviewUnlock` to opt-in or off (item 4), session JWT to Keychain (item 8); see the memo for the rest of its `submit: yes` set. Then bump to **build 3**, upload, attach to 1.0, and submit that. Build 2 can stay attached until build 3 exists.

**Already on the product page (leave it):** en-US description includes  
`Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`  
(Pixelboard 3.1.2 lesson. Do not strip this line.)

Other listing facts (paste source: `apps/trust-ios/README.md`):

- Subtitle: `Location without watching`
- Support / marketing / privacy / terms: `https://collapsetechnologies.com/trust…` — unchanged, now serving Trust Circle copy (§3). Keep them until jointrust has its **own** HTTPS privacy/terms/support pages.
- Category: Lifestyle (Connect also had Social Networking as a secondary in an earlier pass — do not fight unless Juan asks)
- Age: 17+ on older OS; 18+ on iOS 26+ (adult peers + precise location). Child accounts are **not** in 1.0.
- Sign in with Apple only. Review notes: demo circle Alex/Jordan/Riley seeded; Unlock Circle for review if IAP still missing metadata; no password demo account. If the review switches change (memo item 4), update these notes to match.

**ASO:** current keywords in the README are too Life360: `location,safety,family,share,circle,safety check,find,privacy`. Do **not** try to rank as Life360. Prefer escrow / look / receipt / adult-peer language over family-safety-find. Do not start a web SEO blog program.

---

## 2. Production API

Live check 2 Sep 2026: `https://trust.collapsetechnologies.com/health/live` and `/health/ready` both **200** (`Healthy`).

Runtime is **Git-backed** as of 2 Sep 2026. Render web service `trust-api` (`srv-daabv1lg1s2s73co5gm0`) builds from GitHub **`quirinoc-ship-pending-wip`**, rootDir `apps/trust-api`, Dockerfile, health check `/health/ready`, auto-deploy on push filtered to `apps/trust-api/**`. Live deploy `dep-dac3mqbtqb8s73e36dhg`. Plans: web **Starter**, Postgres **basic_256mb** (no expiry).

- Merging or renaming this branch requires repointing Render’s branch first.
- Rollback: `dep-daael49srm7s73eo8oq0` (the last OCI-image deploy). `oci.collapsetechnologies.com/trust-api:handle` (last known digest `sha256:a561ac4a8f745ce8c61f18656242045f6402b4f3379f99673c8e95251953f9ae`) is still pullable from `apps/trust-oci-registry` (`wrangler.jsonc` → `oci.collapsetechnologies.com`, R2 bucket `trust-oci`, pull-only).
- `apps/render.yaml` is the blueprint in the tree; the live service settings above are the source of truth.

Handle onboarding is what production and the IPA expect. Do not ship phone-OTP-only.

Secrets live in Render env (do not commit, do not print PEM):

- `Auth__SigningKey` (32+ bytes)
- `ConnectionStrings__Postgres`
- APNs: last known KeyId `K5G3DA277J`, Team `3S529795M9`, `Apns__Enabled=true` on the live service. Blueprint still defaults `Apns__Enabled=false` + `sync: false` for KeyId/PrivateKey — preserve the live env values; never re-sync them from the blueprint.
- StoreKit notification URLs should already point at this host (`POST /api/v1/storekit/notifications`).

Local API: `cd apps/trust-api && docker compose up postgres -d && dotnet run --launch-profile TrustApi` → `http://127.0.0.1:5088`. Tests: `dotnet test`.

---

## 3. Legal / marketing sites

| Host | Role | Status |
| --- | --- | --- |
| https://jointrust.app | Marketing (Cloudflare Worker `apps/jointrust-web`) | Live. Quieter atlas deployed (Worker version `adad386f`); `www` 301s to apex. Deploy: `npx wrangler deploy --config apps/jointrust-web/wrangler.jsonc`. Not referenced in App Store metadata yet — fine. |
| https://collapsetechnologies.com/trust | Studio listing + Apple Support/Privacy/Terms URLs (`/trust`, `/trust/privacy`, `/trust/terms`, `/trust/support`) | Live with **Trust Circle** copy from `b550876` (`apps/collapse-technologies/app/trust/{page,privacy,terms,support}/page.js`), via Cloudflare Pages direct upload (deployment `007ce07e-72f5-4e7c-8630-e972e4c973b2`). Apple Connect URLs unchanged. |
| https://trust.collapsetechnologies.com | API + invite links `/i/CODE` | Keep. |

**Keep Apple Connect URLs on collapsetechnologies.com** until jointrust has first-party HTTPS `/privacy`, `/terms`, `/support`. jointrust’s footer currently deep-links studio legal. Do not invent those pages on jointrust unless Juan asks, then add HTTPS pages before changing Connect.

Domain: **jointrust.app** (Namecheap; Cloudflare NS **aliza** / **hank**). Product name: **Trust Circle**. Hero lockup can stay large **Trust**. Invite: “I trust you with my location.”

---

## 4. Product (code vs next feature)

Shipped in tree (screens: `apps/trust-ios/SCREENS.md`):

- Adult peers. MapKit home. Until they look / Always / For a while.
- Look = confirm → live + last 2 hours + quiet APNs receipt (not an alarm, not silent).
- Handle after Sign in with Apple. Circle $7.99 / $69.99, 7-day trial; one paid seat covers unpaid. Looking is not paywalled.
- Home Screen name Trust Circle. Bundle stays `com.collapsetechnologies.trust`.

**Family is IN** (product decision; mechanic settled 2 Sep). **Not implemented** — no screens, no server:

- Expected-back → **Home geofence on her device**. Arrival is detected by the region monitor; an “I’m back” tap was rejected.
- One **Home** place is v1. Other places and arrival alerts are cut.
- Setting a promise requires **Always** location permission on her phone.
- Geofence miss / no signal at the deadline gets fallback copy (memo item 5) — never “she’s out.”
- Do **not** see Saturday 1am (love hotel). Map stays sealed on Until they look.
- **Do** Look if she said back by **4am** and it is **9am**: quiet overdue (not a pin), then Look (live + 2h + receipt).
- Do **not** use Always or For a while for this job — those would show 1am.
- No kid-mode / parental-consent UI in 1.0. Age rating stays 17+/18+.

Implementation sketch: `TRUST-FOLLOWUP-OPTIONS.md` item 5. A design-workshop canvas exists on Juan’s Mac only (`/Users/juanquirino/.cursor/projects/Users-juanquirino-dev-collapse-tech/canvases/trust-jobs-features.canvas.tsx`, not in repo). Grep still finds **zero** `expected-back` / `overdue` in `apps/trust-ios` and `apps/trust-api`. Do not overwork features or design: implement only if Juan asks; otherwise this is 1.1.

---

## 5. iOS device / APNs / atlas

- **Still unverified: APNs look-receipt delivery end-to-end on production.** Code: `apps/trust-ios/Sources/TrustApp/LookReceiptNotifier.swift` → `POST /api/v1/push/devices`; server `apps/trust-api/Infrastructure/Notifications/ApnsClient.cs`. Needs two physical phones (looker + subject) against prod, Always/share on, Look confirm, receipt on the subject’s device.
- Login atlas was **toned down** (`apps/trust-ios/Sources/TrustApp/LoginAtlasBackground.swift` in `12bbf59`): keep motion, less ink, stronger paper vignette. Build 2 (`fb187a1`) post-dates this change.
- jointrust atlas (`apps/jointrust-web/public/atlas.js`) is a separate canvas; do not assume it matches iOS stroke weights.
- Debug simulator → `http://127.0.0.1:5088`. Device Debug remaps loopback to production unless `TRUST_BASE_URL=http://<mac-lan-ip>:5088`.
- `xcodegen generate` then Trust scheme. Team `3S529795M9`. StoreKit file is local-only; archives use Connect.

---

## 6. Paths that matter

```
apps/trust-ios/                 SwiftUI client, screenshots, StoreKit config
apps/trust-api/                 ASP.NET Core 9 + Postgres
apps/trust-oci-registry/        pull-only OCI on R2 (rollback image)
apps/jointrust-web/             jointrust.app Worker
apps/collapse-technologies/app/trust/   studio legal + listing
apps/render.yaml                Render blueprint (live service is Git-backed; see §2)
TRUST-CLOUD-HANDOFF.md          this file
TRUST-FOLLOWUP-OPTIONS.md       pre-submit fix memo (review, not a redesign)
```

---

## 7. Already on this branch (do not expand)

These landed in earlier commits on `quirinoc-ship-pending-wip`. They are **not** Trust App Store work:

- `apps/iphone-rover-firmware`, `apps/iphone-rover-ios`, `docs/iphone-rover/`
- Infinite Pixelboard iOS push/debug entitlements (`0bb6043`)

Pixelboard App Store (3.1.2 EULA, app `6804066543`) is **out of scope**. Pixelboard work lives on other branches; this worktree had **no Pixelboard dirt** when this handoff was updated.

Ignored / excluded from git (correct): `*.p8`, `.env*.local`, `apps/trust-ios/.build/`, DerivedData, `bin/` `obj/`, `.wrangler/`. If a local `.build` ModuleCache appears, skip it; do not add pcm files.

---

## Suggested order for the cloud session

1. Land the before-submit fixes from `TRUST-FOLLOWUP-OPTIONS.md` (Look TTL + sweep; honest 24h extend; review switches opt-in/off; JWT → Keychain). `dotnet test` green. Remember: pushing `apps/trust-api/**` deploys production.
2. Bump iOS to **build 3**, upload, attach to 1.0. Then **stop** — Add for Review (version + subscriptions) and Submit are Juan’s clicks.
3. Optional: two-device APNs smoke on prod.
4. Do not implement expected-back / Home geofence unless asked (decisions in §4; leave as 1.1).
5. Do not SEO. Soften ASO keywords only if you are already in Connect metadata.
