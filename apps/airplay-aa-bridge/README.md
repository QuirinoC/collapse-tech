# AirPlay → Wired Android Auto Bridge

Raspberry Pi becomes an **AirPlay 2 receiver** and projects that video to a car
head unit over **wired Android Auto (USB AOAP)**. Wireless Android Auto is not used.

```
Mac / iPhone  --AirPlay2-->  UxPlay on Pi  --H.264-->  AAServer  --USB-->  Car (or OpenAuto)
```

## Hardware

| Board | USB gadget port |
| --- | --- |
| Pi 4 / Pi 5 | USB-C (power+data) |
| Pi Zero 2 W | micro-USB marked **USB** (not PWR) |
| Pi 3 A+ | USB-A OTG |

Needs a **data** cable into the car USB port (or a Mac/Linux box running OpenAuto).

Linux HU OpenAuto bring-up (`10.0.0.220`): [docs/hu-openauto.md](docs/hu-openauto.md)

## Quick install (on the Pi)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <this-repo> && cd collapse-tech/apps/airplay-aa-bridge
sudo ./scripts/install-pi.sh
sudo reboot
sudo systemctl start airplay-aa-bridge
```

Then:

1. AirPlay Screen Mirroring from your **Mac** or iPhone → **Pi AirPlay AA**
2. Plug the Pi gadget port into the car USB (wired AA only)

Mac simulator steps: [docs/mac-testing.md](docs/mac-testing.md)

## Layout

| Path | Role |
| --- | --- |
| `scripts/install-pi.sh` | Boot overlays, build deps, systemd |
| `scripts/build-deps.sh` | Build UxPlay + patched AAServer |
| `scripts/run-bridge.sh` | Orchestrator |
| `bridge/inject_h264.py` | H.264 → AAServer socket |
| `bridge/aa_framing.py` | Packet framing |
| `patches/VideoChannelHandler.cpp` | AAServer without Snowmix |
| `config/bridge.env` | Name, resolution, paths |
| `systemd/airplay-aa-bridge.service` | Autostart |

## Configuration

Edit `/etc/airplay-aa/bridge.env` after install:

- `AIRPLAY_AA_NAME` — AirPlay picker label
- `AIRPLAY_AA_WIDTH/HEIGHT/FPS` — default `800x480@30` (common HU mode)

## Development tests (no Pi required)

```bash
cd apps/airplay-aa-bridge
python3 -m unittest discover -s tests -v
```

## License

- Orchestration / framing in this directory: MIT (see `LICENSE`)
- UxPlay and AACS are **GPLv3**; binaries built by `build-deps.sh` inherit GPL.
  Do not redistribute those binaries without complying with GPLv3.

## Credits

- [FDH2/UxPlay](https://github.com/FDH2/UxPlay) — AirPlay2 receiver
- [tomasz-grobelny/AACS](https://github.com/tomasz-grobelny/AACS) — phone-side Android Auto USB stack
