# CAR BRING-UP

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
