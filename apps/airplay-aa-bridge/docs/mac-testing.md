# Mac / laptop testing (no car required)

The Pi speaks **phone-side** Android Auto over USB. Your Mac (or Linux PC) can
pretend to be the car head unit with OpenAuto / Desktop Head Unit style tools.

## Hardware

- Raspberry Pi 4 or 5 (USB-C gadget) or Zero 2 W (micro-USB data port)
- USB-C ↔ USB-C or USB-C ↔ USB-A **data** cable
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

## 3. Head-unit simulator on the Mac

### Option A — OpenAuto (Linux VM or native Linux)

Build [opencardev/openauto](https://github.com/opencardev/openauto) + aasdk on a
Linux machine, connect the Pi USB gadget port, and start OpenAuto. You should see
the black idle surface, then the AirPlay mirror once mirroring starts.

### Option B — Another Linux box with OpenAuto

Same as A. Wireless Android Auto is **disabled** in this project — only USB AOAP.

## 4. Verify USB gadget mode on the Pi

```bash
# After plug-in to Mac/car:
lsusb   # on the Mac/host — look for accessory / AAServer-related gadget
dmesg | grep -iE 'dwc2|gadget|accessory'
sudo journalctl -u airplay-aa-bridge -n 100
```

## 5. Logs

| Log | Path |
| --- | --- |
| Orchestrator / AAServer | `/var/log/airplay-aa/aaserver.log` |
| UxPlay | `/var/log/airplay-aa/uxplay.log` |
| H.264 injector | `/var/log/airplay-aa/inject.log` |

## Safety

Do not watch mirrored video while driving. This project is for parked / engineering
use. Android Auto protocol stack is reverse-engineered open source (AACS); treat it
as experimental.
