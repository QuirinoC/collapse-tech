# Infinite Pixelboard for iPhone and iPad

Native SwiftUI client for the versioned Infinite Pixelboard API. The Xcode app is generated from `project.yml`; reusable networking, geometry, cache, realtime, and account state live in the `PixelboardCore` Swift package.

## Local development

1. Run `xcodegen generate` in this directory.
2. Open `InfinitePixelboard.xcodeproj`.
3. The archive defaults to `https://pixelboard.collapsetechnologies.com` through the `PIXELBOARD_BASE_URL` build setting and generated `PixelboardBaseURL` Info.plist key. Override the build setting in an uncommitted `.xcconfig`, or set the `PIXELBOARD_BASE_URL` scheme environment variable for local development.
4. Download `GoogleService-Info.plist` from the Firebase project and add it to the app target locally. It is ignored and must never be committed. Enable Apple and Google providers in Firebase Authentication.
5. Enable Sign in with Apple for the bundle identifier and provisioning profile. Configure Firebase's Apple provider with the Services ID, Team ID, Key ID, and Sign in with Apple `.p8` private key so account deletion can revoke Apple tokens. Keep the private key only in Firebase/secret storage; never add it to the app or repository. The entitlement and Google OAuth callback scheme are checked in.
6. The Xcode project resolves Firebase Auth/Core and Google Sign-In with Swift Package Manager. Native Google and Apple flows exchange provider credentials with Firebase; Apple uses a cryptographically secure SHA-256 nonce.
7. Set the StoreKit product IDs in `AppConfiguration` to match App Store Connect and the server. `Resources/InfinitePixelboard.storekit` supplies local monthly and annual subscriptions.

The checked-in app intentionally contains no production Firebase plist, AdMob application/unit ID, or server secret. Ads remain disabled until an app-specific AdMob adapter is added and `adsEnabled` is explicitly set. That adapter must configure Google's request maximum content rating to `G`; the reserved banner is also suppressed for Pro accounts.

Account deletion reauthenticates the user, calls authenticated `DELETE /api/v1/account`, revokes Apple tokens when Apple is the identity provider, and then deletes the Firebase identity. A server failure leaves Firebase authentication and Apple authorization intact so the user can retry.

The realtime client negotiates SignalR at `/api/v1/realtime`, consumes version 1 `AcceptedPixelV1` envelopes, and retains `UpdateBoard` only as a legacy fallback. It force-refreshes visible HTTP tiles on connect, reconnect, and duplicate or reordered Redis stream cursors so live state converges to the server snapshot.
