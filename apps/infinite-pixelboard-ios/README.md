# Infinite Pixelboard for iPhone and iPad

Native SwiftUI client for the versioned Infinite Pixelboard API. The Xcode app is generated from `project.yml`; reusable networking, geometry, cache, realtime, and account state live in the `PixelboardCore` Swift package.

## Local development

1. Run `xcodegen generate` in this directory.
2. Open `InfinitePixelboard.xcodeproj`.
3. Set `PIXELBOARD_BASE_URL` in the scheme environment to the HTTPS server URL.
4. Add Firebase Auth through Swift Package Manager and a locally managed `GoogleService-Info.plist`. Do not commit credentials.
5. Add Sign in with Apple and Google provider SDKs, then exchange each native provider credential for a Firebase credential in `FirebaseAuthAdapter.signIn(with:)`. The checked-in adapter is an explicit, non-anonymous configuration boundary and fails closed until this is wired.
6. Set the StoreKit product IDs in `AppConfiguration` to match App Store Connect and the server. `Resources/InfinitePixelboard.storekit` supplies local monthly and annual subscriptions.

The checked-in app intentionally contains no production Firebase plist, AdMob application/unit ID, or server secret. Ads remain disabled until an app-specific AdMob adapter is added and `adsEnabled` is explicitly set. That adapter must configure Google's request maximum content rating to `G`; the reserved banner is also suppressed for Pro accounts.

Account deletion has a native entry point and deletes the current Firebase identity when Firebase Auth is linked. Complete deletion of server-held account data requires a corresponding authenticated server endpoint; the current v1 server contract does not expose one.

The realtime client performs the ASP.NET Core SignalR negotiate/handshake flow and accepts both the intended `PixelAccepted` envelope and the legacy `UpdateBoard` invocation. On every reconnect it force-refreshes visible HTTP tiles, so dropped or unavailable live events converge to server state. The current server does not wire `IBoardEventPublisher` to `BoardHub`; live updates therefore depend on the reconnect recovery until that server integration is added.
