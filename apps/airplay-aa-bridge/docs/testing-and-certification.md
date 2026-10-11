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

Production-code review also found missing protocol acceptance coverage:
`ChannelHandler.cpp` accepts a video-channel-open response without parsing its
status; `VideoChannelHandler.cpp` discards media acknowledgements and does not
enforce the negotiated outstanding-video limit. These need production-handler
regressions and a peer harness for framing/TLS/backpressure. Passing the DHU
matrix alone cannot establish those behaviors. Neither is a proven cause of
the observed Mazda USB resets.

The first matrix invocation was `BLOCKED` before launching DHU: no Pi USB device
was visible and SSH failed. Neither later profile ran. Hardware acceptance
remains unexercised until fresh evidence exists; see [STATUS.md](STATUS.md).
