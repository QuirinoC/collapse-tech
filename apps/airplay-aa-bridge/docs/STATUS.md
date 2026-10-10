# Bench status — October 10, 2026

**Actual Mazda activation: STILL UNRESOLVED. This is not car-ready.**
The corrected USB build is installed on the Pi and passed an actual automatic
Mac USB/DHU moving-pattern test at **15:55:57–15:56:11 PDT**. The full AirPlay
source test on this exact build is pending macOS Screen Mirroring selection.
The previous USB candidate still failed in the Mazda before its first Android
Auto bulk bytes, with repeated USB resets. An older build reached accepted input
binding and video setup there but received no projection grant or stream start.
Those are separate observations, not successful car acceptance.

The Pi is now connected to the Mac, with normal AirPlay mode restored and the
service enabled and running. Current Mac power samples still show active
undervoltage; warnings also occurred with the user's power splitter. The
successful historical Mac AirPlay loops do not establish this build's AirPlay
acceptance or Mazda compatibility. Audio is disabled; the evidence covers video only.
See [mac-testing.md](mac-testing.md) for the repeatable Mac hardware test.

## Mazda observations before the final USB build

The session observed at **14:37 PDT** used the installed AAServer hash
`dba09b6d0826b12a6e325304cd7ea55a4217118d67c1fea48914ca7358e623a1`
after the user's power cycle. At approximately 14:38, uptime was about two
minutes. Early process log times read 14:30 before clock synchronization; they
must not be treated as definite wall-clock startup times.

That session confirmed:

- USB was configured; protocol negotiation, authentication and discovery
  succeeded.
- Input channel **2** opened and bound with real parsed status **0**, accepted
  by the injector; all **15** advertised numeric keycodes were preserved.
- Video channel **1** accepted setup status **2**, max_unacked **4**, config **0**.
  The Pi requested **PROJECTED** focus, followed only by head-unit pings; no
  VideoFocusIndication or StartIndication appeared.
- The installed runtime hashes were intact and AAServer, UxPlay, encoder and
  injector were actually running across the power cycle. Service state alone
  was not used as that proof.
- Current-boot `get_throttled=0x0` was sampled. This short new-boot observation
  does not establish sustained power stability or explain the previous warnings.

Private evidence is `.local/car-runtime/20261010-1437/state.txt`. Successful
automatic input binding did not resolve the Mazda activation failure.

A bounded real sensor probe at **14:40:25 PDT** opened advertised sensor channel
**7** with status **0**, then subscribed to parking brake **7** and driving status
**13**. Both subscriptions received status **0**. The car reported
**parking_brake=true** and **driving_status_raw=0**, with no probe errors.
No focus grant or StartIndication followed. The brake was therefore engaged at
the observation time, and sensor subscription alone did not resolve activation.
Evidence is `.local/car-runtime/20261010-1437/sensors.json` and
`after-sensors.txt`. Bluetooth readiness still needs a genuine adapter/pairing
observation; no generic phone-side consent-accept operation is verified.

During an attempt to execute an AA-only Bluetooth preparation probe, its SSH
connection reset and no
`result.json` was recovered. Probe completion or success is therefore unproven.
A later verified-key IPv6 SSH connection observed boot ID `e194a2c7…`, different
from the preceding `9e53…` boot. Its wall clock was not synchronized and uptime
was near zero, so the log clock does not establish the actual restart time.
The user then reported repeated **USB1 not responding** messages. Subsequent
IPv4 and IPv6 SSH attempts timed out. The restart and USB failure causes remain
unknown. The full private Bluetooth/HFP orchestrator has **not been executed**;
genuine pairing, a persisted bond and HFP readiness remain unverified.

After adding a power splitter, the user explicitly reported a manual restart.
On boot `dea2e649…`, eight samples over 16.19 seconds showed continuously
advancing uptime and an unchanged boot ID. AAServer instead repeatedly failed
on a **pre-session FUNCTIONFS_SUSPEND** event, and its launcher reattached USB
every few seconds. This trace proves a service reconnect loop, not repeated Pi
reboots. The bridge was stopped; a later check at uptime 355–361 seconds found
no AAServer, AirPlay or encoder processes and USB `not attached`. The service
remained enabled for boot but was stopped with a failed result at that point.

The USB candidate retains a real pre-session USB configuration across
suspend/resume, without allowing RESUME to replace a missing ENABLE. It also
removes the initial empty CD-ROM LUN and accepts accessory mode only after the
exact AOA request 53 completes. Production-handler and event-loop tests cover
these changes. It was installed and tested in the Mazda at approximately
**15:15 PDT**, using binary hash `754f3554…`. Real requests 51, six identifier
requests 52 and a completed request 53 switched the device into accessory mode.
The car then repeatedly reset/configured/suspended USB without delivering the
first AA bulk bytes. The same boot ID and increasing uptime distinguish this
from Pi rebooting; AAServer restarted only after its ten-second startup deadline.
The probe stopped the service after that restart.

