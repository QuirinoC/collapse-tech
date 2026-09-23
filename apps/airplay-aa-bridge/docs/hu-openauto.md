# Linux HU — OpenAuto (`autoapp`) on `1ubuntu` / `10.0.0.220`

Alternate bench head unit (Ubuntu **26.04** amd64). Native aasdk builds fail on Boost **1.90** / C++15 `Promise` ctor; Docker build of upstream Dockerfile fails without `ninja-build` in the aasdk step.

**Working approach:** prebuilt OpenCarDev `.deb`s (bookworm/`deb12u1`) + bookworm shared libs under a private prefix.

## Installed layout (HU)

| Path | Role |
|------|------|
| `~/opt/openauto-runtime/bin/autoapp.real` | ELF binary (OpenAuto `2026.02.09`) |
| `~/opt/openauto-runtime/lib/` | `libaasdk`, `libaap_protobuf`, Boost 1.74, ICU 72, gps/tag/rtaudio, … |
| `~/bin/autoapp` | Wrapper: sets `LD_LIBRARY_PATH`, `DISPLAY`, `QT_QPA_PLATFORM` |
| `~/bin/btservice` | Bluetooth companion wrapper |
| `~/bin/check-usb-and-run-openauto.sh` | Gates on `lsusb` VID **12d1**, then runs `autoapp` |
| `~/src/openauto-debs/` | Cached `.deb`s |

Packages used:

- [openauto_2026.02.09_deb12u1_amd64.deb](https://github.com/opencardev/openauto/releases/download/2026.02.09%2Bgit.4cc739b/openauto_2026.02.09_deb12u1_amd64.deb)
- [libaasdk_2026.01.24_deb12u1_amd64.deb](https://github.com/opencardev/aasdk/releases/download/2026.01.24%2Bgit.82035a8/libaasdk_2026.01.24_deb12u1_amd64.deb)

## Exact launch command

On the HU GUI session (or SSH with Xwayland/`DISPLAY` forwarded):

```bash
export DISPLAY=:0
export QT_QPA_PLATFORM=xcb
autoapp
```

Equivalent:

```bash
~/bin/autoapp
```

Smoke-verified: process reaches `[OpenAuto] [App] Waiting for device...` and listens for Wi‑Fi AA on **port 5000**.

## USB gate (Pi gadget)

Do **not** claim Android Auto video until the Pi enumerates:

```bash
lsusb | grep -i 12d1
~/bin/check-usb-and-run-openauto.sh
# exit 2 if no 12d1 — Pi power/USB still pending
```

As of last check, HU `lsusb` had **no** `12d1` (ASMedia hubs + Bluetooth only).

## Rebuild notes (if needed later)

1. **Preferred:** refresh prebuilt `deb12u1` amd64 assets from OpenCarDev releases; re-extract libs from a `debian:bookworm-slim` container that `apt-get install`s those debs.
2. **Docker source build:** patch upstream `Dockerfile` to `apt-get install … ninja-build` (aasdk `build.sh` uses `-G Ninja`). `build-essential` alone is not enough.
3. **Native Ubuntu 26:** avoid unless aasdk is patched for Boost ≥1.83 (`io_service` → `io_context`) and C++ `Promise` construction.
