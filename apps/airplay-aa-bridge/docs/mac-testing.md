# Mac / laptop testing (no car required)

The Pi speaks **phone-side** Android Auto over USB. Your Mac (or Linux PC) can
pretend to be the car head unit with OpenAuto / Desktop Head Unit style tools.

## Hardware

On Pi 4/5 the **USB-C power connector** is the only USB gadget/device port (official docs: legacy USB 2.0 controller on that connector for device mode with `otg_mode=0`; enable `dtoverlay=dwc2,dr_mode=peripheral`). The four USB-A ports are host-only and cannot present AOAP to a car/Mac. Same USB-C jack is also how the board is powered, so for AA you either let the Mac/car supply enough 5 V over a **data** cable, or power the Pi another way (PoE HAT, GPIO, etc.) while USB-C carries data. Zero 2 W uses its micro-USB data port instead.

- USB-C ↔ USB-C or USB-C ↔ USB-A **data** cable (not charge-only)
- Pi and Mac on the same Wi-Fi (AirPlay), USB only for Android Auto

## 1. Flash & install on the Pi

```bash
# On the Pi, after cloning this repo:
cd apps/airplay-aa-bridge
sudo ./scripts/install-pi.sh
sudo reboot
sudo systemctl start airplay-aa-bridge
```

## 2. AirPlay from your Mac

1. Ensure the Pi appears as **Pi AirPlay AA** (name from `/etc/airplay-aa/bridge.env`).
2. On macOS: Control Center → Screen Mirroring → select the Pi.
3. Or from iPhone: Control Center → Screen Mirroring.

You should see UxPlay activity in:

```bash
sudo tail -f /var/log/airplay-aa/uxplay.log
```

## 3. Head-unit simulator on the Mac (what actually works)

**Verdict (Mac mini arm64, Sep 2026):** use **Google Desktop Head Unit (DHU)** under
Rosetta. It is the least-friction path that completes ModeSwitcher / AOAP against
AAServer. OpenAuto has no usable macOS/arm64 prebuild; Docker Desktop cannot pass
the Pi USB gadget into a Linux container. A UTM Linux VM with USB sharing remains
the OpenAuto fallback if you need a full HU UI beyond DHU.

### Option A — Google DHU (preferred on this Mac)

DHU is **not** a dead end for AAServer: `--usb` speaks AOAPv2, finds
`TAG AAServer TAGAAS` (`12d1:107e`), issues `ACCESSORY_START`, re-enumerates the
gadget as Google accessory `18d1:2d00`, then runs version + TLS. It is dead-end
only if you rely on ADB tunneling to a phone Play Services AA app — that path does
not apply here.

```bash
# On the Mac (repo checkout):
cd apps/airplay-aa-bridge
chmod +x scripts/run-mac-dhu.sh scripts/install-dhu-certs.sh

# One-time: replace expired AACS CarService cert (notAfter 2022-08-24) with the
# non-expired GAL engineering identity extracted from DHU (valid through 2048).
./scripts/install-dhu-certs.sh quirino@10.0.0.112

# Pi must be in ModeSwitcher (VID 12d1) and visible on USB:
ioreg -p IOUSB -w0 | grep AAServer

# Launch HU (downloads DHU darwin-x64 on first run; needs Rosetta on Apple Silicon):
./scripts/run-mac-dhu.sh
```

Success looks like:

| Side | Log signal |
| --- | --- |
| DHU | `starting accessory mode` → `Found device … accessory mode (vid=18d1, pid=2d00)` → `Attached!` → `Phone reported protocol version 1.5` → TLS OK |
| Pi `aaserver.log` | `Got 53, exit` → `got version request` / `version negotiation ok` → `auth complete` → later video channel ≠ 255 |
| Pi `inject.log` | `video channel not ready yet (got 255); waiting` then `video channel id=N` |

**Blockers we hit and fixed:**

1. Injector treated unset channel `uint8_t(-1)==255` as valid and tore down the
   client mid-handshake — fixed in `bridge/inject_h264.py`.
2. Stock `android_auto.crt` expired → DHU `certificate has expired` — fixed by
   `install-dhu-certs.sh`.
3. Wrong CLI: `-u=TAGAAS` searches for literal `=TAGAAS`; use `--usb TAGAAS`.

### Option B — OpenAuto in a Linux VM (UTM)

Use when you want OpenAuto’s Qt UI or DHU still fails after the cert install.

