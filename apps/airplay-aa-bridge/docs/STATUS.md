# Bench status — October 10, 2026

Hardware bench status: **PASSED for Mac AirPlay → Pi UxPlay → encode/inject →
USB Android Auto → Mac DHU**, with normal TLS verification and visually
confirmed moving Mac content. The earlier Pi test-pattern path also passed.
The clean headless capture also passed. The real car remains unverified;
audio is disabled, and this acceptance covers video.
See [mac-testing.md](mac-testing.md) for the repeatable local hardware test.

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
script/config/certificate rollback is
`/var/backups/airplay-aa-bench-20261010T172906Z.pkeUkV/rollback.sh`.

The installed AAServer now includes bounded FunctionFS startup handling and
compatibility with the current DHU's omitted video `media_type`. Its SHA-256 is
`60a9a1a9ac790a7180eaa46d8ccc690829fdae6d53acf448e3cbb88ae3d5e4db`.
The binary rollback is `/var/backups/airplay-aa-binary-0MKZjbkR/rollback.sh`.

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
**13 software tests passed**, including actual Linux FIFO/SEQPACKET transport
and FFmpeg decoding. USB startup and service-discovery compatibility tests also
passed. These are separate from the actual hardware evidence above.

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
6. **Pending:** verify the actual car. A Mac DHU pass does not establish a car pass.

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
A cold power cycle with the final binary and physical cable unplug/replug have
not been exercised; include those in the parked-car acceptance trial.

Keep the established GPIO power wiring: physical pins 2/4 and GND 6, supplied
at 5 V by the PD trigger from the official 27 W brick. Pi USB-C is data to the
Mac or car. Do not change EEPROM, reboot, or manually unbind the gadget as a
diagnostic step. Read UDC state at `/sys/class/udc/*/state`; prior configfs `UDC`
access hung.

September's recommendation to install the long-lived DHU certificate on the
phone was incorrect and is superseded by the phone-role validation above.
