# Trust Circle — cloud session handoff

Read this instead of the prior chat. Work **only** on branch `quirinoc-ship-pending-wip` (already on origin). Do **not** merge to `main` unless Juan asks. Do **not** force-push. Do **not** `--no-verify`. Do **not** change git config.

Repo: `https://github.com/QuirinoC/collapse-tech`  
Branch URL: `https://github.com/QuirinoC/collapse-tech/tree/quirinoc-ship-pending-wip`  
No PR on purpose.

Snapshot when this file was written (1 Sep 2026, Pacific): working tree was **already clean**. Trust iOS, API, jointrust-web, studio `/trust` pages, and OCI registry were already committed through `12bbf59` (*Soften Trust login atlas background contrast.*). This file is the pending-work brief for the next cloud agent.

---

## Do not

- Submit Trust Circle to App Review until subscription **group 22346972** has an **en-US localization** and Circle monthly/annual leave `MISSING_METADATA`. Then Add for Review **including both IAPs**.
- Force-push, `--no-verify`, or rewrite this branch’s history.
- Push a **phone-OTP-only** onboarding story. Production and the uploaded IPA use **handle** onboarding (`PUT /api/v1/me/handle`). Phone OTP endpoints exist unused; do not revive them as the first-open path.
- Point Release iOS at a LAN URL. Release `TRUST_BASE_URL` is `https://trust.collapsetechnologies.com` (`apps/trust-ios/project.yml`).
- Start a web SEO program. Table-stakes on jointrust.app is enough.
- Rank / keyword as Life360 (family tracker, safety check, find my kids).
- Touch Infinite Pixelboard App Store (app `6804066543`, 3.1.2 EULA rejection). Separate product. Do not resubmit it.
- Commit secrets: `.env`, credentials, `*.p8` / `AuthKey_*.p8`, Render URLs with passwords, APNs private key PEM.
- Commit `apps/iphone-rover-ios/.build/**` or other SwiftPM ModuleCache pcm, DerivedData, `.lock` that is not source.
- Deploy from `origin/main`. **`main` still lacks** `apps/trust-api`, `apps/trust-ios`, `apps/jointrust-web`, `apps/trust-oci-registry`. A Git-backed Render deploy needs **this branch** (or a merge), not `main`.

---

## 1. App Store Connect — blocker before review

| | |
| --- | --- |
| App | **Trust Circle.** (period — exact `Trust Circle` was taken) |
| Apple ID | `6806879060` |
| Bundle | `com.collapsetechnologies.trust` |
| Team | `3S529795M9` |
| Listing | https://appstoreconnect.apple.com/apps/6806879060/distribution |
| iOS version | **1.0 Prepare for Submission**, build **1** VALID, attached |
| Group | https://appstoreconnect.apple.com/apps/6806879060/distribution/subscription-groups/22346972 |

**Must do in Connect (browser; do not invent API keys):**

1. Open subscription group **22346972**. Add **en-US localization**. Display name **Trust Circle** (matches `apps/trust-ios/Resources/Trust.storekit` localizations).
2. Wait until Circle IAPs leave `MISSING_METADATA` / `DRAFT`:
   - Monthly `6806880712` — product id `com.collapsetechnologies.trust.circle.monthly` — $7.99 / mo, 7-day trial, Family Sharing **off**
   - Annual `6806880974` — product id `com.collapsetechnologies.trust.circle.annual` — $69.99 / yr, 7-day trial, Family Sharing **off**
3. Set both to submit **with** the next app version (`submitWithNextAppStoreVersion` was `false` when last checked).
4. **Add for Review** on iOS 1.0 **including both IAPs**. Do not submit the app without the subscriptions.

**Already on the product page (leave it):** en-US description includes  
`Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`  
(Pixelboard 3.1.2 lesson. Do not strip this line.)

Other listing facts (paste source: `apps/trust-ios/README.md`):

- Subtitle: `Location without watching`
- Support / marketing / privacy / terms: `https://collapsetechnologies.com/trust…` (keep these Apple URLs until jointrust has its **own** HTTPS privacy/terms/support pages)
- Category: Lifestyle (Connect also had Social Networking as a secondary in an earlier pass — do not fight unless Juan asks)
- Age: 17+ on older OS; 18+ on iOS 26+ (adult peers + precise location). Child accounts are **not** in 1.0.
- Sign in with Apple only. Review notes: demo circle Alex/Jordan/Riley seeded; Unlock Circle for review if IAP still missing metadata; no password demo account.

**ASO:** current keywords in the README are too Life360: `location,safety,family,share,circle,safety check,find,privacy`. Do **not** try to rank as Life360. Prefer escrow / look / receipt / adult-peer language over family-safety-find. Do not start a web SEO blog program.

---

## 2. Production API

Live check 1 Sep 2026: `https://trust.collapsetechnologies.com/health/live` and `/health/ready` both **200** (`Healthy`).

Runtime is **not** GitHub. Render service `trust-api` (`srv-daabv1lg1s2s73co5gm0`) pulls Cloudflare OCI image:

`oci.collapsetechnologies.com/trust-api:handle`  
digest (last known): `sha256:a561ac4a8f745ce8c61f18656242045f6402b4f3379f99673c8e95251953f9ae`

Registry worker: `apps/trust-oci-registry` (`wrangler.jsonc` → `oci.collapsetechnologies.com`, R2 bucket `trust-oci`). Pull-only.