1. `brew install --cask utm` (already available on this machine).
2. Create an Ubuntu 24.04 **ARM64** VM; enable USB sharing.
3. Pass through the Pi gadget (`TAG` / `AAServer` or post-switch `18d1:2d00`).
4. Inside the VM, build [opencardev/openauto](https://github.com/opencardev/openauto):
   `./build.sh release --package --with-aasdk` (or their Debian package artifacts).

Docker Desktop on macOS is **not** a substitute — no USB device passthrough to
Linux/arm64 containers.

### Option C — Native OpenAuto on macOS

Not practical in 2024/2025/2026: Linux/Qt/aasdk stack, no arm64 Mac releases.

### Option D — Real car USB

Still the ultimate integration test. Use after DHU proves AOAP + video locally.

## 4. Pi 5 USB gadget enable (phone-side AOAP)

The Pi 5 USB-C jack is both the **power** connector and the **only** gadget/device
port (SoC `dwc2` at `1000480000.usb`). The four USB-A ports sit on RP1 and are
**host-only** — they cannot present AAServer/AOAP to a car or Mac.

### Boot config (required)

In `/boot/firmware/config.txt` (under `[all]`, not only `[cm4]`):

```text
dtoverlay=dwc2,dr_mode=peripheral
```

In `/boot/firmware/cmdline.txt` (single line, space-separated):

```text
modules-load=dwc2
```

`install-pi.sh` adds both. Reboot once after changing them.

### `otg_mode` on Pi 5

Official `config.txt` docs label `otg_mode` as **Raspberry Pi 4 only**. On Pi 4,
`otg_mode=1` switches the USB-C controller to XHCI **host** (bad for gadget);
`otg_mode=0` (default) leaves the legacy controller available as a **device**.

On this Pi 5 image, stock `otg_mode=1` lives under the `[cm4]` filter and does
**not** apply (`vcgencmd get_config otg_mode` → `0`). Do not add `otg_mode=1`
under `[all]` / `[pi5]`. Keep `dtoverlay=dwc2,dr_mode=peripheral`.

### Modules / conflicts

```bash
sudo modprobe dwc2 libcomposite usb_f_fs usb_f_mass_storage
# Must be empty or unused — these steal the UDC from AAServer:
lsmod | grep g_ether          # should be empty
systemctl is-active rpi-usb-gadget-ics   # should be inactive
```

`run-bridge.sh` already `modprobe`s the composite modules and unloads `g_ether`.
Persist composite modules in `/etc/modules-load.d/usb-gadget.conf` (not `g_ether`).

### Power + data on the same USB-C

Honest tradeoff: one physical jack. Options:

1. Mac/car powers the Pi over a **data** cable (needs enough 5 V; some Apple hosts
   misbehave when the Pi does USB-PD negotiation — see raspberrypi/linux#6569;
   workarounds include `PSU_MAX_CURRENT=3000` in EEPROM, USB-A↔C cable, or a
   powered hub).
2. Power via PoE HAT / GPIO 5 V and use USB-C for data only.
3. Charge-only cables will power the board but never enumerate a gadget.

### Verify on the Pi

```bash
ls /sys/class/udc                    # expect 1000480000.usb
cat /sys/class/udc/*/state           # not attached | configured
# debugfs role (should be peripheral):
sudo cat /sys/kernel/debug/usb/1000480000.usb/dr_mode
dmesg | grep -i dwc2
systemctl status airplay-aa-bridge --no-pager
```

- `not attached` — no USB host on USB-C (or charge-only cable / no VBUS+data).
- `configured` — a host enumerated the gadget (AAServer binds as `initial_state`,
  typically VID:PID `12d1:107e` during accessory switch).

AAServer stays in ModeSwitcher until a head-unit (OpenAuto / car) finishes AOAP;
that is expected. The Unix inject socket appears only after that handshake.

### Verify on the Mac

1. Plug Pi **USB-C** ↔ Mac with a known **data** cable.
2. System Information → USB, or (on recent macOS `SPUSBDataType` may be empty):

```bash
system_profiler SPUSBHostDataType | grep -iE 'AAServer|TAG|12d1|Huawei|Linux Foundation'
# or:
ioreg -p IOUSB -w0 | grep -i AAServer
```

Expect product **AAServer**, vendor **TAG**, VID:PID **0x12d1:0x107e** while AAServer is in
accessory-switch mode. Then start DHU (`./scripts/run-mac-dhu.sh`) or OpenAuto.

## 5. Verify USB gadget mode on the Pi (quick)

```bash
# After plug-in to Mac/car:
system_profiler SPUSBHostDataType | grep -i AAServer   # Mac
# On Pi:
cat /sys/class/udc/*/state                             # configured
dmesg | grep -iE 'dwc2|gadget|accessory'
sudo journalctl -u airplay-aa-bridge -n 100
```

## 6. Logs

| Log | Path |
| --- | --- |
| Orchestrator / AAServer | `/var/log/airplay-aa/aaserver.log` |
| UxPlay | `/var/log/airplay-aa/uxplay.log` |
| H.264 injector | `/var/log/airplay-aa/inject.log` |

## Safety

Do not watch mirrored video while driving. This project is for parked / engineering
use. Android Auto protocol stack is reverse-engineered open source (AACS); treat it
as experimental.
