# AirPlay → Wired Android Auto Bridge

Raspberry Pi becomes an **AirPlay 2 receiver** and projects that video to a car
head unit over **wired Android Auto (USB AOAP)**. Wireless Android Auto is not used.

The deployed October 22 car-interface revision (`2503d81f…`) corrects incoming
AA framing, channel-open status handling, video acknowledgement limits, USB
power descriptors and startup without Wi-Fi. It passed real Mac USB/DHU moving
video: touch **61.137 s**, rotary **60.252 s**, hybrid **60.537 s**. A restricted
Bluetooth companion for the configured Mazda and persistent diagnostics are
installed and enabled. Actual Mazda pairing/projection remains unverified.

On October 28 the Pi was unavailable over USB and SSH, so the remaining reboot
check and restoration from the temporary test pattern to normal AirPlay are
pending. Reconnect it before the next car trial; see [current evidence](docs/STATUS.md).

The full Mac Screen Mirroring → Pi → USB/DHU pass of **60.786 seconds** is from
**October 10**. October 22 QuickTime direct AirPlay playback supplied no fresh
mirrored video and did not pass. The actual Mazda has never passed Android Auto
activation; this project is **not car-ready**. Power warnings remain unresolved.
See [current evidence and exact build scope](docs/STATUS.md).

```
Mac / iPhone  --AirPlay2-->  UxPlay on Pi  --H.264-->  AAServer  --USB-->  Car / Mac DHU
```

## Hardware

| Board | USB gadget port |
| --- | --- |
| Pi 4 / Pi 5 | USB-C, shared with power input |
| Pi Zero 2 W | micro-USB marked **USB** (not PWR) |
| Pi 3 A+ | USB-A OTG |

Needs a **data** cable into the car AA USB port or the Mac running DHU. The user
confirmed the original Pi 5 wiring received **all power and data from the single
USB-C cable to the Mazda**; unplugging it powered the Pi off. An earlier car
trial used a splitter with unverified model, supply rating and isolation. For
the current Mac bench, the user confirmed **Mac USB-C alone supplies power and
data**, with no splitter or separate supply. Shut down the Pi before changing
a connection that supplies power.

The car port's power capacity is unverified, and earlier Pi undervoltage was
observed. Check supply stability before further car acceptance testing. Raspberry
Pi documents [5 V / 3 A operation with limited USB peripherals and recommends
5 V / 5 A for Pi 5](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply).

