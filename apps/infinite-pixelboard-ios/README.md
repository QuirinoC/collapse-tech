# Infinite Pixelboard for iPhone and iPad

Native SwiftUI client for the versioned Infinite Pixelboard API. The Xcode app is generated from `project.yml`; reusable networking, geometry, cache, realtime, and account state live in the `PixelboardCore` Swift package.

## Local development

1. Run `xcodegen generate` in this directory.
2. Open `InfinitePixelboard.xcodeproj`.
3. The archive defaults to `https://pixelboard.collapsetechnologies.com` through the `PIXELBOARD_BASE_URL` build setting and generated `PixelboardBaseURL` Info.plist key. Override the build setting in an uncommitted `.xcconfig`, or set the `PIXELBOARD_BASE_URL` scheme environment variable for local development.
4. Download `GoogleService-Info.plist` from the Firebase iOS app and drop it at `apps/infinite-pixelboard-ios/GoogleService-Info.plist` (gitignored). After it exists, add it back to the app target (or restore the optional `GoogleService-Info.plist` resource in `project.yml`) and run `xcodegen generate`. Enable Apple and Google providers in Firebase Authentication. Crashlytics uses that same plist.
5. Enable Sign in with Apple for the bundle identifier and provisioning profile. Configure Firebase's Apple provider with the Services ID, Team ID, Key ID, and Sign in with Apple `.p8` private key so account deletion can revoke Apple tokens. Keep the private key only in Firebase/secret storage; never add it to the app or repository. The entitlement and Google OAuth callback scheme are checked in.
6. The Xcode project resolves Firebase Auth/Core and Google Sign-In with Swift Package Manager. Native Google and Apple flows exchange provider credentials with Firebase; Apple uses a cryptographically secure SHA-256 nonce.
7. Set the StoreKit product IDs in `AppConfiguration` to match App Store Connect and the server. `Resources/InfinitePixelboard.storekit` supplies local monthly and annual subscriptions and is attached to the shared Run scheme.

## Localization

The UI localization pass covers German (`de`), French (`fr`), Japanese (`ja`), Korean (`ko`), and Simplified Chinese (`zh-Hans`). Shared UI copy is centralized in `Sources/InfinitePixelboardApp/PixelboardL10n.swift`; translations and localized display names live in the matching `Resources/*.lproj` directories. Server-provided board messages and API error text remain unchanged because they are runtime content, not app-owned copy.

