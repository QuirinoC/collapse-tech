# Local end-to-end testing on the Mac

Use the Mac as the Android Auto head unit. The Pi remains the phone-side USB
accessory. Google Desktop Head Unit (DHU) is already installed in `.local/dhu`
and runs under Rosetta on this Mac. Direct USB AOA mode does not need an Android
phone, ADB tunnel, VM, or OpenAuto installation.

Official reference: [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu).

## Wiring

Connect the Pi's USB-C port to the Mac with a cable that carries power and data.
The user confirmed the current Mac bench has no splitter or separate supply:
USB-C supplies all power and data, and removing it powers the Pi off. An earlier
car trial used a power splitter whose model and supply were unverified.
Shut the Pi down before changing any connection that supplies power. Reliable
power from the actual connected supply remains part of the
hardware acceptance; the saved undervoltage warnings remain unresolved.

Pi and Mac/iPhone must also share a network when testing AirPlay. Network access
is useful for Pi logs, but the actual Android Auto video travels over USB.

## First prove the car-facing video path

Use moving SMPTE bars to test:

```
Pi test source → x264 → FIFO → injector → AAServer → USB/AOAP/TLS → Mac DHU decoder
```

Install the current `bridge/` and `scripts/run-airplay-pipeline.sh` files on the Pi
before using the new source mode. In `/etc/airplay-aa/bridge.env`, set:

```bash
AIRPLAY_AA_SOURCE=test-pattern
```

Apply the source setting with a service restart when the Pi is reachable:

```bash
sudo systemctl restart airplay-aa-bridge
```

No reboot, EEPROM change, or manual gadget unbind is needed for source selection.
A service restart runs the existing gadget initialization; do not use it as an
unbounded remedy for a missing USB device. Diagnose the missing device first.

From this directory on the Mac, run:

```bash
./scripts/test-e2e.sh --headless --expect-auto-start --expect-smpte --pi-host quirino@10.0.0.113
```

`--expect-auto-start` requires `--pi-host`. It collects read-only Pi evidence
and does not deploy files or restart the Pi. Use the actual reachable address.
Without automatic-start checks, `--pi-host` is optional for a pattern transport
test; that narrower test cannot establish automatic activation.

The runner writes a timestamped folder under `.local/bench/`, containing the DHU
log, `dhu-events.jsonl`, USB inventory, optional Pi snapshots, decoded screenshots,
and `summary.json`. The sidecar preserves output read chunks and console commands
with host monotonic observation times and raw-log byte offsets. Summary
`error_events` record existing fatal-pattern matches relative to console quit.
These are read observations, not DHU emission times; PTY buffering means a
post-quit read cannot prove a harmless shutdown error. Fatal errors remain failures.
It fails early when no Pi USB gadget is visible. The strict pass requires
USB/AOAP, TLS/video-session evidence, real successful input binding before video
opens, phone-requested projected focus and two nonblank decoded screens that
change. Merely seeing `12d1:107e`, a Unix socket, or a black DHU window is
insufficient.

Automatic-start evidence uses bounded before/after log offsets and inode checks.
It requires one fresh authentication session, actual input open/binding status
0, and video setup acceptance → Pi PROJECTED request → head-unit projected grant
(mode 1 or 4) → StartIndication on one video channel. An `unrequested=1` grant
is valid after the Pi request. Missing, rotated or truncated logs, rejected
responses and ambiguous multiple sessions fail this proof; rerun with fresh
evidence rather than accepting old markers. A console focus override also
invalidates automatic-start acceptance.

The command above runs the original short smoke check. `--duration` is a
maximum; it does not require sustained playback. Add `--min-video-seconds 60
--duration 90` for a minimum sampled video observation, or use
`./scripts/test-dhu-matrix.sh --pi-host quirino@10.0.0.113` for all three
committed profiles with the test pattern already selected. Use `--source airplay`
for an already active moving mirror. See
[coverage and certification research](testing-and-certification.md).

The runner removes inherited certificate-bypass injection before launching DHU.
This exercises the head unit's actual TLS validation. Upstream AAServer's peer
certificate policy is permissive, so do not describe this as mutual validation.

## Then prove AirPlay too

Set the Pi config back to:

```bash
AIRPLAY_AA_SOURCE=airplay
```