## Quick install (on the Pi)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <this-repo> && cd collapse-tech/apps/airplay-aa-bridge
sudo env AIRPLAY_AA_CERT_DIR=/path/to/current-phone-identity ./scripts/install-pi.sh
sudo reboot
sudo systemctl start airplay-aa-bridge
```

`install-pi.sh` is the setup for another Pi. It forces `dtoverlay=dwc2,dr_mode=peripheral` even when the image already shipped `dr_mode=host` (current Pi 5 OS puts that under `[cm5]`), enables `airplay-aa-bridge`, and that unit starts the bridge on boot.

Provide a currently valid signed `O=CarService` phone certificate and matching
key as `android_auto.crt` / `android_auto.key`. The bundled legacy DHU identity
belongs to a head unit and is rejected before installation. See
[certificate checks and provenance](certs/README.md).

Then:

1. Connect the Pi gadget port to the USB host with adequate power.
2. AirPlay Screen Mirroring from your **Mac** or iPhone → **Pi AirPlay AA**.

Android Auto startup does not require AirPlay. A car trial still needs the
activation and stable-power checks in [car bring-up](docs/car-bringup.md).
The bridge no longer waits for `network-online.target` before exposing USB.
The independent [car diagnostics recorder](docs/car-diagnostics.md) keeps bounded
USB/protocol/power evidence on the Pi even when Wi-Fi is unavailable. A restricted
[Bluetooth companion](docs/bluetooth.md) implements the missing phone-side
pairing exchange for a configured head unit; real Mazda pairing and HFP remain
unverified.

Mac simulator steps: [docs/mac-testing.md](docs/mac-testing.md)

## Preferred phone hotspot

The optional `airplay-aa-preferred-hotspot.timer` checks for the saved phone
network roughly every 30 seconds and joins it when available, including while
home Wi-Fi is active. NetworkManager priority alone does not switch an active connection;
the timer performs that switch. Failed attempts have a five-minute cooldown,
and the saved home network remains available as fallback.

Keep Wi-Fi credentials only in a private root-owned NetworkManager profile with
mode `0600`; do not put passwords in repository config or command examples.
The separate `/etc/airplay-aa/preferred-hotspot.conf` selects its saved profile
UUID and Wi-Fi interface without containing credentials. Enable the timer for
startup behavior; see
[hotspot setup and checks](docs/car-bringup.md#preferred-phone-hotspot).
The actual phone Wi-Fi join and return to home were verified; phone-hosted
AirPlay and Mazda playback remain unverified.

## Local end-to-end test

Connect the Pi's USB-C port to this Mac using a data-capable cable and check
power stability. In the user's current setup, this cable also powers the Pi.
Use the existing Google Desktop Head Unit to exercise actual USB accessory mode,
TLS and decoded video:

```bash
./scripts/test-e2e.sh --pi-host quirino@10.0.0.113
```

The runner saves logs, timestamped output/console events in `dhu-events.jsonl`,
decoded screenshots and a stage-by-stage `summary.json`
under `.local/bench/`. It only passes when it sees an authenticated USB session
and nonblank moving video. To isolate Android Auto from AirPlay, use the Pi's
`AIRPLAY_AA_SOURCE=test-pattern` mode and add `--expect-smpte` to the command.
For the Mac AirPlay → Pi → USB → Mac DHU loop, mirror moving content to the Pi
with `AIRPLAY_AA_SOURCE=airplay` and run:

```bash
./scripts/test-e2e.sh --expect-airplay --pi-host quirino@10.0.0.113
```

`./scripts/make-mac-test-clip.sh` creates a local moving test clip for QuickTime.
Play it with **View → Loop** enabled and share that window with the Pi.
For whole-Desktop mirroring, add `--headless` to keep DHU's preview window out
of the shared scene and avoid recursive mirror feedback. This opts into DHU's
native headless mode; saved decoded screenshots remain the acceptance evidence.

This also requires newly appended mirrored H.264 receive records with advancing
timestamps during the session. Compare the saved DHU screenshots with the Mac
source visually; packet logs establish receive activity, not pixel identity.
See [local testing](docs/mac-testing.md) for source selection and failure stages.

The default is a short smoke test: `--duration` limits its maximum runtime.
For three head-unit profiles requiring at least 60 seconds of sampled moving
video each, with the Pi's moving test pattern already selected, run:

```bash
./scripts/test-dhu-matrix.sh --pi-host quirino@10.0.0.113
```

Use `--source airplay` when already mirroring moving content. The matrix records
blocked prerequisites separately from session failures and never changes the
Pi's source. The corrected October 10 matrix passed with touch **65.202 s**
(**14 captures / 13 moving pairs**), rotary **60.336 s** and hybrid **60.411 s**
(**13 captures / 12 pairs** each), with no session errors. The earlier matrix's
hybrid framing failure remains recorded separately. The original AirPlay config
was restored after the pattern tests. The full AirPlay run then passed
**60.786 s**, with **13 captures / 12 moving pairs** and **16 fresh mirrored
H.264 receive records**. Two preceding full-source failures remain recorded:
no incoming mirrored video, then a static shared desktop before the clip was
foregrounded.
The concurrent Mac-only USB-C power window caught active undervoltage in
**40/120** samples. These passes do not establish stable power, Google
certification or Mazda acceptance. See
[testing scope and certification research](docs/testing-and-certification.md).

## Layout

| Path | Role |
| --- | --- |
| `scripts/install-pi.sh` | Boot overlays, build deps, systemd |
| `scripts/build-deps.sh` | Build UxPlay + patched AAServer |
| `scripts/run-bridge.sh` | Orchestrator |
| `scripts/preferred_hotspot.py` | Optional saved-hotspot selection |
| `scripts/car_diagnostics.py` | Persistent bounded USB/protocol/power recorder |
| `bridge/phone_bluetooth.py` | Restricted phone-side Bluetooth companion |
| `bridge/inject_h264.py` | H.264 → AAServer socket |
| `bridge/aa_framing.py` | Packet framing |
| `patches/VideoChannelHandler.cpp` | AAServer without Snowmix |
| `patches/AaFrameReceiver.h` | Incoming AA stream framing and per-channel reassembly |
| `config/bridge.env` | Name, resolution, paths |
| `systemd/airplay-aa-bridge.service` | Autostart |
| `systemd/airplay-aa-preferred-hotspot.timer` | Optional preferred Wi-Fi checks |

## Configuration

Edit `/etc/airplay-aa/bridge.env` after install:

- `AIRPLAY_AA_NAME` — AirPlay picker label
- `AIRPLAY_AA_WIDTH/HEIGHT/FPS` — default `800x480@30` (common HU mode)
- `AIRPLAY_AA_USB_POWER` — default `bus`, matching USB-C power; `external` is
  only for a verified independently powered arrangement. The 500 mA USB 2.0
  descriptor does not supply or guarantee enough current for a Pi 5.

## Development tests (no Pi required)

```bash
cd apps/airplay-aa-bridge
python3 -m unittest discover -s tests -v
./scripts/test-video-local.sh
./scripts/test-aacs-local.sh
./scripts/test-tls-local.sh
```

The video command runs decoder-backed FIFO/socket integration on Linux (Docker
on macOS). The AACS command tests actual USB startup recovery and current service
discovery using C++ and protobuf. Both are separate from the physical USB/DHU test.
The TLS command builds pinned AACS with the actual production transport patches
inside disposable Debian 13, then tests real TLS fragmentation, shared-object
serialization and failed-encryption queue preservation. It generates temporary
test-only credentials and never connects to the Pi or USB. Its self-signed peer
fixture does not establish DHU certificate validation or vehicle certification.

The dedicated `.github/workflows/airplay-aa.yml` workflow runs Python discovery
in Debian 13 with required video dependencies, then the production TLS regression,
for bridge PRs and main-branch changes. This software job does not access a Pi or
USB; the physical DHU test and Mazda acceptance remain separate.

The pacing fixture measures the actual production sink through EOS: 60 source
frames, every received sink buffer rendered and zero drops. It rejects streaming
errors and a short source; `videorate` may add an EOS closing frame, which is
counted independently. The child exits before setting GStreamer to NULL, and its
parent reaps it and removes only its own shared-memory objects. This checks
playback pacing and excludes graceful sink shutdown.

## License

- Orchestration / framing in this directory: MIT (see `LICENSE`)
- UxPlay and AACS are **GPLv3**; binaries built by `build-deps.sh` inherit GPL.
  Do not redistribute those binaries without complying with GPLv3.

## Credits

- [FDH2/UxPlay](https://github.com/FDH2/UxPlay) — AirPlay2 receiver
- [tomasz-grobelny/AACS](https://github.com/tomasz-grobelny/AACS) — phone-side Android Auto USB stack
