# Bench status — October 10, 2026

**Automatic Mac AirPlay → Pi UxPlay → encode/inject → USB Android Auto → Mac
DHU: PASSED.** The installed build completed fresh input binding, requested
projected video focus, received the head unit's grant and started moving decoded
video. The strict hardware runs used normal TLS verification and no DHU console
focus override. **The new build has not yet been tested against the Mazda.**
Its earlier build authenticated and accepted video setup but received no focus
grant; car activation remains unresolved. Audio is disabled; these passes cover
video only. See [mac-testing.md](mac-testing.md) for the repeatable hardware test.
**Repeated Pi undervoltage is a current power blocker for car readiness.**

## Current automatic hardware evidence

The moving-SMPTE test at **12:23:49–12:24:03 PDT** passed
`--expect-auto-start --expect-smpte`. Private evidence is in
`.local/bench/20261010-122349/`.

Two native headless full-loop runs passed
`--headless --expect-auto-start --expect-airplay`:

| Run, PDT | Decoded motion | Visual source confirmation |
| --- | --- | --- |
| 12:27:51–12:28:07 | 800×480; frames 5.03 s apart; mean absolute RGB difference 5.492; 5.74% changed pixels | QuickTime clip clock 6.8 → 16.9 s, with desktop surroundings |
| 12:30:37–12:30:52 | 800×480; frames 5.01 s apart; mean absolute RGB difference 21.3029; 22.66% changed pixels | Fullscreen QuickTime clip clock 15.433 → 17.933 s, with macOS disk-notice overlays |

Both runs collected **16 fresh mirrored H.264 receive records** with advancing
timestamps while the Pi selected `AIRPLAY_AA_SOURCE=airplay`. Each proved real
input channel 3 open and binding status **0**, followed by video channel 2 setup
status **2**, a Pi **PROJECTED** request, a head-unit projected grant (mode **1**)
and StartIndication on that same video channel. Input binding preceded video
channel opening. DHU negotiated protocol 1.5 and reported `Verify returned: ok`;
no TLS bypass or console `focus video on` was used. DHU quit cleanly.

Evidence is in `.local/bench/20261010-122751/` and
`.local/bench/20261010-123037/`: `summary.json`, DHU logs, bounded Pi startup
evidence and actual decoded frames. These are valid automatic full-loop passes.
Their desktop and notification overlays limit presentation; they do not establish
unobscured fullscreen playback. Sustained operation and car compatibility remain
unverified. The Mac test ended with QuickTime paused and AirPlay disconnected.
The two fresh DHU sessions establish repeated session startup; physical USB
cable reconnect and cold boot of this build have not been tested.

The earlier clean fullscreen run at `.local/bench/20261010-110729/` proved moving
Mac content through the same AirPlay/USB path, but supplied a DHU console focus
override. It is historical transport evidence, not automatic-start acceptance.

## Installed build and validation

The installed AAServer at `/opt/airplay-aa/libexec/aaserver/AAServer` has SHA-256:

```text
dba09b6d0826b12a6e325304cd7ea55a4217118d67c1fea48914ca7358e623a1
```

It is 4,921,584 bytes with mode 755. The service is enabled and active, relaunches
AAServer after DHU exits, and is left in `AIRPLAY_AA_SOURCE=airplay`. No captures
are active. The durable deployment backup includes
`/var/backups/airplay-aa-input-l397h7e6/rollback.py`.

The build includes bounded FunctionFS startup, compatibility with omitted video
`media_type`, strict setup-response parsing, phone-requested focus and automatic
input registration. Previously the injector opened only video, so AACS never
opened or bound controls automatically. The Mazda advertises 15 numeric keycodes;
the revised handler preserves all 15, including three discarded by the legacy
enum. It requires actual successful channel-open and binding responses. Each
C++ input handshake phase has a two-second deadline; the receive thread remains
available for other channels. The Python wait drains the FIFO and input events,
and proceeds with video when input is absent or rejected. The strict acceptance
mode additionally requires successful binding before video opens.

**66 Python tests passed**, including real Linux FIFO/sequence-packet transport,
FFmpeg video decoding, input deadlines/rejection/disconnect, durable installation
and 18 new strict hardware-evidence fixtures. The compiled production C++ input,
video, USB startup and discovery harnesses passed strict compilation; focused
ASan/UBSan checks and independent review also passed. Container annotations were
disabled only for Homebrew's prebuilt protobuf in the sanitizer run; address and
undefined-behavior checks remained enabled. These checks are separate from the
actual hardware passes above.

The current signed phone identity and matching key verify against the
independently extracted DHU Google Automotive Link root. The certificate expires
**December 9, 2026, 18:39:03 UTC**; renewal is required before then. See
[certificate provenance and installation](../certs/README.md). The old backup
`/var/backups/airplay-aa-bench-20261010T172906Z.pkeUkV/` predates this identity and
must not restore the rejected head-unit certificate into service.

