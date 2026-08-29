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

The checked-in app intentionally contains no production Firebase plist, AdMob application/unit ID, or server secret. Ads remain disabled until an app-specific AdMob adapter is added and `adsEnabled` is explicitly set. That adapter must configure Google's request maximum content rating to `G`; the reserved banner is also suppressed for Pro accounts.

Account deletion reauthenticates the user, calls authenticated `DELETE /api/v1/account`, revokes Apple tokens when Apple is the identity provider, and then deletes the Firebase identity. A server failure leaves Firebase authentication and Apple authorization intact so the user can retry.

The realtime client negotiates SignalR at `/api/v1/realtime`, consumes version 1 `AcceptedPixelV1` envelopes, and retains `UpdateBoard` only as a legacy fallback. It force-refreshes visible HTTP tiles on connect, reconnect, foreground recovery, and duplicate or reordered Redis stream cursors, with a bounded 30-second refresh while active, so live state converges to the server snapshot.

## Ship to TestFlight / App Store

The app code is ready to archive. These are the remaining console steps (I cannot click them for you).

**Legal URLs (use these in App Store Connect):**

- Privacy: `https://pixelboard.collapsetechnologies.com/Privacy`
- Terms: `https://pixelboard.collapsetechnologies.com/Terms`
- Support: `mailto:infinitepixelboard@gmail.com`
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

**3. Archive**

```bash
cd apps/infinite-pixelboard-ios
xcodegen generate
open InfinitePixelboard.xcodeproj
```

Sign with your paid team, archive, upload to TestFlight. Take screenshots from a signed-in session. Ads stay off (`adsEnabled = false`).

Pro will not show as purchased until Render StoreKit env matches the App Store products. You can still ship a paint-only TestFlight first, then turn StoreKit on.
