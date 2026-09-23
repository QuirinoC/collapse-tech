# CAR BRING-UP

> **Car path only.** No UTM / Ubuntu VMs / OpenAuto / DHU. Pi may be offline — see `CAR_PATH_ONLY.md`.

Pi boots into `airplay-aa-bridge`: AirPlay name **Pi AirPlay AA**, USB-C gadget waiting for the car’s Android Auto host.

## Power off at the bench

```bash
ssh amber-pi-eth 'sudo poweroff'
```

Unplug power. Take the Pi to the car.

## In the car (physical sequence)

1. **Power the Pi** — USB-C PSU or car 5V supply on the Pi **power** USB-C (or GPIO). Ethernet/wifi optional (for SSH only).
2. **Wait ~30–45s** for boot — service auto-starts; UxPlay advertises **Pi AirPlay AA**.
3. **Data cable** — Pi USB-C **data** port → car Android Auto USB.  
   If the same USB-C must do power+data and the car port is weak, use a **powered USB hub** (Pi powered from hub/PSU; hub upstream to car AA USB). Charge-only cables will not work.
4. **AirPlay** — On iPhone: Screen Mirroring → **Pi AirPlay AA**. Same wifi as the Pi, or share iPhone hotspot and join the Pi to that hotspot.
5. **Confirm AA** — Car should negotiate wired Android Auto (AOAP). Video follows the AirPlay mirror (or idle black until you cast).

## If you can SSH from the phone

```bash
ssh quirino@10.0.0.112   # or .113 on wifi
sudo journalctl -u airplay-aa-bridge -f
# also:
tail -f /var/log/airplay-aa/aaserver.log /var/log/airplay-aa/uxplay.log /var/log/airplay-aa/inject.log
```

Healthy idle (no car yet): AAServer stuck in ModeSwitcher / “waiting for car USB”; UxPlay running; UDC present under `/sys/class/udc/`.

After plug: injector log shows video channel; aaserver advances past ModeSwitcher.

## Boot checklist (already done on amber-pi)

| Item | Expect |
|------|--------|
| `systemctl is-enabled airplay-aa-bridge` | `enabled` |
| `/etc/modules-load.d/usb-gadget.conf` | `dwc2`, `libcomposite`, … (non-empty) |
| `/boot/firmware/config.txt` `[all]` | `dtoverlay=dwc2,dr_mode=peripheral` |
| `otg_mode` | not under `[all]` / `[pi5]` (OK under `[cm4]` only) |
| AAServer + certs + `dhparam.pem` | `/opt/airplay-aa/libexec/aaserver/` |
| UxPlay + `idle.h264` | `/opt/airplay-aa/bin/uxplay`, `/var/run/airplay-aa/idle.h264` |
| Logs | `/var/log/airplay-aa/` |
| Conflicts off | `g_ether`, `rpi-usb-gadget-ics`, shairport, `pi-airplay-receiver` |
| TLS cert `notAfter` | **2048** (not 2022) — see `certs/` + `scripts/install-certs.sh` |

## "Device is not responding" (car)

Classic HU fail. Ranked causes for **this** project:

1. **Expired AA TLS cert on the Pi** (most likely)  
   Stock AACS identity expired **2022-08-24**. Mac DHU already proved: AOAP OK → TLS abort. Cars often surface that as "device is not responding".  
   **Fix (bench, before next car trip):**
   ```bash
   # From Mac with Pi on LAN:
   ./scripts/install-certs.sh quirino@10.0.0.112
   # Must show notAfter=...2048
   ```

2. **Not enough power** — Pi 5 brown-out when powered only from weak car USB.  
   **Fix:** PSU or powered hub for the Pi; data cable to the car AA port.

3. **Charge-only cable / wrong USB port** — use a known-data cable into the car’s Android Auto USB.

4. **Plugged too early** — wait ~45s after power before connecting data.

5. **AAServer crash** — on next SSH: `journalctl -u airplay-aa-bridge -n 100` and `aaserver.log`.

Full honesty / blockers: [`STATUS.md`](STATUS.md).