All two-second flag samples were historical `0x50000`, but the full kernel
journal recorded a fresh undervoltage warning during that probe. The samples
therefore do not establish clean power. The warning's sticky-bit polling delay
also prevents a reliable claim that resets preceded or followed the voltage dip.
FIFO flush errors occurred during teardown and are not evidence of the initial
failure. The final full-speed descriptor correction described below has not
been tested in the Mazda.
Private observations are in `.local/car-runtime/20261010-1459-splitter/`.

## Current automatic hardware evidence

The final installed binary `d195d47…` passed
`--headless --expect-auto-start --expect-smpte --duration 35` at
**15:55:57–15:56:11 PDT**. Evidence is
`.local/bench/20261010-155557/summary.json` (run `ea8e16ad`). It proves the real
initial device → `18d1:2d00` accessory switch, protocol 1.5, DHU certificate
verification, actual input channel 3 open/binding status 0, video channel 2 setup
status 2, a Pi PROJECTED request, head-unit mode-1 grant and StartIndication.
No TLS bypass or console focus override was used. Two actual decoded 800×480
SMPTE frames 5.10 seconds apart changed by mean absolute RGB difference
**0.9485**, with **4.27%** changed pixels. Visual inspection confirmed the bars
and changing noise region. This run did not test AirPlay.

The full AirPlay source test on this exact binary is pending selection of
**Screen Mirroring → Pi AirPlay AA** on the Mac. QuickTime's direct AirPlay
playback button is not the tested mirroring path.

### Earlier input/focus build

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
The two fresh DHU sessions establish repeated session startup. The subsequent
car power cycle established runtime startup for this build, but car video and
sustained reconnect behavior remain unverified.

The earlier clean fullscreen run at `.local/bench/20261010-110729/` proved moving
Mac content through the same AirPlay/USB path, but supplied a DHU console focus
override. It is historical transport evidence, not automatic-start acceptance.

## Installed build and validation

The installed AAServer at `/opt/airplay-aa/libexec/aaserver/AAServer` has SHA-256:

```text
d195d4798ae4359db3ed7c9cc898b424387dddb7d959a40ac71c46eac4128c84
```

This target-matching Debian 13 ARM64 build was installed with hash and dependency
verification, durable backup and atomic replacement. The service is enabled,
relaunches AAServer after DHU exits, and is restored to
`AIRPLAY_AA_SOURCE=airplay`. The latest durable rollback is
`/var/backups/airplay-aa-usb-81dj33n3/rollback.py`; it restores the preceding USB
candidate and leaves the bridge stopped. That candidate's rollback at
`/var/backups/airplay-aa-usb-nx0au2rk/rollback.py` restores the older input build.

The final build additionally corrects the actual accessory full-speed bulk
descriptors from 512 to **64 bytes**, while retaining high-speed **512 bytes**.
An actual serialized-descriptor test covers both speeds and endpoint addresses;
the original 512-byte full-speed source fails that test. This corrects a real USB
standards defect, but has not established the cause or resolution of Mazda resets.
The production descriptor test, complete C++ suite and focused ASan/UBSan checks
passed, and every compiled patch hash matched the source deployed to the Pi.
The ELF RUNPATH includes `/opt/airplay-aa/lib` for the installed libusbgx.

`AIRPLAY_AA_USB_ONLY=1` is a temporary launcher diagnostic: it runs AAServer and
the USB lifecycle without the AirPlay pipeline or injector. It is disabled by
default. An isolated actual-launcher test verified normal worker recovery,
USB-only startup and invalid-value rejection. It has not been car-tested and
does not supply application video or prove projection acceptance.

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

