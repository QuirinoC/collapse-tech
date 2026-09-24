# Trust Circle 1.0 — PENDING (pause snapshot)

Written by agent pause on 16 Sep 2026 (Pacific) at Juan's request: all work paused, pending
changes committed, ship branch merged into `main`. This file is the single index of what's
done vs. outstanding. No new feature work started after this point.

Same content lives at both:
- `apps/trust-ios/PENDING.md` (this worktree, `collapse-tech-trust-demo`, branch
  `quirinoc-ship-pending-wip`)
- `apps/trust-ios/PENDING.md` on `main` (`collapse-tech` worktree) — copied after merge.

---

## Done

**Ship branch (`quirinoc-ship-pending-wip`) — shipped commits:**

| SHA | Summary |
| --- | --- |
| `73f62b8` | Add lean Trust demo path and collapse share sheets onto Home. |
| `e69f123` | Bump Trust iOS to build 5 for device review. |
| `5814e86` | Ship list-first Circle shell with HIG tabs and design mocks. |
| `6a087dc` | Commit duo-gpt6 design mocks as Trust Circle 1.0 design source of truth. |
| `311c554` | Ship Trust Circle 1.0 duo-gpt6 IA with Off/Hidden/Look-View seats and Circle v1 migration. |

**Merged into `main`:**

