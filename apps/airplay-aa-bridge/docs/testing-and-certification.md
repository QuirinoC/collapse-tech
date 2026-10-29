# Phone-side testing and certification

Research checked October 10, 2026. No publicly documented downloadable Google
conformance suite was found for an independent Linux implementation of the
Android Auto phone stack. That does not establish whether a private partner
program would accept this project.

Google's [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu)
is a public head-unit emulator with USB accessory transport and scripting.
Google documents it for Android Auto app development. We can exercise our Pi
against it, but a DHU pass is not phone-stack certification.

[Ubikon's certification service](https://ubikon.com/products-and-services/android-auto-certification/)
describes a Google-approved laboratory for infotainment-unit manufacturers and
suppliers. [CIeNET's program](https://cienet.com/news-insights/cienet-android-auto-projection-3pl-certification.html)
also describes vehicle/OEM/Tier-1 certification. Neither documents eligibility
or a downloadable conformance suite for this Debian/AACS phone implementation.

[Android CTS](https://source.android.com/docs/compatibility/cts) tests Android OS
compatibility. This Pi runs Debian, so CTS does not certify its projection
implementation. The public [AOA protocol](https://source.android.com/docs/core/interaction/accessories/aoa)
describes the USB accessory layer; it does not specify the entire Android Auto
session. A TLS identity certificate is also separate from product certification.

## Repeatable hardware matrix

Run from `apps/airplay-aa-bridge`, with the installed Mac DHU, the Pi attached by
real USB, reachable SSH, and an already selected moving test-pattern source:

```bash
./scripts/test-dhu-matrix.sh --pi-host quirino@10.0.0.113
```

The committed profiles cover touchscreen, rotary, and rotary-plus-touchpad
startup at the bridge's current 800x480/30 video mode. The default requires at
least 60 seconds of sampled moving video in each profile, with a 90-second
session maximum. It requires actual input binding, automatic projection focus,
TLS verification and clean DHU shutdown. It never grants console video focus,
bypasses TLS, changes the Pi's source, or restarts the Pi.

For a mirrored source, start moving content through Screen Mirroring to the Pi
and use `--source airplay`. This additionally requires fresh Pi H.264 receive
evidence. A static desktop intentionally fails the motion check.

Each run creates a new private folder under `.local/matrix/` with per-profile
logs, captures and JSON evidence. `PASSED` requires all requested profiles;
unavailable prerequisites are `BLOCKED`, and subsequent cases are `NOT_RUN`.
A launched session that fails its checks is `FAILED`. Timeout cleanup first
lets the bench close its DHU, then terminates remaining verified descendants.

For one profile through the existing runner:

```bash
./scripts/test-e2e.sh --headless --expect-auto-start --expect-smpte \
  --pi-host quirino@10.0.0.113 --min-video-seconds 60 --duration 90
```

`--duration` is a maximum, not a minimum. Without `--min-video-seconds`, the
original smoke test still exits after initial moving frames. A historical
13-second smoke pass cannot satisfy the new sustained requirement.

The observation starts at the first authenticated decoded nonblank frame.
Later requested captures must decode within two seconds and every consecutive
pair must show motion. The matrix uses five-second capture spacing, bounds gaps
and final capture age, and checks that timestamps and comparison counts support
the claimed duration. This samples output; it does not prove every video frame
arrived or that brief interruptions between screenshots never occurred.

## Coverage still required

The matrix does not certify Mazda compatibility, Bluetooth bonding/HFP, audio,
actual touch/key delivery, sensor handling, negotiated USB speed, power stability, cold boot,
physical cable reconnect, higher resolutions or complete transport conformance.
The current report lists those omissions explicitly.

The earlier channel-open status and video acknowledgement gaps have been fixed:
the production handlers validate open status and enforce the negotiated
outstanding-video limit, with focused regressions. Further transport and
backpressure conformance, delivery of actual touch/rotary actions, real Bluetooth
pairing and Mazda acceptance remain unverified. The TLS peer regression covers
shared-object serialization and failed-output handling; DHU passes are evidence
of interoperability with that simulator, not complete contract certification.

## Actual October 10 matrices

The installed TLS-serialization build `9c35f5bc…` passed the real matrix at
**17:37:06–17:41:01 PDT** using the moving SMPTE source:

| Profile | Sampled moving-video interval | Captures / moving pairs | Result |
| --- | --- | --- | --- |
| Touch | 65.202 s | 14 / 13 | PASSED |
| Rotary | 60.336 s | 13 / 12 | PASSED |
| Hybrid | 60.411 s | 13 / 12 | PASSED |

Evidence is `.local/matrix/20261010-173706-26dc6bc5/`. Every profile demonstrated
DHU TLS verification, fresh input binding and automatic projection without
console focus or certificate bypass, and had no session errors. Deployed
binary/source identity is recorded separately. The shared-TLS/memory-BIO repair
also has real production peer regressions for serialization and failed-output
queue preservation. These passes do not establish the cause of the earlier
intermittent framing error, complete transport conformance or certification.

The accompanying Mac-only USB-C power window recorded active `0x50005` in
**40/120** samples, EXT5V **4.67258–4.89636 V**, and one fresh kernel warning
with stable boot ID. Reliable power remains unresolved. The exact original
AirPlay config was restored at 17:41 PDT and exact config/hash/process state
was verified at 17:43:41 PDT.

The full Mac AirPlay → Pi → USB/DHU loop **PASSED** at
**17:51:39–17:52:49 PDT**, with **60.786 seconds** of sampled moving video,
**13 captures / 12 moving pairs** and **16 fresh mirrored H.264 receive records**.
Actual source pixels were visually confirmed. All required stages passed with
normal DHU TLS verification, fresh automatic input binding and phone-requested
projection, no session errors and clean shutdown. Evidence is
`.local/bench/20261010-175139/`. Two prior full-source attempts remain failures:
`174446` had no incoming mirrored H.264/black captures; `175003` failed sustained
motion because initial samples were a static shared desktop. The successful
retry started with the moving clip already foregrounded.

The 17:53:09 PDT check verified exact original `airplay` config, runtime hashes
and enabled/active real processes on the same boot. No car, power, audio, cold
boot, physical reconnect or certification acceptance is inferred from these
session passes. See [STATUS.md](STATUS.md).

### Historical failed matrix and passing repeat

The first invocation at 16:59 PDT was `BLOCKED` before DHU launched because USB
and SSH were unavailable. The subsequent real matrix at **17:18:10–17:21:52
PDT** exercised all three profiles using AAServer `d195d479…`, real USB and the
moving SMPTE source:

| Profile | Sampled moving-video interval | Captures / moving pairs | Result |
| --- | --- | --- | --- |
| Touch | 60.127 s | 13 / 12 | PASSED |
| Rotary | 60.399 s | 13 / 12 | PASSED |
| Hybrid | 60.638 s | 13 / 12 | FAILED: fatal framing -251 / out of sync |

All profiles demonstrated authenticated USB, successful input binding and
automatic projection. The fatal hybrid error invalidated its video/sustained
acceptance even though each sampled pair moved; the overall matrix is
**FAILED**. Evidence is `.local/matrix/20261010-171810-954dbd2b/`. Its original
DHU log has no read timestamps, so before/after-quit timing is unknown.

The unchanged build's timestamped hybrid repeat at **17:27:58–17:29:17 PDT**
**PASSED** with **60.653 seconds**, **13 captures / 12 moving pairs**, no errors
and a clean shutdown. Evidence is `.local/bench/20261010-172758/`. This shows
intermittent behavior; the original failed matrix remains failed. The new
`dhu-events.jsonl` records host read/command observations and fatal matches
relative to quit, without suppressing post-quit failures or treating buffered
read times as device emission times.

The simultaneous Mac-only USB-C power window caught active `0x50005` in
**41/120** samples, EXT5V **4.6833–4.91244 V** and three fresh kernel warnings
with a stable boot ID. These measurements do not prove that power caused the
framing error. Mazda has never passed; neither the individual DHU passes nor
the matrix provide certification. See [STATUS.md](STATUS.md) for power evidence
and the restoration of the temporary pattern source.