## Earlier Mazda evidence, before the input build

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
message is known. That earlier session had no sensor or Bluetooth diagnostic
requests. Device enablement and enabled Bluetooth still need observation. The
first-connection parking-brake condition is now observed above; Mazda documents
these conditions in its
[Type A Android Auto guide](https://connect.mazda.com/en/smartphone-integration/android-auto/type-a/index.html).
The new input build's car retest above confirms that input binding alone did not
resolve this failure.

## Power observations

On the current Mac boot `337ce712…`, a 30-second read-only window at
**15:46:55–15:47:25 PDT** sampled active `0x50005` in **8 of 16** observations,
with EXT5V **4.788–4.890 V** and unchanged boot ID. Kernel undervoltage warnings
continued later in the same boot. These are current power failures even though
the USB/DHU tests passed; their cause and relationship to Mazda resets remain
unproven. Evidence is `.local/mac-power-20261010-validate/`.

A fresh final-build observation at **15:56:24.785–15:57:09.780 PDT** captured
24 samples over 45.022 seconds, with the same boot and continuously advancing
uptime. Two new kernel undervoltage warnings occurred, while only **3 of 24**
flag samples caught active `0x50005`. EXT5V ranged **4.78380–4.88296 V**.
AAServer, UxPlay, injector and encoder PIDs stayed unchanged, USB stayed
configured and SSH/Wi-Fi stayed connected with no interface error/drop deltas.
This establishes continuity during that short post-test window, not clean power.
Evidence is `.local/mac-power-20261010-validate/fs64-window-summary.json`.

The user explicitly corrected the wiring account: this Pi is powered **only
through its USB-C connection to the Mazda**, which also carries Android Auto
data. The earlier GPIO/PD-trigger/27 W supply account was false and must not be
used for instructions or conclusions. Unplugging that cable removes power.
The previous advice to disconnect data while retaining separate power was
therefore incorrect. When reachable, shut the Pi down before moving or removing
its sole power/data cable. The user subsequently added a power splitter. Its
exact model, external supply rating and power isolation have not been supplied
or independently verified.

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
readiness. The later car boot sampled `0x0`; this clears the current observation
but does not explain or disprove the earlier undervoltage.

The splitter boot `dea2e649…` also logged undervoltage at approximately **5.48,
142.56 and 152.64 seconds** of uptime, most recently normalizing at **154.66
seconds**. The initial eight samples measured EXT5V **4.835–4.920 V**, with
historical flags `0x50000`; those samples do not negate the kernel warnings.
After stopping the bridge, four samples at uptime 355–361 seconds measured
**4.848–4.911 V**, with the same historical flags and no later voltage warning
in the captured journal. Power under the full running bridge remains unproven.
The user tested the same cable with an iPhone and reported immediate operation;
that establishes an iPhone connection, not Pi power adequacy or Android Auto
compatibility.

## Startup persistence and recovery

At 11:39 PDT, after an unclean restart, the installed AAServer and pipeline script
were zero bytes. The shutdown cause is unknown: FAT reported an unclean unmount,
no preceding boot journal survived and that boot reported `get_throttled=0x0`.
Both files were restored with file fsync, atomic rename and parent-directory
fsync. The installed durability protections have a backup at
`/var/backups/airplay-aa-car-durable-bz3bnf8y/`. Service `active` alone is not
evidence that the actual bridge processes are healthy.

The Pi restarted at approximately **12:02 PDT** and recovered the earlier focus
binary and pipeline intact. The user's later power cycle also recovered the new
input build and pipeline with expected hashes and real processes running, as
observed at **14:37 PDT**. These are observed startup successes; they do not prove
long-term durability or automatic car video. Sustained boot/reconnect acceptance
remains pending.

The boot audit found the bridge enabled in systemd, persistent dwc2 peripheral
configuration and module loading, and the competing gadget service masked. The
bridge recreates runtime directories/FIFO and missing idle video. It binds the
initial gadget and waits for the host. With the actual wiring, USB-C connection
supplies power and data together. The earlier version started after the move
and power cycle in the car,
although automatic activation failed. Durable atomic replacement preserves each
old or new file across an interrupted write; it is not a transaction across an
entire deployment.

The later `e194a2c7…` boot is another observed restart, not a successful
end-to-end recovery: no probe result was recovered and the user reported USB
errors. The startup script's configfs cleanup and initial gadget binding have
no overall timeout; a blocked operation can leave a supervisor alive without
a working USB session. The FunctionFS endpoint startup gate is bounded at
10 seconds, and established USB suspend/disable ends the session before the
supervisor retries. These are code-level failure paths, not a diagnosis of the
observed restart. Do not reboot or manually unbind the gadget to repeat this
failure. Prior configfs `UDC` access hung; use `/sys/class/udc/*/state` for a
read-only state check when the Pi is reachable.

## Remaining acceptance

1. Establish reliable power for the actual USB-C power/data arrangement and
   investigate the unexplained restart and repeated USB1 errors. Prior
   undervoltage is real evidence, but its relationship to this failure is unknown.
2. Test the final descriptor/startup build in the Mazda only after a stable
   supply is established. The preceding USB candidate failed before AA protocol
   negotiation; the older input build reached setup without a projection grant.
   Resolve the first failed stage from actual responses.
3. Verify sustained playback, corrected HLS pacing, USB reconnect and cold boot
   on the installed build.

AirPlay supplies the input video; Android Auto carries the car-facing video.