- Merge commit `a3a7e5f` — `Merge branch 'quirinoc-ship-pending-wip' into main` — brings all
  five commits above onto `main`. Fast-forward was not possible (`main` had independently
  landed the Pixelboard iPhone Duo layout, PR [#61](https://github.com/QuirinoC/collapse-tech/pull/61)); merge was a clean
  3-way merge with **no conflicts** and **no Pixelboard/other-app files touched**.

**Deployed API:** Render `trust-api` (`srv-daabv1lg1s2s73co5gm0`) builds from
`quirinoc-ship-pending-wip`, `apps/trust-api` rootDir, Dockerfile, health check
`/health/ready`. Auto-deploys on push to that branch filtered to `apps/trust-api/**`. Last
known-good production deploy referenced in the handoff docs: `dep-dac6n6qd0e5s73fpqb50`
(`44eb211`); rollback image: `oci.collapsetechnologies.com/trust-api:handle`.

**Migration 006:** `apps/trust-api/Infrastructure/Postgres/Migrations/006_circle_v1.sql` —
Circle v1 schema for the Off/Hidden/Look-View seat model. Additive, in the ship branch and
now on `main`. (Migration `005_presence_grants.sql` — presence grants / Home place / promises
— shipped in an earlier pass and predates this file.)

**M0–M6 agent prep (design + engineering, code/docs only — no ASC/Render clicks):**

- M0–M3: escrow/Look TTL foundation, presence grants, handle onboarding, Keychain session —
  see `TRUST-CLOUD-HANDOFF.md` §4 "Shipped in this pass."
- M3 `Trust-Sandbox` scheme + fail-loud Dev API guard — see `SANDBOX.md` "Files touched by
  this pass."
- M4 Internal TestFlight prep (build 5→6, archive/upload steps, smoke checklist) — see
  `TESTFLIGHT-M4.md`.
- M6 App Store Connect listing/paste content, age rating, privacy labels, review notes,
  screenshots (captured, in repo), IAP rename checklist, submit order — see
  `AppStore/ASC-M6.md`. Screenshots already captured under
  `AppStore/Screenshots/m6/{iphone-69,ipad-13}/`.
- Trust Circle 1.0 duo-gpt6 IA (Rounds 1–7 history): presence triad, Sealed (Look) vs
  Available (View). **Current home IA is Round 8 map + draggable People sheet**
  (`debf974` / build 15 lineage, restored in `ab9395d`) — **not** list-first Circle.
  See `design-mocks/duo-gpt6/DESIGN-NOTES.md` Round 8. Do not ship list-only Circle.

---

## Pending — Juan (App Store Connect / Render / device access the agent doesn't have)

1. **ASC sandbox testers** — create 2 sandbox testers (device A / device B, US storefront);
   never sign into iCloud with them. See `SANDBOX.md` §1.
2. **TestFlight upload, build 6** — archive `Trust` (Release) scheme, upload via Organizer/
   Transporter, attach to Internal Testing group. See `TESTFLIGHT-M4.md` §2–§3.
3. **ASC-M6 listing paste** — App Information, 1.0 version description/keywords,
   screenshots, App Privacy labels, review notes. Full paste content and click order in
   `AppStore/ASC-M6.md` §1–§4 and "Juan's remaining click-path."
4. **Plus display rename** — Subscriptions group `22346972` → **Trust Plus**; monthly →
   **Plus Monthly**; annual → **Plus Annual**. Product IDs (`com.collapsetechnologies.trust.
   circle.monthly` / `.annual`) stay unchanged. See `AppStore/ASC-M6.md` §5.
5. **Submit + review flags** — submit app version **and** subscription group together
   (one review); only *after* submit, flip Render `Trust__SeedReviewCircle=true` and
   `StoreKit__AllowReviewUnlock=true`; flip both back to `false` after the review decision.
   See `AppStore/ASC-M6.md` §7 "Submit order" and TRUST-CLOUD-HANDOFF.md §1.
6. **Confirm `Apns__Enabled` on Render** — verify `Apns__Enabled=true` with KeyId/PrivateKey
   present on the live `trust-api` service (blueprint defaults it `false` — do not re-sync
   the blueprint over live secrets). Without this, Look receipts fail. See
   `TESTFLIGHT-M4.md` §4 item 7 and `TRUST-CLOUD-HANDOFF.md` §2.
7. **L2 device sandbox matrix** — run the full checklist in `SANDBOX.md` §4 (SIWA first run,
   trial buy, renewals, expire/cancel, restore, App Account Token lock, covered partner,
   plan switch, refund, review unlock, two-device Look/View) on physical iPhone + iPad with
   the `Trust-Sandbox` scheme once testers exist (item 1).

---

## Product decision — home IA (closed)

- **Map + draggable People sheet is the only home IA.** Decided for build 15
  (`debf974`); restored for TestFlight 17 (`ab9395d`). Apple MapKit top ~2/3 +
  bottom sheet with the people list. Tab label **People**; product name **Trust**.
- **List-first Circle is obsolete.** Rounds 1–7 duo-gpt6 mocks and any note that
  says “Map is a secondary text link” / “no header map” are historical. Agents
  must not ship list-only Circle as 1.0. Code SoT: `Sources/TrustApp/CircleView.swift`.
- Sealed/Available + Look/View behavior unchanged; Plus still gates multi-person
  Available pins (`homeMapPins`). Round 8 notes:
  `design-mocks/duo-gpt6/DESIGN-NOTES.md`.

---

## Residual / smaller follow-ups

- **iPad Split View field test** — iPad layout has not been field-tested in Split View /
  Slide Over multitasking. `AppStore/ASC-M6.md` screenshots are full-screen iPad only.
- **Inbound share (Sealed vs. Available) — already done.** Round 7 in
  `design-mocks/duo-gpt6/DESIGN-NOTES.md`: Sealed (`Until they look`) → Look → notify →
  snapshot; Available (`Always` / `For a while`) → View, no confirm sheet, every view logged.
  Shipped in `311c554`. Listed here only so it isn't mistaken for outstanding.
- Deferred (non-blocking, from `TRUST-FOLLOWUP-OPTIONS.md` §2): cheaper sealed-mode
  background location battery profile, StoreKit expiry recompute at read-time, calmer
  offline copy (map raw `URLError` text), quiet-receipt "now includes last 24 hours" +
  duplicate-receipt de-dup, full promise/overdue deadline picker polish, person-sheet grant
  bundle polish.
- Two-device APNs Look-receipt smoke on production has not been re-run since the
  `Auth__SigningKey` rotation noted in `TRUST-CLOUD-HANDOFF.md` (clients must re-sign-in).

---

## Pointers

- [`SANDBOX.md`](SANDBOX.md) — M3 sandbox exit gate, L1/L2/L3 testing layers, one-time ASC
  setup, L2 device matrix.
- [`TESTFLIGHT-M4.md`](TESTFLIGHT-M4.md) — M4 Internal TestFlight archive/upload steps and
  ASC/console blockers.
- [`AppStore/ASC-M6.md`](AppStore/ASC-M6.md) — M6 App Store Connect listing paste, age
  rating, privacy labels, review notes, screenshot shot list, IAP rename, submit order, and
  Juan's full remaining click-path.
- [`../../TRUST-CLOUD-HANDOFF.md`](../../TRUST-CLOUD-HANDOFF.md) — cloud-session handoff:
  ASC app/build state as of last update, production API/Render details, legal/marketing
  sites, product scope, "do not" list. **Note:** this file still says "do not merge to
  `main`" and "main lacks trust-ios/trust-api" — both are stale as of this pause; the merge
  described above happened at Juan's explicit request and `main` already had trust-ios/
  trust-api from an earlier merge (`772659a`) before this pause.
- [`../../TRUST-FOLLOWUP-OPTIONS.md`](../../TRUST-FOLLOWUP-OPTIONS.md) — review memo /
  effectively the plan file: ordered improvement options with S/M/L cost and "needed before
  submit" flags, plus open questions for Juan (§4).
- [`design-mocks/duo-gpt6/DESIGN-NOTES.md`](design-mocks/duo-gpt6/DESIGN-NOTES.md) — Trust
  Circle 1.0 design source of truth, Rounds 1–7.