**Still pending:** durable **Git** Render deploy. Blueprint is `apps/render.yaml` (`trust-api` docker context `./apps/trust-api`, health `/health/ready`, Postgres `trust-postgres`). That only works after origin contains `apps/trust-api` — today that is **this branch**, not `main`. Do not flip Render to Git/`main` or the service 502s.

Handle onboarding is what production and the IPA expect. Do not ship phone-OTP-only.

Secrets live in Render env (do not commit, do not print PEM):

- `Auth__SigningKey` (32+ bytes)
- `ConnectionStrings__Postgres`
- APNs: last known KeyId `K5G3DA277J`, Team `3S529795M9`, `Apns__Enabled=true` on the live service. Blueprint still defaults `Apns__Enabled=false` + `sync: false` for KeyId/PrivateKey — preserve live values if you switch to Git runtime.
- StoreKit notification URLs should already point at this host (`POST /api/v1/storekit/notifications`).

Local API: `cd apps/trust-api && docker compose up postgres -d && dotnet run --launch-profile TrustApi` → `http://127.0.0.1:5088`. Tests: `dotnet test`.

---

## 3. Legal / marketing sites

| Host | Role | Status |
| --- | --- | --- |
| https://jointrust.app | Marketing (Cloudflare Worker `apps/jointrust-web`) | Live 200. Quieter atlas on the worker; `www` 301s to apex. Deploy: `npx wrangler deploy --config apps/jointrust-web/wrangler.jsonc`. Working tree should match what was deployed. |
| https://collapsetechnologies.com/trust | Studio listing + Apple Support/Privacy/Terms URLs | Live 200 but **copy still says “Trust”**, not Trust Circle (`<title>Trust Privacy \| Collapse Technologies</title>`). Git on **this branch** already has Trust Circle copy in `apps/collapse-technologies/app/trust/{page,privacy,terms,support}/page.js`. Studio site deploy is behind git. |
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

**Family is IN** (product decision). Mechanic **not implemented as screens yet**:

- Expected-back / overdue Look.
- Do **not** see Saturday 1am (love hotel). Map stays sealed on Until they look.
- **Do** Look if she said back by **4am** and it is **9am**: quiet overdue (not a pin), then Look (live + 2h + receipt).
- Do **not** use Always or For a while for this job — those would show 1am.
- No kid-mode / parental-consent UI in 1.0. Age rating stays 17+/18+.

Grep will find **zero** `expected-back` / `overdue` in `apps/trust-ios` and `apps/trust-api`. Implement only if Juan asks this session; otherwise leave as 1.1.

---

## 5. iOS device / APNs / atlas

- **Look receipts have never been device-smoked on production APNs.** Code: `apps/trust-ios/Sources/TrustApp/LookReceiptNotifier.swift` → `POST /api/v1/push/devices`; server `apps/trust-api/Infrastructure/Notifications/ApnsClient.cs`. Needs two physical phones (or looker + subject) against prod, Always/share on, Look confirm, receipt on the subject’s device.
- Login atlas was **toned down** (`apps/trust-ios/Sources/TrustApp/LoginAtlasBackground.swift` in `12bbf59`): keep motion, less ink, stronger paper vignette. **Device needs a rebuild** to see it; uploaded build 1 may still be the older heavier atlas.
- jointrust atlas (`apps/jointrust-web/public/atlas.js`) is a separate canvas; do not assume it matches iOS stroke weights.
- Debug simulator → `http://127.0.0.1:5088`. Device Debug remaps loopback to production unless `TRUST_BASE_URL=http://<mac-lan-ip>:5088`.
- `xcodegen generate` then Trust scheme. Team `3S529795M9`. StoreKit file is local-only; archives use Connect.

---

## 6. Paths that matter

```
apps/trust-ios/                 SwiftUI client, screenshots, StoreKit config
apps/trust-api/                 ASP.NET Core 9 + Postgres
apps/trust-oci-registry/        pull-only OCI on R2
apps/jointrust-web/             jointrust.app Worker
apps/collapse-technologies/app/trust/   studio legal + listing
apps/render.yaml                Git Render blueprint (pending)
TRUST-CLOUD-HANDOFF.md          this file
```

---

## 7. Already on this branch (do not expand)

These landed in earlier commits on `quirinoc-ship-pending-wip`. They are **not** Trust App Store work:

- `apps/iphone-rover-firmware`, `apps/iphone-rover-ios`, `docs/iphone-rover/`
- Infinite Pixelboard iOS push/debug entitlements (`0bb6043`)

Pixelboard App Store (3.1.2 EULA, app `6804066543`) is **out of scope**. Working tree had **no unstaged Pixelboard dirt** when this handoff was written.

Ignored / excluded from git (correct): `*.p8`, `.env*.local`, `apps/trust-ios/.build/`, DerivedData, `bin/` `obj/`, `.wrangler/`. If a local `.build` ModuleCache appears, skip it; do not add pcm files.

---

## Suggested order for the cloud session

1. Connect: group **22346972** en-US loc → wait IAPs `6806880712` / `6806880974` leave missing metadata → include both → **stop before Submit** unless Juan says submit.
2. Optional: deploy studio site so live `/trust/privacy` matches git Trust Circle copy. Keep Connect URLs on that host.
3. Optional: Git Render from **this branch** so production is not only the OCI `:handle` image. Do not switch the live service to `main`.
4. Optional: two-device APNs smoke on prod.
5. Do not implement expected-back UI unless asked.
6. Do not SEO. Soften ASO keywords if you are already in Connect metadata.
