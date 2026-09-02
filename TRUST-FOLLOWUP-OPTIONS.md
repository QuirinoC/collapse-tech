# Trust Circle — follow-up options (review memo, not a redesign)

Written 2 Sep 2026 against branch `quirinoc-ship-pending-wip` @ `5a0ca7a` (`apps/trust-ios`, `apps/trust-api`).
Line refs are to that commit. The working tree was on `pixelboard-seamless-tiles` (another session) when this was written; `git show quirinoc-ship-pending-wip:<path>` to read the cited files. No code was changed. File is untracked on purpose.

## 1. What "Grok's implementation" is

None found as a distinct artifact: no branch, commit, PR, or worktree by another author/model; the two `cursor/cloud-agent-*` branches are snapshots of Juan's own tree (`fa9c202` 30 Aug = early iOS-only prototype with `DemoTrustService`; `ce85d99` 1 Sep = jointrust atlas tweak); the only chat naming Grok as a model is the unrelated bachata-app chat; two cloud agents started this morning ("New Agent" 07:21, "Trust app context" 07:50) have produced nothing yet.
Baseline = the current Trust implementation on this branch. Treat that as "Grok's build."

## 2. Options to improve (ordered by leverage; S/M/L cost; "submit" = needed before App Store submit)

### Escrow / privacy

1. **Give a Look a lifetime (server TTL, ~30 min) via one small `BackgroundService` sweep.** Today one confirm + one receipt = open-ended live feed: `TrustEngine.GetCircleAsync` L60 treats any `active_looks` row as live, the table has no expiry (`001_initial.sql`; `PostgresTrustStore.GetActiveLookAsync` L404-408 has no time filter), and iOS only closes in `AppModel.closeMap()` L499 — app killed or crashed while the map is open = live pin on the viewer's home map forever. Same sweep prunes `location_points` >26h for phones that stopped ingesting (prune only runs inside `IngestManyAsync` L247 today; no `IHostedService` exists). Re-Look after TTL = new confirm + new receipt, matching the copy "Closing ends this look." — S — submit: **yes**.
2. **Make "Include last 24 hours" honest to the subject, and stop duplicate receipts.** `ExtendLookAsync` (TrustEngine L323-351) widens the unlock to 24h but never updates the persisted `look_events.history_window_hours` (only `active_looks`) and sends no receipt; her log and push still say "2 hours." Update the row + send a second quiet receipt ("now includes the last 24 hours"). Also `TrustEndpoints.LookAsync` L377-378 pushes a receipt on every POST even when the engine returns an already-active session → duplicate receipts on re-open; key the push on new `LookEvent` only. — S — submit: **yes**.
3. **Stop over-sharing presence on the wire.** `MemberDto.Presence` (ApiContracts L42-47, L146-152) sends battery, charging, `lastActiveAt`, `gotHomeAt`, `checkedInAt` for every member regardless of share mode. The UI never shows it (HomeView `personChip` L199-220), but any client can read "awake at 1 a.m." from a sealed person. Null presence unless `inboundLive`. — S — submit: no.
4. **Make the review switches non-global and flip them after approval.** `apps/render.yaml` sets `Trust__SeedReviewCircle=true` and `StoreKit__AllowReviewUnlock=true`: every real new account with no connections is seeded Alex/Jordan/Riley with a fake SF trail (`EnsureReviewCircleAsync` L484-518, hard-coded `LocationTrail.Home` L630), and anyone can `POST /circle/entitlement {reviewUnlock:true}` for free Circle (TrustEndpoints L450-461, L474-481). Better: seed only via a "Load demo circle" action shown when `allowsReviewUnlock`, and set both flags false the day 1.0 is approved. — S — submit: no; **day of approval: yes**.

### Family (expected-back / Home geofence)

