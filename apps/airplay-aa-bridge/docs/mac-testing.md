# Local end-to-end testing on the Mac

Use the Mac as the Android Auto head unit. The Pi remains the phone-side USB
accessory. Google Desktop Head Unit (DHU) is already installed in `.local/dhu`
and runs under Rosetta on this Mac. Direct USB AOA mode does not need an Android
phone, ADB tunnel, VM, or OpenAuto installation.

Official reference: [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu).

## Wiring

Keep the established GPIO power arrangement: PD trigger at 5 V feeding physical
pins 2/4, ground on pin 6. The official brick feeds the trigger. Connect the Pi's
USB-C data port to this Mac with a data cable. Keep Pi USB-C available for data.

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
./scripts/test-e2e.sh --pi-host quirino@10.0.0.113 --expect-smpte
```

`--pi-host` is optional for the pattern test and required with `--expect-airplay`.
It collects read-only Pi evidence and does not deploy files or restart the Pi.
Use the Pi's actual reachable address.

The runner writes a timestamped folder under `.local/bench/`, containing the DHU
log, USB inventory, optional Pi snapshots, decoded screenshots, and `summary.json`.
It fails early when no Pi USB gadget is visible. A complete pass requires USB/AOAP,
TLS/video-session evidence and two nonblank decoded screens that change. Merely
seeing `12d1:107e`, a Unix socket, or a black DHU window is insufficient.

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
./scripts/test-e2e.sh --expect-airplay --pi-host quirino@10.0.0.113
```

This requires the explicit `AIRPLAY_AA_SOURCE=airplay` config line, fresh
mirrored H.264 receive records appended during the current run, successful USB
authentication, and changing nonblank decoded DHU frames. Visually compare the
saved frames with the playing source. A static desktop or macOS's **Choose to
Mirror or Extend Display** screen cannot pass. The pattern test proves the
encoder-to-head-unit path; this second test additionally exercises UxPlay and
the AirPlay transport.

For an interactive emulator window and console:

```bash
./scripts/run-mac-dhu.sh
```

The acceptance runner relies on the phone's focus request and does not issue
`focus video on`. The earlier October 10 transport passes did issue that
command, which concealed the missing automatic activation in the car. A fresh
hardware pass without it remains required.

For a screenshot in an interactive diagnostic session:

```text
screenshot /absolute/path/headunit.png
```

## Locate the failed stage

- **USB:** `ioreg -p IOUSB -l -w0` should show AAServer / TAGAAS, normally
  `12d1:107e`, or Google accessory `18d1:2d00` after switching.
- **AOAP:** DHU discovers the accessory; Pi logs `Got 53, exit`.
- **Protocol/TLS:** DHU reports the phone protocol; Pi logs `version negotiation ok`
  and `auth complete`. Treat certificate errors as failures.
- **Service discovery:** Pi logs `got service discovery response`; injector resolves
  `video channel id=N`, with N neither 0 nor 255.
- **Setup/focus:** Pi logs accepted setup, PROJECTED focus request, a projected
  focus indication (mode 1 or 4), then StartIndication. Rejected/missing setup
  and native focus must hold media. A console focus override is not acceptance.
- **Video:** DHU screenshots actually decode nonblank moving content.

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

## Current evidence

The October 10, 2026 headless run at **11:07:29–11:07:43 PDT**
(**18:07:29.617–18:07:43.424 UTC**) **passed the complete Mac AirPlay → Pi
UxPlay → encode/inject → USB Android Auto → Mac DHU loop**. Every required
`--expect-airplay` stage passed, including protocol 1.5, TLS 1.2, decoded video,
motion, and fresh AirPlay input. DHU reported `Verify returned: ok`; no TLS
bypass was enabled.

Visual inspection of two actual **800×480** DHU screenshots confirmed the Mac
test clip with its clock advancing **16.133 → 21.367 seconds**. The frames were
5.18 seconds apart; mean absolute RGB difference was **10.2043**, with **12.17%**
changed pixels. Pi evidence confirmed `AIRPLAY_AA_SOURCE=airplay` and **16 fresh
H.264 receive records** with advancing timestamps. DHU quit cleanly at the
runner's request. Evidence is in `.local/bench/20261010-110729/`, including
`summary.json`, `dhu.log`, Pi snapshots, and `frame-{1,2}-735395b1.png`.

Native DHU `--headless` kept the decoder window out of the mirrored source.
Both captures show the full moving clip without recursive display feedback.
The earlier visible-DHU AirPlay pass remains recorded in
`.local/bench/20261010-110453/`.

The Pi moving-SMPTE source also passed at **10:42 PDT / 17:42 UTC**, with two
800×480 bar-pattern frames, mean absolute RGB difference **0.9999**, and **4.43%**
changed pixels. That independent source-to-USB evidence is in
`.local/bench/20261010-104205/`. See [STATUS.md](STATUS.md) for the installed
binary, certificate expiry, and rollback.

Pi Wi-Fi SSH is reachable at `quirino@10.0.0.113`. The tested fixes are installed.
The Pi returned to `AIRPLAY_AA_SOURCE=airplay` at about 10:42:50 PDT, and Bonjour
confirmed **Pi AirPlay AA**. It remains in AirPlay mode. Sustained operation and
the actual car have not been verified. Audio remains disabled; these passes
verify video.