Restart the service. Generate the moving clip if it does not already exist:

```bash
./scripts/make-mac-test-clip.sh
```

Open `.local/mac-airplay-loop.mp4` in QuickTime, enable **View → Loop**, and
play it locally. In the **macOS menu bar**, select **Screen Mirroring → Pi
AirPlay AA**. If macOS asks what to show, choose **Window or App** and select
the QuickTime window. For an extended display, move the playing QuickTime
window onto that display. The receiver must show the moving clip before testing.

QuickTime's video-player AirPlay button selects direct movie playback, a mode
[UxPlay does not generally support](https://github.com/FDH2/UxPlay#highlights).
In the October 10 test it left the player progress at zero and sent no mirrored
H.264 packets. Use macOS screen/window mirroring. On iPhone, use **Control Center
→ Screen Mirroring → Pi AirPlay AA** and then play content that supports mirroring.

```bash
./scripts/test-e2e.sh --headless --expect-auto-start --expect-airplay --pi-host quirino@10.0.0.113
```

This requires the explicit `AIRPLAY_AA_SOURCE=airplay` config line, fresh
mirrored H.264 receive records appended during the current run, successful USB
authentication, and changing nonblank decoded DHU frames. Visually compare the
saved frames with the playing source. Motion checks do not identify the content;
a desktop or macOS's **Choose to Mirror or Extend Display** screen is insufficient
evidence of the playing clip. The pattern test proves the
encoder-to-head-unit path; this second test additionally exercises UxPlay and
the AirPlay transport.

For an interactive emulator window and console:

```bash
./scripts/run-mac-dhu.sh
```

The acceptance runner relies on the phone's focus request and does not issue
`focus video on`. Strict automatic-start hardware passes are recorded below.
Earlier October 10 transport runs supplied that console command and did not
establish automatic activation. Use console focus commands only for diagnosis.

For a screenshot in an interactive diagnostic session:

```text
screenshot /absolute/path/headunit.png
```

## Locate the failed stage

- **USB:** `ioreg -p IOUSB -l -w0` should show AAServer / TAGAAS, normally
  `12d1:107e`, or Google accessory `18d1:2d00` after switching.
- **AOAP:** DHU discovers the accessory; the current vendor-only build logs
  `Initial AOA request 53 completed; switch to accessory mode`. The historical
  mass-storage build logged `Got 53, exit`.
- **Protocol/TLS:** DHU reports the phone protocol; Pi logs `version negotiation ok`
  and `auth complete`. Treat certificate errors as failures.
- **Service discovery:** Pi logs `got service discovery response`; injector resolves
  `video channel id=N`, with N neither 0 nor 255.
- **Input setup:** injector logs `automatically binding input channel` followed
  by `input binding accepted`; AAServer logs actual channel-open and binding
  status 0. Missing, rejected or timed-out replies must not count as success.
- **Setup/focus:** Pi logs accepted setup, PROJECTED focus request, a projected
  focus indication (mode 1 or 4), then StartIndication. Rejected/missing setup
  and native focus must hold media. A console focus override is not acceptance.
- **Video:** DHU screenshots actually decode nonblank moving content.
- **Power:** inspect kernel undervoltage warnings and `vcgencmd get_throttled`.
  The October 10 strict passes succeeded despite repeated undervoltage, which
  still needs resolution before car readiness; see [STATUS.md](STATUS.md).

Pi logs are `/var/log/airplay-aa/{aaserver,uxplay,inject,test-pattern}.log`.
Check UDC state only at `/sys/class/udc/*/state`. Earlier remote reads/writes of
configfs gadget `UDC` hung; avoid those paths during diagnosis.

## Software integration without the Pi

```bash
./scripts/test-video-local.sh
```

This runs the real FIFO/injector and Linux sequence-packet transport, captures AA
media payloads, and decodes them with FFmpeg. It detects video framing and recovery
regressions. It does not exercise UxPlay, AAServer, USB, AOAP or TLS and cannot
substitute for the DHU hardware test.

```bash
./scripts/test-aacs-local.sh
```

This compiles the production C++ USB-startup, AOA control/event-loop, discovery,
input and video-handler
harnesses with strict warnings. It requires Boost headers, a C++20-capable compiler,
`protoc` and protobuf available through `pkg-config`. The descriptor test uses
C++20, USB/control helpers remain C++14-tested, and newer protobuf may require
C++17 for generated-code tests. These software checks do not establish
hardware focus, car compatibility or reboot behavior.

```bash
./scripts/test-tls-local.sh
```

This compiles pinned AACS and the production transport in disposable Debian 13,
then exercises a real memory-BIO TLS peer, shared-object serialization and
failed-output queue preservation. The build context contains only selected
patches and test files. Self-signed credentials are temporary and test-only;
this never contacts the Pi or USB, and does not prove DHU certificate trust.

## Current evidence

The installed TLS-serialization build `9c35f5bc…` passed the complete real
matrix at **17:37:06–17:41:01 PDT**, using a temporary moving SMPTE source:

| Profile | Sampled motion | Captures / moving pairs | Acceptance |
| --- | --- | --- | --- |
| Touch | 65.202 s | 14 / 13 | PASSED |
| Rotary | 60.336 s | 13 / 12 | PASSED |
| Hybrid | 60.411 s | 13 / 12 | PASSED |

Evidence is `.local/matrix/20261010-173706-26dc6bc5/`. Each profile had fresh
input binding and automatic phone-requested projection, actual DHU TLS
verification, moving decoded 800×480 frames and no session errors. No focus or
TLS bypass was used. The binary/source association is recorded in the separate
deployment evidence. The repair serializes shared TLS/memory-BIO access and
preserves queued data after failed encryption; it does not establish the cause
of the earlier intermittent framing error.

The original AirPlay config was restored and the service restarted at **17:41
PDT**. The **17:43:41 PDT** check verified exact original config bytes/mode,
installed binary and overlay hashes, and enabled/active AAServer/UxPlay processes.
The full Mac AirPlay → Pi → USB/DHU video loop then **PASSED** at
**17:51:39–17:52:49 PDT**, with **60.786 seconds** of sampled moving 800×480
video, **13 captures / 12 moving pairs**, and **16 fresh mirrored H.264 records**
with advancing timestamps. Normal DHU TLS verification, input channel 3 binding
status 0 and automatic phone-requested focus/start on video channel 2 passed;
no bypass, console focus override, session errors, early exit or forced
termination occurred. Evidence is `.local/bench/20261010-175139/`. Visual
inspection confirmed the actual fullscreen Mac clip, including frame 5's clock
**30.133 seconds**; logs alone do not identify pixels.

The two earlier full-source attempts remain failed evidence:
`.local/bench/20261010-174446/` had no fresh incoming H.264 and 16 black captures;
`.local/bench/20261010-175003/` passed live AirPlay/render/motion but failed
sustained acceptance because its early samples were a static shared desktop.
The later passing run started with the playing clip already foregrounded.

The **17:53:09 PDT** check again verified original config bytes/mode, `airplay`
source, installed hashes and enabled/active actual processes on the same boot.
During **17:37:45–17:41:45 PDT**, **40/120** samples showed active `0x50005`,
EXT5V was **4.67258–4.89636 V**, and one fresh kernel undervoltage warning
occurred. The later historical-only flag sample does not establish reliable
power. These video passes do not establish Mazda acceptance, audio, cold boot,
physical reconnect or certification. See [STATUS.md](STATUS.md) for evidence
and rollback.

### Historical USB build and intermittent failure

The earlier USB build (`d195d479…`) passed an actual strict headless
moving-pattern test at **15:55:57–15:56:11 PDT** on October 10, 2026. Evidence is
`.local/bench/20261010-155557/summary.json`: real accessory switching, DHU
certificate verification, automatic input binding and Pi-requested projected
focus followed by two decoded 800×480 SMPTE frames, 5.10 seconds apart. Their
mean absolute RGB difference was **0.9485** and **4.27%** of pixels changed.
Both frames were visually inspected. This smoke run did not establish a full
AirPlay source pass on that binary.

The actual matrix at **17:18:10–17:21:52 PDT** used this same `d195d479…`
binary with temporary `AIRPLAY_AA_SOURCE=test-pattern`:

| Profile | Sampled motion | Captures / moving pairs | Acceptance |
| --- | --- | --- | --- |
| Touch | 60.127 s | 13 / 12 | PASSED |
| Rotary | 60.399 s | 13 / 12 | PASSED |
| Hybrid (rotary plus touchpad) | 60.638 s | 13 / 12 | FAILED: framing -251 / out of sync |

Evidence is `.local/matrix/20261010-171810-954dbd2b/`. The hybrid fatal error
invalidated video and sustained-video acceptance despite moving decoded samples;
the overall matrix is **FAILED**. The original log lacks read timestamps, so
its relation to console quit and its cause are unknown.

A timestamped hybrid repeat at **17:27:58–17:29:17 PDT** on the unchanged
binary **PASSED** with **60.653 seconds**, **13 captures / 12 moving pairs**,
no errors and clean shutdown. Evidence is `.local/bench/20261010-172758/`,
including `dhu-events.jsonl`. This is a separate passing run; it does not erase
the original matrix failure or prove that the earlier error occurred only at shutdown.

During the concurrent **17:17:23–17:21:23 PDT** Mac-only USB-C power window,
**41 of 120** samples showed active `0x50005`, EXT5V was
**4.6833–4.91244 V**, and three fresh kernel undervoltage warnings occurred.
Boot `326757eb…` remained stable with increasing uptime. No causal link to
the framing failure is established. This historical matrix used the test pattern;
the original AirPlay config was restored after the new candidate tests.
See [STATUS.md](STATUS.md) for exact backup and power evidence paths.

This build retains pre-session suspend/resume correctly, uses a vendor-only
initial AOA attachment and corrects accessory full-speed packets to 64 bytes
(high-speed remains 512). These fixes have not yet established Mazda acceptance.
The previous USB candidate switched to accessory mode in the Mazda but repeatedly
reset before delivering AA bulk bytes. A fresh kernel undervoltage warning
occurred in that same short car probe despite clear two-second flag samples.

### Historical input/focus build

On October 10, 2026, the installed input/focus build passed the strict pattern
test at **12:23:49–12:24:03 PDT**, followed by two headless full AirPlay loops:

| Evidence directory | Decoded moving frames | Visual source confirmation |
| --- | --- | --- |
| `.local/bench/20261010-122751/` | 800×480; 5.03 s separation; RGB difference 5.492; 5.74% changed pixels | QuickTime clock 6.8 → 16.9 s, with desktop surroundings |
| `.local/bench/20261010-123037/` | 800×480; 5.01 s separation; RGB difference 21.3029; 22.66% changed pixels | Fullscreen QuickTime clock 15.433 → 17.933 s, with macOS disk-notice overlays |

Both full-loop runs passed every required
`--headless --expect-auto-start --expect-airplay` stage. Each captured fresh real
input channel 3 open/binding status 0 before video channel 2 opened, accepted
setup status 2, a Pi PROJECTED request, a head-unit mode-1 grant and
StartIndication. Each collected 16 fresh mirrored H.264 records with advancing
timestamps. DHU reported protocol 1.5 and `Verify returned: ok`, with no TLS
bypass or console focus override, and quit cleanly. Native `--headless` kept
the DHU decoder window out of the mirrored source.

Visual inspection confirmed the moving source in both runs. Desktop surroundings
and disk-notice overlays are presentation limits; these captures do not establish
unobscured fullscreen playback. Logs alone cannot identify the source pixels.
The earlier unobscured fullscreen evidence at `.local/bench/20261010-110729/`
used console focus and remains transport-only evidence.

That older build was configured to start in AirPlay mode. QuickTime
was paused and Mac AirPlay disconnected after those tests. See
[STATUS.md](STATUS.md) for the binary hash, durable rollback, certificate expiry
and observed undervoltage. A later user power cycle started the installed build
in the Mazda with intact hashes and real bridge processes. The car accepted
input binding and video setup, but still supplied no focus grant or moving
video. Real sensor readings confirmed an engaged parking brake; subscribing to
sensors did not resolve activation. A subsequent AA-only Bluetooth probe lost
its SSH connection without a recovered result; a different boot ID was later
observed, followed by repeated Mazda **USB1 not responding** messages and SSH
timeouts. No full Bluetooth/HFP pairing attempt has run, and the restart cause
is unknown. These observations do not establish
long-term durability, stable power or sustained reconnect behavior. Audio is
disabled; the Mac passes verify video.