H.264 framing and idle/live recovery fixes are installed. HLS playback uses
`shmsink sync=true` to pace decoded frames to their timestamps; mirroring retains
`sync=false` for its live input. The earlier HLS path produced roughly 150–190
access units per second instead of 30. The production pacing regression passed,
but actual car playback at the corrected rate still needs a focus grant and a
fresh cast.

## Last Mazda evidence, before the input build

At approximately 11:46 PDT, the actual head unit identified itself as Visteon
Connectivity Master Unit, `MAZ_CMU-150`, firmware `70.00.367`, year 2017.
The Pi joined home Wi-Fi at `10.0.0.113` and advertised AirPlay. USB/AOAP,
authentication, service discovery and video channel 1 setup succeeded:

| Direction | Message | Result |
| --- | --- | --- |
| Pi → car | Setup `80 00 08 03`, flags `0x0b` | H.264 setup requested |
| Car → Pi | SetupResponse `80 03 08 02 10 04 18 00` | OK, max_unacked 4, config 0 |
| Pi → car | FocusRequest `80 07 10 01 18 04`, flags `0x0b` | PROJECTED requested |
| Car → Pi | Pings | Session remained responsive |

No focus indication or stream start followed. The car showed greyed Android
Auto and an **Enable Android Auto** prompt. Media correctly waited for projected
focus. A setup fallback was not justified because the car explicitly accepted
setup 3. A temporary comparison omitted the optional focus reason
(`80 07 10 01`); it also received accepted setup without a focus grant. Reason 4
was restored. Neither comparison established a Mazda remedy.

Private evidence is in `.local/car-runtime/20261010-1143/`,
`20261010-1147/` and `20261010-1155/`. The packet summary excludes personal device
identifiers and media URLs. No verified generic phone-side consent-accept
message is known. Prepared sensor and Bluetooth diagnostic helpers have not sent
requests to the car. Device enablement and the first-connection parking-brake
condition still need observation; Mazda documents them in its
[Type A Android Auto guide](https://connect.mazda.com/en/smartphone-integration/android-auto/type-a/index.html).
The new input build's Mac pass does not prove it resolves this car failure.

## Current power blocker

The boot beginning around **12:13 PDT** recorded repeated kernel
`Undervoltage detected` / `Voltage normalised` warnings from **12:19 through
12:33**. Read-only checks alternated between historical `get_throttled=0x50000`
and active undervoltage/throttling `0x50005`. Active flags were still observed
around 12:33 after QuickTime was paused and Mac AirPlay disconnected; temperature
was about 45 °C and load 0.23. The cause has not been established and no wiring
changes were made.

Eight subsequent samples at **12:33:36–12:33:50 PDT** measured EXT5V around
**4.78–4.89 V** and reported only historical `0x50000` during that short window.
That does not negate the preceding active flags and kernel warnings. This query
found no mmc/ext4 errors. Private evidence is in
`.local/power-check-20261010/{kernel,samples}.log`. Both strict AirPlay loops
passed despite the warnings; power stability still needs resolution before car
readiness.

## Startup persistence and recovery

At 11:39 PDT, after an unclean restart, the installed AAServer and pipeline script
were zero bytes. The shutdown cause is unknown: FAT reported an unclean unmount,
no preceding boot journal survived and that boot reported `get_throttled=0x0`.
Both files were restored with file fsync, atomic rename and parent-directory
fsync. The installed durability protections have a backup at
`/var/backups/airplay-aa-car-durable-bz3bnf8y/`. Service `active` alone is not
evidence that the actual bridge processes are healthy.

The Pi restarted at approximately **12:02 PDT** and recovered the earlier focus
binary and pipeline intact, with real bridge processes running. This confirms
that repair survived that restart. **The newly installed input build has not
been rebooted.** Its cold-boot and reconnect acceptance remain pending.

The boot audit found the bridge enabled in systemd, persistent dwc2 peripheral
configuration and module loading, and the competing gadget service masked. The
bridge recreates runtime directories/FIFO and missing idle video. It binds the
initial gadget and waits for the host, so either power/cable order is intended to
work. The earlier version started after the move and power cycle in the car,
although automatic activation failed. Durable atomic replacement preserves each
old or new file across an interrupted write; it is not a transaction across an
entire deployment.

Keep the established GPIO power wiring: physical pins **2/4** and **GND 6**,
supplied at **5 V** by the PD trigger from the official **27 W** brick. Pi USB-C
is data to the Mac or car. Do not change EEPROM, reboot or manually unbind the
gadget as a diagnostic step. Read UDC state at `/sys/class/udc/*/state`; prior
configfs `UDC` access hung.

## Remaining acceptance

1. Resolve the observed undervoltage and verify stable power.
2. Test the installed input build in the parked Mazda, recording real input
   binding, setup, focus grant and moving video. Resolve the enablement/focus
   failure from actual responses rather than inventing consent or motion state.
3. Verify sustained playback, corrected HLS pacing, USB reconnect and cold boot
   on the installed build.

AirPlay supplies the input video; Android Auto carries the car-facing video.