5. **Build the Home geofence once, on her device, and use it for two jobs.** (a) "Back home by 4:00 AM": `CLMonitor`/`CLCircularRegion` for Home (coords only in her Keychain; needs Always — `LocationCoordinator.hasAlways`), new server `promises(subject, watcher, deadline_at, arrived_at)`, `POST /promises/{id}/arrived` on region entry; each ingest also carries `atHome: Bool` computed on-device so "last fix inside Home at deadline counts" works with zero coordinates on the server. Overdue = `deadline_at < now AND arrived_at IS NULL`, evaluated by the sweep in #1 → one quiet push to the watcher via `LookReceiptPublisher`/`ApnsClient`, no pin; she is still sealed until the watcher Looks (live + 2h + receipt). `last_active_at` older than ~30 min at deadline → copy "no signal since HH:MM", never "she's out." (b) The existing "Until I get home" timed share is a fixed `now + 4h` (Models.cs `TimedShare.EndAt` L263) while the copy promises arrival (`TrustCopy.timedHome`/`afterHome` L428/431); end it on the same arrival event. — M — submit: no (1.1). Until then, rename the chip to "For 4 hours" (S, submit: yes — it is a false promise today).
6. **Hide the explicit "I'm home" taps.** `SettingsView` L281-288 ships "Place ping — got home" and "Check in" (`AppModel.checkIn/sendPlacePing` L533-553; `TrustEngine.CheckInAsync/PlacePingAsync` L353-377), and `IngestManyAsync` L253-254 sets `GotHomeAt` from a hard-coded server-side Home. All contradict the passive-geofence decision and put a Home concept on the server. Hide in 1.0 (also removes a paywalled "place pings" feature to defend in review), delete when #5 lands. — S — submit: **yes**.

### Reliability

7. **Cheaper background location while sealed.** Sharing runs `kCLLocationAccuracyBest`, `distanceFilter 25`, `pausesLocationUpdatesAutomatically = false` and POSTs 0.8 s after every fix (`LocationCoordinator.applyTracking` L181-203; `AppModel.enqueueLocations` L665-674); `LocationIngestBuffer` has no size cap (L14-22). Nobody is watching 99% of the time. Use 100 m accuracy / 50 m filter / `activityType = .other` and a ~60 s batch flush while sealed; escalate to Best only while `beingWatched` or Always/Timed is on. — S/M — submit: no (first-week battery churn risk).
8. **Auth hygiene, five small fixes.** Session JWT sits in `UserDefaults` (`AuthSession.swift` L59, L93-94) — move to Keychain; 30-day token with no refresh (`SessionIssuer.Issue` L38) — add a sliding `/session/refresh`; no Sign in with Apple nonce (`AppleIdentityValidator` L121-133 checks none) — send SHA-256 nonce and verify; invite codes come from `Random.Shared` (TrustEngine L621) and never expire — `RandomNumberGenerator` + 7-day expiry; no rate limiting anywhere (`Program.cs` has no `AddRateLimiter`) — built-in limiter on `/session/*`, `/invites/accept`, `/location`. — S each — submit: Keychain **yes**; rest no.

### Monetization

9. **Derive Circle coverage from StoreKit expiry, not a sticky flag.** `accounts.has_circle` is recomputed only when a transaction or notification arrives (`StoreKitEntitlementStore` L185-187, L295-300); a missed EXPIRED notification leaves Circle — and the partner it covers via `CoverageOf` L586-593 — free forever. On-device renewals seen in `StoreManager.handle` L160-168 are never forwarded. Compute `IsCovered` from `storekit_transactions.expires_at > now()` at read time (or in sweep #1) and post `Transaction.updates` JWS to `/storekit/transactions`. — S — submit: no; before first renewals (month 1): yes.

### Polish

10. **Calm offline copy.** Failed polls surface raw `error.localizedDescription` (URLError text) as `pairingNotice` on the home screen (`AppModel.refresh` L246); ingest already buffers correctly (`LocationIngestStore`). Map transport errors to one line ("Offline — escrow continues on this phone") and never show `NSURLError` strings. — S — submit: no.

Already right, leave alone: confirm copy names live + 2h + notification (`TrustCopy` L256-278); look log has no coordinates (`LookEvent`); timed share reverts to previous resting (`SetShareAsync` L176-188, tested); Apple token audience/issuer/lifetime verified; StoreKit JWS chain verified server-side; production defaults for dev sign-in / memory store are safe (`appsettings.json`, `Program.cs` L70-75).

## 3. Don't do

1. No second place (work, school), no multiple geofences, no arrival history — one Home, one deadline.
2. No family dashboard, timeline, or "where has she been" view — overdue is one quiet line, then Look.
3. No chat, reactions, "I'm fine" replies, SOS, crash, or driving.
4. No visual redesign or new screens beyond one "Back home by" row and one overdue line; no new theme work.
5. No SEO/ASO program, no phone-OTP revival, no Android, no Pixelboard resubmission.

## 4. Questions for Juan

1. Look TTL: 15, 30, or 60 minutes?
2. Overdue Look with Circle: allow "Include last 24 hours" (it would show 1 a.m.)? yes / no
3. Receipt push: keep default sound (`ApnsClient` L87) or banner-only? sound / silent
4. Review switches after approval: flip off, or keep seed as an opt-in "demo circle" button? off / opt-in
5. If her phone lacks Always, should the parent see "no promise set" or nothing at all? show / nothing