French and Korean were selected as the next two locales using current monetization evidence rather than language-population estimates. Apple and Analysis Group’s [2025 App Store ecosystem report](https://www.apple.com/newsroom/pdfs/Apples_Global_App_Store_Ecosystem_and_Its_Growth_2025.pdf) reports 2025 digital-goods-and-services billings and sales of approximately $2.5B in France and $2.6B in Korea. The independent [AppMagic Monetization Report 2025](https://appmagic.rocks/files/img-blog/EN_Monetization_Report_2025.pdf), based on October 2024–September 2025 in-app-purchase revenue, reports France at $926.1M (+5.63%) and South Korea at $3.1B (−15.05%), keeping both among the leading markets while showing different regional trends. These figures support prioritizing `fr` and `ko` for a paid iOS experience; they are market research only and do not change App Store Connect configuration.

Run `python3 Scripts/validate_localizations.py` to check key parity and format placeholders before adding or changing a translation.

The checked-in app intentionally contains no production Firebase plist, AdMob application/unit ID, or server secret. Ads remain disabled until an app-specific AdMob adapter is added and `adsEnabled` is explicitly set. That adapter must configure Google's request maximum content rating to `G`; the reserved banner is also suppressed for Pro accounts.

Account deletion reauthenticates the user, calls authenticated `DELETE /api/v1/account`, revokes Apple tokens when Apple is the identity provider, and then deletes the Firebase identity. A server failure leaves Firebase authentication and Apple authorization intact so the user can retry.

The realtime client negotiates SignalR at `/api/v1/realtime`, consumes version 1 `AcceptedPixelV1` envelopes, and retains `UpdateBoard` only as a legacy fallback. It force-refreshes visible HTTP tiles on connect, reconnect, foreground recovery, and duplicate or reordered Redis stream cursors, with a bounded 30-second refresh while active, so live state converges to the server snapshot.

Push notifications use direct APNs. After sign-in, the app offers a focused permission prompt and registers its installation-scoped token with the server. Pixel-overwrite activity is aggregated durably per account and UTC day; a digest is queued only after 10 relevant overwrites and never more than once per day. There are no per-category notification toggles, and denied permission never blocks browsing or painting.

iOS invite sharing uses the existing `pixelboard://invite/<code>` URL scheme because this repository defines no App Store or TestFlight listing URL yet. The website invite URL remains unchanged.

## Ship to TestFlight / App Store

The app code is ready to archive. These are the remaining console steps (I cannot click them for you).

**Legal URLs (use these in App Store Connect):**

- Privacy: `https://pixelboard.collapsetechnologies.com/Privacy`
- Terms: `https://pixelboard.collapsetechnologies.com/Terms`
- Support: `mailto:hello@collapsetechnologies.com`
- Bundle ID: `com.collapsetechnologies.pixelboard`

**App Store listing copy (do not copy Everyone Draw):** never write “no limits”, “unlimited”, “draw freely”, or “private space far from the center.” Subtitle: `Shared mural. 5s per pixel.` Description must say 5 seconds free / 1 second Pro, that anyone can overwrite a pixel, and that Syncing is live updates — painting still works.

**1. Firebase (required to paint)**

1. Download `GoogleService-Info.plist` for the iOS app (`241184054384-…` client is already in `project.yml`) and drop it in `apps/infinite-pixelboard-ios/` (gitignored).
2. Enable **Apple** and **Google** sign-in providers.
3. For Apple: add Sign in with Apple on the App ID, then paste Services ID / Team ID / Key ID / `.p8` into Firebase so account deletion can revoke Apple tokens.
4. On Render (`infinite-pixelboard` service) set `Firebase__Enabled=true` and `Firebase__ProjectId` to that Firebase project ID. Placement stays off until Firebase **and** Postgres are enabled.

**2. App Store Connect**

1. Create the iOS app with bundle ID `com.collapsetechnologies.pixelboard`.
2. Subscription group **Pixelboard Pro** with products:
   - `com.collapsetechnologies.pixelboard.pro.monthly` ($2.99/mo in the local StoreKit file)
   - `com.collapsetechnologies.pixelboard.pro.annual` ($24.99/yr)
3. Paid Apps agreement, tax, and banking (or IAP never leaves “Missing Metadata”).
4. App Store Server Notifications V2 URL: `https://pixelboard.collapsetechnologies.com/api/v1/storekit/notifications`
5. On Render set `StoreKit__Enabled=true`, `StoreKit__BundleId`, the two product IDs, `StoreKit__AllowedEnvironments__0=Production` (add `Sandbox` only while TestFlight-testing), and `StoreKit__TrustedRootCertificates__0` (Apple Root CA G3, base64 DER). See `apps/infinite-pixelboard/README.md`.

**3. Push notifications**

1. Enable Push Notifications for `com.collapsetechnologies.pixelboard` in Apple Developer.
2. Create an APNs Auth Key and add its Team ID, Key ID, and `.p8` contents to Render as `Apns__TeamId`, `Apns__KeyId`, and `Apns__PrivateKey`. Set `Apns__Enabled=true`, `Apns__BundleId=com.collapsetechnologies.pixelboard`, and `Apns__Environment=production`.
3. Keep the `.p8` file out of the repository. Build the app with the checked-in `aps-environment` entitlement, sign in on a physical device, enable notifications, and confirm the device appears as an active registration.
4. For an overwrite test, create 10 relevant overwrites of pixels owned by one account in one UTC day and verify one daily digest arrives. Test permission denial, logout, token rotation, invalid tokens, and account deletion.

**4. Archive**

```bash
cd apps/infinite-pixelboard-ios
xcodegen generate
open InfinitePixelboard.xcodeproj
```

Sign with your paid team, archive, upload to TestFlight. Take screenshots from a signed-in session. Ads stay off (`adsEnabled = false`).

Pro will not show as purchased until Render StoreKit env matches the App Store products. The app passes StoreKit's server-issued `appAccountToken` for the signed-in Pixelboard account and refreshes the matching current entitlement after every auth transition; sign-out clears purchase UI state. Restore Purchases re-syncs the Apple subscription for the current Apple ID; it never moves a subscription between Apple IDs, Google sign-in, or Pixelboard accounts. If the server reports that an Apple subscription belongs to another Pixelboard account, the app leaves the current account on its existing tier and directs the user to hello@collapsetechnologies.com; transfers require support verification and remove Pro access from the previous account. You can still ship a paint-only TestFlight first, then turn StoreKit on.
