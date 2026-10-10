# Bench status — October 10, 2026

Video transport bench status: **PASSED for Mac AirPlay → Pi UxPlay → encode/inject →
USB Android Auto → Mac DHU**, with normal TLS verification and visually
confirmed moving Mac content. Those historical runs used the DHU console's
`focus video on`, so they do **not** establish automatic activation. The runner
no longer supplies that override. A fresh hardware pass with automatic focus
is pending. **The actual Mazda test is currently failing at video focus.**
Audio is disabled; the evidence covers video only.
See [mac-testing.md](mac-testing.md) for the repeatable local hardware test.

## Current Mazda session

At approximately 11:46 PDT, the actual head unit identified itself as Visteon
Connectivity Master Unit, `MAZ_CMU-150`, firmware `70.00.367`, year 2017.
The Pi was connected to home Wi-Fi at `10.0.0.113`; AirPlay was advertised.
USB/AOAP, authentication, service discovery and video channel 1 setup succeeded.
The decrypted wire capture contains:

| Direction | Message | Result |
| --- | --- | --- |
| Pi → car | Setup `80 00 08 03`, flags `0x0b` | H.264 setup requested |
| Car → Pi | SetupResponse `80 03 08 02 10 04 18 00` | OK, max_unacked 4, config 0 |
| Pi → car | FocusRequest `80 07 10 01 18 04`, flags `0x0b` | PROJECTED requested |
| Car → Pi | Pings | Session remains responsive |

