# Trust Circle — lean screen inventory

**Rule:** Destinations are rare. Sheets are cheap. States are free.

One job: share location with people you trust (couples, parent/child, elder — same surfaces).

---

## Destinations (4)

| ID | Screen | When |
|---|---|---|
| D1 | **Login** | Signed out. Sign in with Apple. DEBUG: **See the app** enters offline demo. Errors stay here. |
| D2 | **Handle** | Once after first Apple sign-in. Pick `@handle`. Never again while it exists. |
| D3 | **Home** | The app. Full-bleed map + people strip. Live pins vs sealed locks. Home/Away chips. Overdue chip. |
| D4 | **You / Settings** | One scroll: Circle, Night Edition, Set Home, members revoke, delete, legal. No settings tree. |

---

## Sheets on Home (not destinations)

| Sheet | Opens from | Contains |
|---|---|---|
| **Person** | Tap strip / pin | Where (Until they look / Always / For a while **inline**). Home presence toggle. Revoke. |
| **Look confirm** | Tap sealed person → Look | Facts + Look. Dismiss → same Home with live pin. |
| **Invite / Join** | Empty Home | “I trust you with my location.” Create or enter code. |
| **Look log** | Masthead LOG | Who looked, when. No coordinates. |

---

## States (not screens)

- Empty circle → Home empty + Invite sheet chrome
- After Look → Home live pin (no second map as the product)
- Look closed / receipt → quiet banner on Home
- Sign-in failed → notice on Login
- OS permissions → system dialogs

---

## Cut

Place ping as a page · separate TimedShare route · Circle as its own destination · profile wizard · onboarding tips · places list · tab bar · people-list home

---

## Demo circle (See the app)

Offline via `DemoTrustService.startLeanDemo()`:

- **Alex** — partner, sealed, Away
- **Maya** — sealed, Away, **overdue** promise
- **Eli** — Always / live pin, Home

Tap Maya → Look confirm → live on Home. Tap strip → Person sheet.
