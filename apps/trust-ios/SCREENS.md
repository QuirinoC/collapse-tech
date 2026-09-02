# Trust — screen inventory

Reply with **cut X, merge Y, add Z** using the IDs below. This is a product surface list, not a redesign spec and not implementation.

**Paper (every screen):** Didot wordmark, white sheet, black ink, one red `#E10600` rule. Night Edition inverts the sheet in Settings; it is not a separate app.

Home UI is owned elsewhere. This inventory treats **map as the product** (people as pins/marks). It does not prescribe a people column.

---

## Contents

**Onboarding & account**
1. [OA.1 First open](#oa1-first-open)
2. [OA.2 Sign-in failed](#oa2-sign-in-failed)
3. [OA.3 Handle](#oa3-handle)

**Map & looking**
4. [ML.1 Home](#ml1-home)
5. [ML.2 Home — empty circle](#ml2-home--empty-circle)
6. [ML.3 Look confirm](#ml3-look-confirm)
7. [ML.4 After Look](#ml4-after-look)
8. [ML.5 Look closed](#ml5-look-closed)

**People & sharing**
9. [PS.1 Person](#ps1-person)
10. [PS.2 For a while](#ps2-for-a-while)
11. [PS.3 Invite](#ps3-invite)
12. [PS.4 Join](#ps4-join)
13. [PS.5 Revoke](#ps5-revoke)

**Activity**
14. [AC.1 Look log](#ac1-look-log)
15. [AC.2 Quiet receipt (in-app)](#ac2-quiet-receipt-in-app)
16. [AC.3 Place ping](#ac3-place-ping)

**Settings & paywall**
17. [ST.1 Settings](#st1-settings)
18. [ST.2 Circle](#st2-circle)
19. [ST.3 Delete account](#st3-delete-account)

**System**
20. [SY.1 Location — While Using](#sy1-location--while-using)
21. [SY.2 Location — Always](#sy2-location--always)
22. [SY.3 Notifications](#sy3-notifications)
23. [SY.4 Location denied](#sy4-location-denied)
24. [SY.5 Look push](#sy5-look-push)
25. [SY.6 Errors](#sy6-errors)

**Not screens** (Safari, OS, data rules) — [below](#not-screens).

---

## How to read a card

**When** · **On it** · **Do** · **Must not** · **Empty / edge** · **Paper** (one line)

---

## Onboarding & account

### OA.1 First open

- **When:** Cold launch, signed out, or after sign-out / account delete.
- **On it:** Collapse Technologies wordmark. **Trust** (Didot). One line: location stays with you until someone looks. Adult peers. No ads. We do not sell location. Apple sign-in. Google sign-in. Links: Privacy, ToS (Support can live here or only in Settings).
- **Do:** Sign in with Apple. Sign in with Google. Open Privacy / ToS.
- **Must not:** Map, people list, Look, Circle prices as the hero, email/password, “don’t ask again.”
- **Empty / edge:** Signing in (disabled buttons). Cancelled Apple/Google sheet → stay here. Google unavailable → notice, stay on Apple.
- **Paper:** Centered masthead, red rule under Trust, black Apple fill; Google is outline ink — not a second accent.

### OA.2 Sign-in failed

- **When:** Apple/Google cancelled, token rejected, or API down after they tap sign-in.
- **On it:** Same First open layout plus a short notice (expired session, Apple failed, network).
- **Do:** Try again. Privacy / ToS.
- **Must not:** A second “error app.” Stack traces. A skip-to-map guest mode.
- **Empty / edge:** Session expired mid-use → land here with “Sign in expired.”
- **Paper:** Same sheet as OA.1; notice is muted ink, not a red alarm.

### OA.3 Handle

- **When:** After Sign in with Apple (or Google), before Home/map. First launch after auth, or any launch while a unique handle is not set. After they wipe the account this comes back; it does not reappear while the handle remains on the account.
- **On it:** Collapse Technologies mark. Didot **Your handle**. One field: handle, shown as `@jordan`. Continue when it is valid and available. Sign out. If Apple already sent a display name, keep it on the account — do not ask for it here.
- **Do:** Choose a unique handle. Continue to Home.
- **Must not:** Phone. SMS OTP. Skip. A display-name field. Map. The OA.1 atlas background. Development codes.
- **Empty / edge:** Apple already gave a name → not shown; the field may suggest a slug of it. Taken / reserved / invalid → stay here. Wrong Apple account → Sign out to OA.1.
- **Paper:** White sheet, black ink, red Continue; not beige; not the login atlas.

---

## Map & looking

### ML.1 Home

- **When:** Signed in and onboarding complete (OA.3 handle is set). This is the app.
- **On it:** Full-bleed map. **You** as a square + red rule. **Live** people (Always / For a while / open Look) as initial pins. **Sealed** people (Until they look) as lock marks — no coordinate. Masthead: Trust · look log · you/settings. Optional folio if someone is looking at you. Presence on a sealed mark is last-active / battery only — never a lat/long. Invite line available from a mark or a thin chrome, not a people column: “I trust you with my location.”
- **Do:** Pan/zoom. Tap a sealed mark → Look confirm. Tap a live pin → After Look if a look is open, else Person. Open Look log. Open Settings. Share invite.
- **Must not:** A column or list of people as the product. GPS for sealed people. Peeking escrow. Ads. A feed of addresses.
- **Empty / edge:** See ML.2. One person vs several: still pins, not a roster. Circle banner (sponsor covers you) is a folio, not a paywall. Location not granted: you-pin missing or last known; map still shows. “They’re looking” folio while a peer’s look is open on you.
- **Paper:** Muted MapKit plate as the sheet; Didot in the masthead; red only on you-pin and Look.

### ML.2 Home — empty circle

- **When:** Signed in, no trusted people yet (or last person revoked).
- **On it:** Same map + you-pin. Invite: create code, share **“I trust you with my location.”** Join-with-code field. Line: they cannot see coordinates until they look; looking is free.
- **Do:** Create invite. Share invite. Join with code.
- **Must not:** Fake demo pins as the empty state. A people list with placeholders. Circle required to invite the first person.
- **Empty / edge:** Invalid code. Already paired. Seat limit (Free = 1). Incoming `trust://invite/CODE` or `https://trust.collapsetechnologies.com/i/CODE` fills join and attempts accept — no extra landing page.
- **Paper:** Map still dominates; invite is a paper card on the map, not a replacement home.

### ML.3 Look confirm

- **When:** They tap Look on a sealed person (pin/mark). Every look. No “don’t ask again.”
- **On it:** “Open {name}’s location?” Facts: live location · last 2 hours of movement · {name} is notified immediately (quiet receipt, not an alarm). Cannot be undone. If they already looked at this person 2+ times today, say so.
- **Do:** Look. Cancel.
- **Must not:** Skip confirm. Silent look. “Don’t ask again.” Paywall on Look. Trail/map behind the sheet as a preview of their coords.
- **Empty / edge:** Pair gone / revoked → error, back to Home. Confirm fails → stay on sheet with notice.
- **Paper:** Paper sheet over the map; Didot question; red ticks on the three facts; Look is the red verb.

### ML.4 After Look

- **When:** Look confirmed. Full-screen until they close.
- **On it:** Live pin + trail for the last 2 hours. HUD: watching now · last N hours · {name} was notified · closing ends this look. Circle: optional “Include last 24 hours.”
- **Do:** Close (ends the look). Pan/zoom. Extend to 24h if covered.
- **Must not:** Keep showing coords after Close. A second confirm. Alarm chrome. Other people’s trails. Selling the look.
- **Empty / edge:** Trail empty (stationary) → live pin only. Extend fails → notice, keep 2h. Being watched yourself is a folio, not this map.
- **Paper:** Same muted plate; paper HUD; red only on “Watching now.”

### ML.5 Look closed

- **When:** Session ended while the look map is still up, or they closed and the cover hasn’t dismissed.
- **On it:** “Look closed.” Done.
- **Do:** Done → Home (sealed again unless Always / For a while).
- **Must not:** Leave the trail on screen. Re-open without a new confirm.
- **Empty / edge:** Rare; usually Close goes straight to Home.
- **Paper:** Paper interstitial; Didot line; no map peek.

---

## People & sharing

### PS.1 Person

- **When:** Tap a person (live pin, sealed mark, or their name in Settings). About **your** location toward them — not a profile of theirs.
- **On it:** “What {name} can see.” Three modes:
  - **Until they look** (default) — nothing until they look; then live + 2h + you get a receipt.
  - **Always** (exception) — they see live until you turn it off.
  - **For a while** (exception) — timer overlay; then reverts to whatever you had — not a new default.
  Presence without coords if they are sealed to you (last active, battery). Your share state toward them.
- **Do:** Set Until they look. Set Always. Open For a while. Close.
- **Must not:** Their GPS while sealed. A people directory. Making Always the default for everyone.
- **Empty / edge:** Person revoked mid-sheet → dismiss. Free seat already used when adding someone else → Circle, not a silent fail on this sheet.
- **Paper:** Didot title; red rule; selected mode marked with the red hairline, not a rainbow of chips.

### PS.2 For a while

- **When:** They choose For a while on Person.
- **On it:** How long: **1 hour** · Tonight · Until I get home. Sentence must include revert copy, e.g. “After 1 hour, {name} will only see your location if they look — unless you’ve set something else for them.” If resting mode was Always, say the timer does **not** switch them to Until they look.
- **Do:** Pick duration. Share for a while. Close (no change).
- **Must not:** A timer that silently becomes Always. A timer that becomes the new default. Coordinates on this sheet.
- **Empty / edge:** Timer running → show remaining; changing duration replaces the overlay. Timer ends → back to resting mode; Home pin goes sealed or stays live accordingly.
- **Paper:** Same Person sheet language; duration in ink; selected duration can fill red.

### PS.3 Invite

- **When:** Empty circle, or they choose invite from Home chrome / Settings while they have a free seat.
- **On it:** The line **“I trust you with my location.”** Code. Share payload includes that line plus `https://trust.collapsetechnologies.com/i/CODE` and `trust://invite/CODE`. Reminder: hidden until they look.
- **Do:** Create invite. System share sheet. Close.
- **Must not:** Contact scraping. “Find friends.” A map of who hasn’t joined.
- **Empty / edge:** Create failed. Seat full → ST.2 Circle, not a broken code. Code already pending → show it again.
- **Paper:** Didot invite line is the headline; code in roman Didot; no illustrations of people.

### PS.4 Join

- **When:** They type a code, or a deep link filled it. Can sit on ML.2 or as a small card on Home.
- **On it:** Code field. Join. Result notice (invalid, already paired, seat full).
- **Do:** Join. Edit code.
- **Must not:** Auto-look after join. Showing the inviter’s coordinates as a “preview.”
- **Empty / edge:** Signed out + deep link → First open, then join after auth (or drop the code). Duplicate join.
- **Paper:** Hairline field; Join is outline ink, not a second red CTA next to Look.

### PS.5 Revoke

- **When:** Settings → a member → Revoke.
- **On it:** “Revoke this person immediately?”
- **Do:** Revoke (destructive). Cancel.
- **Must not:** Soft “hide.” Keeping an open look on them after revoke.
- **Empty / edge:** Last person revoked → ML.2. Open look on that person → close it.
- **Paper:** System confirm is fine; if in-app, paper + red Revoke only.

---

## Activity

### AC.1 Look log

- **When:** Masthead log · or Settings → Look log.
- **On it:** “Every look stays.” Rows: who looked at whom · time · live + last Nh. Append-only while the account exists. Free: 30 days. Circle: 365 days + export. Coverage folio if sponsored.
- **Do:** Close. Export (Circle). Open Settings/Circle if they want longer retention.
- **Must not:** Delete-one-row. A map per row. Coordinates in the log.
- **Empty / edge:** **No looks yet.** Older looks held for Circle retention (count only). Export disabled when empty.
- **Paper:** Didot “Every look stays.”; hairline rows; no cards.

### AC.2 Quiet receipt (in-app)

- **When:** App is open and someone just looked at you (also see SY.5 when backgrounded).
- **On it:** “{viewer} viewed your location.” They can see live + last 2 hours. Folio: Notification.
- **Do:** Tap to dismiss. Optional: open Home (you stay sealed to them unless you chose Always).
- **Must not:** Alarm sound/haptics storm. Auto-open After Look for the *subject*. A local notify on the looker’s phone.
- **Empty / edge:** Multiple looks → latest. Foreground + push together → one story, not two competing alerts.
- **Paper:** Paper banner, ink border, red folio; not a toast blob.

### AC.3 Place ping

- **When:** Settings (Circle). Got-home without opening the map. Check-in is the free cousin: presence bump, still no coords.
- **On it:** Confirm you ping “got home” (Circle) or check in (everyone). Success is presence on their Home mark — not a new map.
- **Do:** Send ping / check in. If not covered → Circle.
- **Must not:** Drop a coordinate on the peer’s map. Paywall Look in the same breath.
- **Empty / edge:** Circle required for place ping. Check-in always allowed. Failed network → SY.6.
- **Paper:** Settings row, not a celebration screen.

---

## Settings & paywall

### ST.1 Settings

- **When:** Masthead name / you.
- **On it:** Signed in with Apple or Google as {name}. Night Edition. Circle summary or Get Circle. Members (you, N / limit, plan, revoke). Location purpose + permission state + Allow while using / Always / quiet receipts. Look log. Place ping / check in. Sign out. Delete account. Privacy · Terms · Support. We do not sell location.
- **Do:** Toggle Night Edition. Buy/restore Circle. Manage subscription. Revoke. Request permissions. Sign out. Delete. Open legal in Safari.
- **Must not:** A second home. Selling location. Family Sharing. Ads. Debug API URL in Release.
- **Empty / edge:** Not signed in (shouldn’t happen). Products still loading. Review-only “Unlock Circle for review.” Subscription linked to another Trust account → contact hello@collapsetechnologies.com.
- **Paper:** Inline “Settings”; Didot section titles; paper surfaces; Night Edition inverts this sheet too.

### ST.2 Circle

- **When:** Get Circle from Settings, seat-limit on invite, or place-ping without coverage. Looking is **not** this screen.
- **On it:** Free vs Circle. **$7.99 / mo** and **$69.99 / yr**, 7-day trial. One paid seat **sponsors** unpaid people in the circle. Looking is not paywalled. Auto-renew copy. Family Sharing off. We do not sell location. Privacy · Terms. Restore. Manage subscription if already covered. Sponsor folio: “You sponsor…” / “{name}’s Circle covers you.”
- **Do:** Buy monthly. Buy annual. Restore. Manage. Unlock for App Review (server flag only). Close.
- **Must not:** Lock Look. Stripe Checkout on iOS. Family Sharing. A second price list that disagrees with StoreKit.
- **Empty / edge:** Products empty → show $7.99 / $69.99 as copy, buttons disabled. Already covered → benefits + manage, not buy. Trial eligible vs not. Purchase failed → notice. Review unlock hidden in production.
- **Paper:** Can be a Settings section or its own sheet; Didot “Circle”; buy buttons red; never a store-y illustration.

### ST.3 Delete account

- **When:** Settings → Delete account.
- **On it:** Location, looks, and circle membership are removed. Cannot be undone.
- **Do:** Delete account. Cancel.
- **Must not:** “Deactivate.” Keeping the look log after delete. A download wall before delete.
- **Empty / edge:** Delete fails → stay signed in with error. Success → OA.1.
- **Paper:** System confirm is enough; destructive red only on Delete.

---

## System

### SY.1 Location — While Using

- **When:** First Home / first map use (or Settings → Allow while using). OS dialog. Not on login.
- **On it:** Purpose: Trust uses your location while the app is open so you can see yourself on the map and look at people who share with you. Not sold.
- **Do:** Allow While Using. Don’t Allow.
- **Must not:** A custom fake permission UI. Asking Always here. Asking Always (or starting background ingest) because they signed in.
- **Empty / edge:** Not determined vs denied — see SY.4. Looking at someone else, the map of others, and Settings do not require Always.
- **Paper:** OS chrome; our string is the only copy we control.

### SY.2 Location — Always

- **When:** They turn on sharing — invite (“I trust you with my location”), join, Until they look / escrow, Always, or For a while — after While Using. Or they tap Allow always (Home folio or Settings). Not on login. Must already have While Using.
- **On it:** Purpose: escrow for a trusted adult peer, including in the background; hidden until they look; you are notified; not sold. Needed so Look and Always / timers still work when Trust is closed.
- **Do:** Change to Always. Keep While Using.
- **Must not:** Implying Always is required to *look* at someone else. Silently requesting Always on sign-in. Starting background updates when sharing is off, even if Always was granted earlier.
- **Empty / edge:** Keep While Using → live you-pin and ingest only while the app is open; escrow / Always / timer gaps in background; copy to open iOS Settings (the OS will not ask Always again). Reduced accuracy → request precise. Blue system indicator when Always is granted **and** sharing is on. Sharing off (empty circle) → no ingest, no background, even with Always permission.
- **Paper:** OS chrome.

### SY.3 Notifications

- **When:** After sign-in, and Settings → Allow quiet receipts. OS dialog.
- **On it:** Alerts for when someone looks at you (quiet, not an alarm).
- **Do:** Allow. Don’t Allow.
- **Must not:** Using notification permission to nag for Circle.
- **Empty / edge:** Denied → they still see AC.2 if the app is open; no APNs. Provisional → quiet.
- **Paper:** OS chrome.

### SY.4 Location denied

- **When:** Home or Settings when permission is denied/restricted.
- **On it:** Permission = Denied. Purpose string. Buttons that re-prompt if possible, else copy to open iOS Settings.
- **Do:** Retry. Open Settings (OS). Continue with map (others’ live pins still work). If they kept While Using after the Always prompt, Open Settings so they can change to Always.
- **Must not:** Blocking the whole app behind location. Fake location on the map as if granted. Treating Always-denied as a block on looking at someone else.
- **Empty / edge:** Simulator / no fix → you-pin fallback, not a sealed stranger’s coord.
- **Paper:** Settings location card; muted status, not a red panic.

### SY.5 Look push

- **When:** Someone looked at you and the app is backgrounded or killed. APNs.
- **On it:** Title: “{viewer} viewed your location.” Body: they can see live + last 2 hours. Not silent, not an alarm.
- **Do:** Open app → Home (and AC.2 if still relevant).
- **Must not:** A local notification on the looker’s device. Banner that reveals the subject’s coordinates. Sound that reads as emergency siren.
- **Empty / edge:** Notifications off → no push; in-app banner still if they open the app. Looker’s phone stays quiet.
- **Paper:** System notification; title/body only — no map snapshot.

### SY.6 Errors

- **When:** API, StoreKit, pairing, look, or ingest fails. Not a destination they browse to.
- **On it:** One sentence on the current screen (Home notice, Settings Circle error, First open notice). Unauthorized → sign out to OA.1. Seat / Circle required → ST.2. Invalid invite → PS.4.
- **Do:** Dismiss / retry on the same screen.
- **Must not:** A generic “Error” full-screen as the product. Retry loops that re-look without confirm.
- **Empty / edge:** Offline Home: last snapshot + notice. Purchase linked to another account. Look confirm required (shouldn’t happen if UI always confirms).
- **Paper:** Muted or accent ink on the existing sheet — no separate error brand.

---

## Not screens

Call these out so they are not “missing screens” and not extra chrome.

| Thing | What it is |
| --- | --- |
| Privacy | Safari → `https://collapsetechnologies.com/trust/privacy` |
| Terms of Service | Safari → `https://collapsetechnologies.com/trust/terms` |
| Support | Safari → `https://collapsetechnologies.com/trust/support` |
| Marketing | Safari → `https://collapsetechnologies.com/trust` — not in the app shell |
| Presence without coords | Data rule on Home / Person: last active, battery, got-home, check-in. **Never** used to draw a map for sealed people |
| Masthead Paper | Visual system (Didot, red rule, paper/ink), not a route |
| Night Edition | Settings toggle, not a screen |
| You pin / live pin / sealed mark | Map marks on ML.1 / ML.4, not screens |
| Invite share sheet | OS share; payload is PS.3 |
| Apple / Google sheets | OS auth; First open stays underneath |
| StoreKit payment sheet | OS; ST.2 stays underneath |
| Manage subscription | Apple subscriptions URL |
| Deep link join | URL handler into PS.4 / ML.2 — no splash |
| Sign out | Settings action → OA.1 |
| Check-in | Presence bump from ST.1; no map |
| Review unlock | Hidden Settings control when the server allows it |

---

## Code today (do not treat as the inventory)

Inspected `apps/trust-ios` so nothing real is invisible. **This list is not a vote to keep current Home chrome.**

| Inventory | Exists in app today as |
| --- | --- |
| OA.1 | `LoginView` — Apple only; Google is stub (“Trust uses Sign in with Apple.”) |
| OA.3 | `OnboardingView` — unique handle; gates Home until the handle is set |
| ML.1 | `HomeView` — map **plus** a people **column rail** (not the product in this doc) |
| ML.2 | `PairingView` in the Home stack when the circle is empty |
| ML.3 | `LookSheet` |
| ML.4 / ML.5 | `LookMapView` |
| PS.1 / PS.2 | `PersonShareSheet` / `TimedShareSheet` |
| PS.3 / PS.4 | Pairing + `ShareLink` on Home |
| PS.5 / ST.3 | Settings confirmation dialogs |
| AC.1 | `LookLogView` |
| AC.2 | `QuietReceiptBanner` |
| ST.1 / ST.2 | `SettingsView` (Circle is a section; `showingPaywall` is unused) |
| SY.* | OS dialogs + Settings location/notification buttons |

---

## Cut / merge / add

Use IDs. Examples: *cut AC.3*, *merge ST.2 into ST.1*, *add Google as OA.1 only*, *merge ML.2 into ML.1*, *cut ML.5*.
