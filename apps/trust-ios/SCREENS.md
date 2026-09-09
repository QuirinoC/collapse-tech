# Trust Circle — lean screen inventory

**Rule:** Destinations are rare. Sheets are cheap. States are free.

One job: share location with people you trust (couples, parent/child, elder — same surfaces).

---

## Destinations (shell)

| ID | Screen | When |
|---|---|---|
| D1 | **Login** | Signed out. Sign in with Apple. DEBUG: **See the app** enters offline demo. |
| D2 | **Handle** | Once after first Apple sign-in. Pick `@handle`. |
| D3 | **Main shell** | Masthead Trust + `#E10600` rule + light footer. |

### Footer tabs

| Tab | Job |
|---|---|
| **Circle** | Vertical list of people who share with you. Photo, name, permission-aware subtitle. Sealed → Home/Away only. Live → place OK; map optional. |
| **Sharing** | Outbound grants. Inline Until / Always / While. Home presence toggle. Timed → duration sheet. |
| **Invite** | “I trust you with my location.” Code + join. |
| **You** | Settings / profile scroll. |

---

## Sheets

| Sheet | Opens from | Contains |
|---|---|---|
| **Look confirm** | Tap Look / sealed row | They will be notified. Cancel / Confirm. Then place reveals on Circle. |
| **Timed duration** | Sharing → While | 1 hour / Tonight / 4 hours. |
| **Look log** | You → Look log | Who looked, when. |
| **Map (optional)** | Live / after Look row | Secondary full-screen MapKit — not default Home. |

---

## Cut / unused vs map-first IA

- Map-first Home + horizontal people strip
- Person share sheet as primary outbound editor (Sharing tab replaces it; `PersonShareSheet` kept unused for compile)
- Settings-as-only-sheet for You (now a tab; sheet flag retained)
- Orphan map-centric chrome on Home

---

## Demo circle (See the app)

Offline via `DemoTrustService.startLeanDemo()`:

- **Alex** — partner, sealed Until they look, Away
- **Maya** — sealed, Away, **overdue** promise
- **Eli** — Always / live, Home · Capitol Hill → **View** opens MapKit
- **Jordan** — Timed (live), Away · Mission → **View** opens MapKit
- **Nora** — sealed Until they look, Home

Tap **View** on a live row (or Look → Confirm on sealed, then View) for that person’s map. Footer → Sharing / Invite / You.
