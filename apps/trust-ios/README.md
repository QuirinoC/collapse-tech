# Trust Circle for iPhone and iPad

Native SwiftUI app for adult-peer location escrow. First launch is one screen, then the **map**. Location stays hidden until someone **looks**. A look returns live location plus a short trail, after a confirm that names the cost, and sends a quiet receipt — not silent, not an alarm.

The product backend is `apps/trust-api` (ASP.NET Core + Postgres). This app does not use an in-memory demo as the backend.

## Map provider

**MapKit** is the production map.

- Native, no vendor token, no extra billing, no third-party tracker on the home screen.
- Custom annotations: you (square + red rule `#E10600`), live people (black/white initials), sealed people as a lock chip — **never** a GPS dump for Until they look.
- iOS 18+ uses `MapStyle.standard(emphasis: .muted)` for a quieter, editorial plate. iOS 17 uses standard / flat / no POIs, light (Paper) or dark (Night Edition).

Google Maps is out (billing and tracking optics). **Mapbox / MapLibre** is the right later upgrade for a true black-and-white cartography skin; 1.0 is not blocked on a Mapbox token.

## Visual

**Masthead Paper** is the default: Didot for **Trust** (large lockup; Home Screen name is **Trust Circle**), Space Grotesk for **Collapse Technologies** (same as Pixelboard and the studio site; a step smaller than the previous system-folio mark), SF for UI, white paper, black ink, red `#E10600` as the only chromatic. Settings → Night Edition inverts the sheet.

Login uses a Canvas atlas — sparse meridians, isolines, and a few coordinates — not a street map. MeshGradient and a muted MapKit plate were the other options.

## Open and run

1. Start the API (Postgres + Trust API):

   ```bash
   cd apps/trust-api
   docker compose up postgres -d
   dotnet run --launch-profile TrustApi
   ```

   The API listens on `http://0.0.0.0:5088`.

   | Build | API URL |
   | --- | --- |
   | Simulator Debug | `http://127.0.0.1:5088` |
   | Device Debug | Production `https://trust.collapsetechnologies.com`, unless you pass `TRUST_BASE_URL=http://<mac-lan-ip>:5088` to `xcodebuild` (loopback is the phone, not the Mac — the app remaps `127.0.0.1` on device). If the configured host is down, Debug probes `/health/live` and uses the first reachable candidate, or shows a real error instead of spinning forever. |
   | Release / Archive | `https://trust.collapsetechnologies.com` (set in `project.yml`; do not point Release at LAN) |

   Local HTTP is allowed via App Transport Security local networking (`NSAllowsLocalNetworking`). Do not hardcode a LAN IP in the project.

2. `cd apps/trust-ios && xcodegen generate`
3. Open `Trust.xcodeproj` in Xcode (Xcode 16+ / iOS 17). Team `3S529795M9`.
4. The shared Run scheme attaches `Resources/Trust.storekit`.
5. Run on Simulator or device.

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project Trust.xcodeproj -scheme Trust \
    -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.4' \
    -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Device Debug against your Mac API (API must be running, same Wi-Fi):

```bash
LAN=$(ipconfig getifaddr en0)
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project Trust.xcodeproj -scheme Trust \
    -destination 'id=<DEVICE_UDID>' -configuration Debug \
    DEVELOPMENT_TEAM=3S529795M9 TRUST_BASE_URL="http://$LAN:5088" \
    -derivedDataPath build/DerivedDataDevice build
```

Bundle ID: `com.collapsetechnologies.trust`.

## First-open and look flow

1. Collapse Technologies, **Trust** (hero lockup; product name is **Trust Circle**), Log in with Apple (`apple.logo`, identity token → API). Terms of Service, Privacy, and Support sit in one row (`https://collapsetechnologies.com/trust/…`). No extra legal line under the button.
2. After Apple, **Your profile** if display name is missing or phone is not verified: name + SMS one-time code. Completing both is required before the map. After account delete, this returns.
3. Home is the map. Live pins for Always / For a while. Sealed people are a lock — not a coordinate.
4. **Look** confirm: live + last 2 hours + they get a remote receipt (APNs), not a local notify on the looker’s phone. No “don’t ask again.”
5. After Look: trail + live pin. Closing ends the look. The look log is append-only until you delete your account.
6. Per person: Until they look | Always | For a while (reverts). Copy: “After 1 hour, X will only see your location if they look — unless you’ve set something else for them.”
7. Invite: “I trust you with my location.” `https://trust.collapsetechnologies.com/i/CODE` and `trust://invite/CODE`.

Development API seeds Alex / Jordan / Riley as **server accounts** so the map is usable on one device. That seed lives in Postgres, not in the iOS process.

## Free vs Circle vs covered partner