No focus indication or stream start followed in the captured session. The car
showed greyed Android Auto and later an **Enable Android Auto** prompt. The Pi
holds video until a projected focus grant; no setup fallback is justified
because this car explicitly accepted setup 3. Device enablement and the
first-connection parking-brake condition still need a user observation.
Mazda documents those conditions in its
[Type A Android Auto guide](https://connect.mazda.com/en/smartphone-integration/android-auto/type-a/index.html).

Private evidence is under `.local/car-runtime/20261010-1143/` and
`.local/car-runtime/20261010-1147/`. The latter contains the decrypted packet
capture and a summary excluding personal device identifiers and media URLs.

A temporary compatibility comparison omitted the optional focus reason
(`80 07 10 01`), which is valid in both legacy and current schemas. It also
received accepted setup and no focus grant. The tested reason-4 build was
restored; this experiment did not establish a Mazda remedy. Evidence is at
`.local/car-runtime/20261010-1155/`.

At 11:39 PDT, after an unclean restart, the installed AAServer and pipeline
script were zero bytes. The shutdown cause is unknown: FAT reported an unclean
unmount, but no preceding boot journal survives and the current boot reports
`get_throttled=0x0`. Both files were restored using file fsync, atomic rename
and parent-directory fsync. The latest focus candidate was built on the Pi,
installed the same way, and verified with real AAServer, UxPlay, encoder and
injector processes. Service `active` alone did not establish that health.
The final installer/startup protections were then deployed as 31 verified
script/patch files with a durable backup at
`/var/backups/airplay-aa-car-durable-bz3bnf8y/`; its `rollback.py` preserves the
current valid phone identity and restores the validated focus binary.

## Observed on the actual Pi and Mac

- Pi Wi-Fi SSH is reachable at `quirino@10.0.0.113`.
- The Mac sees AAServer / TAGAAS. USB and AOAP accessory mode passed:
  `12d1:107e` → `18d1:2d00`.
- DHU negotiated Android Auto protocol 1.5 and TLS 1.2, reporting
  `Verify returned: ok`. Certificate verification was not bypassed.
- Two actual headless DHU screenshots decoded at **800×480**, **5.18 seconds** apart.
  Visual inspection confirmed the mirrored Mac test clip, whose clock advanced
  from **16.133 to 21.367 seconds**. Motion passed with mean absolute RGB
  difference **10.2043** and **12.17%** changed pixels, above the required 0.75
  and 1% thresholds.
- The Pi selected `AIRPLAY_AA_SOURCE=airplay`; **16 newly appended H.264 receive
  records** had advancing receive and packet timestamps during this run.
- Every required `--expect-airplay` stage passed: USB, AOAP, protocol, TLS,
  video, render, motion, AirPlay receive freshness, and Pi evidence collection.
  The runner requested a clean DHU quit; there was no unexpected process exit.

Clean full-loop evidence: `.local/bench/20261010-110729/summary.json`, `dhu.log`,
`frame-1-735395b1.png`, `frame-2-735395b1.png`, and the Pi snapshots from that
run. The session ran October 10, 2026, **18:07:29.617–18:07:43.424 UTC**
(11:07:29–11:07:43 PDT), with native DHU `--headless`. Both captures show the
full moving Mac clip without recursive DHU display feedback. Sustained
operation and the actual car are still unverified.

The first moving AirPlay pass is also recorded at
`.local/bench/20261010-110453/` (**18:04:53–18:05:09 UTC**). It contained the
same Mac test clip plus recursive feedback from the visible DHU window; the
headless pass above provides clean confirmation.

The earlier Pi moving-SMPTE source passed independently at **17:42 UTC**:
`.local/bench/20261010-104205/`. Both 800×480 frames contained SMPTE bars;
motion measured **0.9999** mean absolute RGB difference and **4.43%** changed
pixels. This separately established the Pi encoder-to-head-unit path.

## Installed corrections and current mode

A current signed phone identity and matching key have been validated locally
and on the Pi. Its certificate verifies against the independently extracted DHU
Google Automotive Link root, and expires **December 9, 2026, 18:39:03 UTC**.
See [certificate provenance and installation](../certs/README.md).
The pair and Python/pipeline fixes were installed on the Pi at 17:29 UTC. The
old script/config/certificate backup is
`/var/backups/airplay-aa-bench-20261010T172906Z.pkeUkV/`; it predates the correct
phone identity and must not restore the rejected certificate into service.

The installed AAServer includes bounded FunctionFS startup, compatibility with
the DHU's omitted video `media_type`, strict setup-response parsing and phone
focus negotiation. Its SHA-256 is
`8dad2825e924fd6765fdc8536f66ea5b0b9e568082b206da34e3f75cb6561c70`.
The previous video-transport binary is backed up at
`/var/backups/airplay-aa-binary-0MKZjbkR/`; it lacks the new focus behavior.

Earlier runs recorded a rejected head-unit identity (`20261010-101612`),
startup `ESHUTDOWN` (`20261010-102910` and `20261010-102933`), then successful
authentication with failed service discovery (`20261010-103155`). Those failures
are superseded by the authenticated moving-video pass above.

Earlier AirPlay runs captured the Mac's static privacy shield
(`20261010-105317`) or had no fresh mirrored H.264 input (`20261010-105730`).
The runner rejected those attempts for missing nonblank/moving video or fresh
input. The later moving-clip and headless runs meet those checks.

The source preserves the deployed HLS/shared-memory pipeline, adds a moving
SMPTE bench source, repairs H.264 access-unit framing and idle recovery, and
includes a DHU runner that requires decoded nonblank moving frames.
**39 video/bench/pacing/installation software tests passed**, including actual Linux
FIFO/SEQPACKET transport and FFmpeg decoding. A compiled harness using the
production focus handler passed strict compilation, ASan/UBSan and independent
review. It verifies accepted/rejected setup, focus-before-start ordering,
native-focus pause, duplicates and concurrent media. USB startup and discovery
compatibility tests also passed. These are separate from hardware evidence.

HLS playback now uses `shmsink sync=true`, pacing file/network-decoded frames to
their timestamps. Mirroring retains `sync=false` because it is already a live
input. The previous HLS path produced roughly 150–190 access units per second
on the car instead of 30. The production sink-bin pacing regression passed;
live car playback at the new rate still awaits focus and a fresh cast.

The Pi was restored to `AIRPLAY_AA_SOURCE=airplay` at approximately **10:42:50
PDT**. UxPlay's **Pi AirPlay AA** advertisement was confirmed through Bonjour.
The moving full-loop run above subsequently confirmed that mirrored Mac video
reached the DHU over USB.

## Acceptance plan

1. **Completed:** deploy the USB startup and service-discovery corrections,
   with a binary rollback.
2. **Completed:** real Pi → USB → DHU pass with `--expect-smpte`, including
   authentication, nonblank SMPTE bars, and changing decoded frames.
3. **Completed:** cast moving Mac test content to **Pi AirPlay AA**, pass
   `--expect-airplay --pi-host quirino@10.0.0.113`, and visually confirm that the
   clip returns through USB.
4. **Completed:** leave the bridge in AirPlay mode and record both hardware
   passes, installed corrections, rollback, and remaining car verification.
5. **Completed:** repeat with native headless DHU and visually confirm the full
   moving Mac clip without recursive display feedback.
6. **Completed:** identify the Mac acceptance gap and remove its console focus
   override; implement and test phone-driven focus and paced HLS playback.
7. **Pending:** repeat the hardware Mac loop with automatic focus.
8. **In progress:** resolve Mazda activation, then confirm decoded moving video,
   live HLS pacing, reconnect and boot behavior in the parked car.

The complete local loop is Mac AirPlay → Pi UxPlay → H.264 encoder/FIFO/injector
→ USB Android Auto → Mac DHU. AirPlay is the input transport; the car-facing
transport in this project is Android Auto.

## Wiring and recovery constraints

The final boot audit found the bridge enabled in systemd, persistent dwc2
peripheral configuration and module loading, and the competing USB gadget
service masked. The bridge recreates its runtime directories/FIFO; the injector
regenerates a missing idle video. No required startup installation is missing.
The software binds its initial gadget and waits for the host, so powering before
connecting USB is not a protocol requirement. Either order is intended to work.
The earlier deployed service did start after the move to the car and a power
cycle. Startup persistence is established for that version, but automatic
activation failed. Cold boot/reconnect acceptance with the new focus build
remains pending. Managed file updates now use durable atomic replacement;
this preserves each old or new file across an interrupted write, not a
transaction across an entire deployment.

Keep the established GPIO power wiring: physical pins 2/4 and GND 6, supplied
at 5 V by the PD trigger from the official 27 W brick. Pi USB-C is data to the
Mac or car. Do not change EEPROM, reboot, or manually unbind the gadget as a
diagnostic step. Read UDC state at `/sys/class/udc/*/state`; prior configfs `UDC`
access hung.

September's recommendation to install the long-lived DHU certificate on the
phone was incorrect and is superseded by the phone-role validation above.