| | Free | Circle ($7.99/mo or $69.99/yr, 7-day trial) |
| --- | --- | --- |
| Escrow share, 1 trusted person, look, last 2 hours, quiet receipt, look log | Yes | Yes |
| Extra trusted people | No (1 seat) | Up to 6 |
| 24-hour history on an open look | No | Yes — “Include last 24 hours” |
| Place ping (got-home without opening the map) | No | Yes |
| Look-log retention | 30 days | 365 days + export |
| Ads / location sale | Never | Never |

**Looking is not paywalled.** If anyone in the circle has Circle, the unpaid people are covered. The app submits signed StoreKit transactions (`POST /api/v1/storekit/transactions`) with a server-issued App Account Token. Family Sharing is off. Stripe product `prod_trust_circle` is the web sponsor path when Stripe keys are set on the API. iOS never uses Stripe Checkout.

## Location

While Using is enough to use the map, Settings, and Look at someone else. Always is required once **your** location is in the product (Until they look / escrow, Always, or For a while) so Look still works when Trust Circle is closed.

The first Home asks for While Using. Always is requested when they turn on sharing (invite “I trust you with my location”, join, or a share-mode sheet) — not on login. Background updates and API ingest run only while sharing is on. If they keep While Using, escrow updates only while the app is open; Settings and a Home folio send them to iOS Settings for Always. Reduced accuracy requests precise location (`PreciseEscrow`). `UIBackgroundModes` includes `location`. The blue background-location indicator is on when Always is granted **and** sharing is on.

Purpose strings (Masthead voice, not Life360):

- **While Using:** Trust Circle uses your location while the app is open so you can see yourself on the map and look at people who share with you. Trust Circle does not sell your location.
- **Always:** Trust Circle holds your location in escrow, including in the background, so a trusted adult peer can find you if they look. They cannot see it until they confirm a look, and you are notified. Trust Circle does not sell your location.

## StoreKit

Products in `Resources/Trust.storekit` (local Run scheme only; archives use App Store Connect):

- `com.collapsetechnologies.trust.circle.monthly` — $7.99 / month, 7-day free trial, not family-shareable
- `com.collapsetechnologies.trust.circle.annual` — $69.99 / year, 7-day free trial, not family-shareable

**Unlock Circle for review** appears only when the server sets `StoreKit:AllowReviewUnlock`.

## App Store listing (paste into App Store Connect)

- Name: `Trust Circle` (App Store Connect uniqueness required `Trust Circle.` — exact `Trust Circle` is taken)
- Subtitle: `Location without watching`
- Keywords: `location,safety,family,share,circle,safety check,find,privacy`
- Support URL: `https://collapsetechnologies.com/trust/support`
- Marketing URL: `https://collapsetechnologies.com/trust`
- Privacy: `https://collapsetechnologies.com/trust/privacy`
- Terms: `https://collapsetechnologies.com/trust/terms`
- Category: Lifestyle
- Age: 17+ (adult peers; precise location sharing)
- Description:

```
Trust Circle holds your location in escrow for a trusted adult peer. They cannot see it until they confirm a Look. A look shows live location and the last two hours, and you get a quiet receipt — not silent, not an alarm.

Until they look is the default. Always and For a while are opt-in per person.

Circle is $7.99/month or $69.99/year, with a 7-day trial. One paid seat covers unpaid people in your circle. Looking is not paywalled. Family Sharing is off. No ads. We do not sell location.

Sign in with Apple. Delete your account in Settings.
```

Review notes: Sign in with Apple. A demo circle (Alex sealed, Jordan Always, Riley For a while) is seeded so Look works on one device. Use Unlock Circle for review if IAP is still Missing Metadata. Demo account is not a password — use Sign in with Apple.

### Age rating

17+ — unrestricted web access is not the reason; precise location is shared with a named adult peer after a confirmed Look.

### App Privacy (paste)

- Data used to track you: No
- Tracking: No
- Precise Location — linked, not used for tracking, App Functionality (escrow until Look)
- Coarse Location — same
- Name — Sign in with Apple display name, then the name you set in onboarding
- Phone Number — verified at onboarding (SMS one-time code)
- User ID — Sign in with Apple `sub` / account id
- Purchases — Circle StoreKit entitlement
- Product Interaction — looks and share settings
- Not collected: email (we do not require it), contacts, browsing history, ads
- Do not sell location. No ads. Family Sharing off.

### Export compliance

Uses only HTTPS / standard encryption. `ITSAppUsesNonExemptEncryption` is false.

### Account deletion (5.1.1(v))

Settings → Delete account. Also described at https://collapsetechnologies.com/trust/support

App Store screenshots (6.9" iPhone 1320×2868 and 13" iPad 2064×2752) live in `AppStore/Screenshots/`.

## Tests

Use Xcode’s `TrustCoreTests` target. Tests cover confirm-required looks, 2-hour default history, append-only log, revoke, Circle sponsor coverage, and that peeking escrow never returns coordinates. Domain tests still use `DemoTrustService`; the running app does not.
