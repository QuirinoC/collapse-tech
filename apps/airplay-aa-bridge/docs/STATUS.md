# STATUS — AirPlay → wired Android Auto (Pi 5)

**Honest verdict (2026-09-23):** End-to-end **NEVER WORKED** on a real car.
Do **not** car-test tonight until non-expired certs are installed on the Pi and verified.

Pi SSH (`10.0.0.112` / `.113` / `amber-pi-eth`) was **DOWN** during this session — certs could not be installed remotely. No live health check.

---

## WORKED (partial, lab/Mac only)

| Step | Evidence |
|------|----------|
| USB gadget enumerate as AAServer | Mac saw `12d1:107e` (TAG/AAServer) |
| AOAP accessory mode | DHU got `18d1:2d00` + AOAP version 1.5 |
| Pi build / install scripts | Present under `/opt/airplay-aa` from prior bring-up |
| Non-expired GAL certs **in repo** | `certs/android_auto.*` → `notAfter=Aug 1 2048` |

## NEVER WORKED

| Step | Status |
|------|--------|
| TLS with car or DHU | **Failed** — stock AACS cert expired **2022-08-24**; DHU: `certificate has expired` |
| Certs from `apps/airplay-aa-bridge/certs/` on Pi | **Never installed** (Pi went offline before install) |
| Video / AirPlay → head unit | **Never verified** |
| Real car Android Auto session | Car: **"device is not responding"** |

## BLOCKERS (ranked for car "device is not responding")

1. **Expired TLS identity on Pi (most likely)**  
   Same path as DHU: USB + AOAP succeed, then SSL dies → HU gives up with a generic fail. Fix: install `certs/android_auto.*` (2048) into **all** AAServer locations and restart.

2. **Pi 5 underpowered from car USB**  
   Pi 5 wants a solid 5V supply. Many AA ports are weak → brown-out mid-enumeration → "not responding". Fix: power Pi from a proper PSU / powered hub; data-only to the car AA port.

3. **Charge-only or bad cable / wrong car USB port**  
   Need a **data** cable into the car’s **Android Auto** USB (not a charge-only port).

4. **Plugged before boot finished**  
   Wait ~45s after power so `airplay-aa-bridge` + UxPlay + gadget are up, then plug data.

5. **AAServer crash / injector restart-loop / gadget config**  
   Less likely given Mac AOAP success, but check journals after next bench session.

## NEXT (before another car attempt)

### On the bench (SSH must work)

```bash
# From Mac (repo root), once Pi is back on LAN:
cd apps/airplay-aa-bridge
./scripts/install-certs.sh quirino@10.0.0.112

# Verify on Pi:
ssh quirino@10.0.0.112 'openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -dates'
# Expect: notAfter=... 2048 ...
```

Or **one command after power-on** if you copy certs by hand:

```bash
sudo bash -c 'cp /path/to/android_auto.{crt,key} /opt/airplay-aa/libexec/aaserver/ /opt/airplay-aa/third_party/AACS/AAServer/ssl/ 2>/dev/null; cp /path/to/android_auto.{crt,key} /opt/airplay-aa/third_party/AACS/build/AAServer/ 2>/dev/null; openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -enddate; systemctl restart airplay-aa-bridge'
```

### Health check (bench)

```bash
systemctl is-enabled airplay-aa-bridge; systemctl is-active airplay-aa-bridge
journalctl -u airplay-aa-bridge -n 80 --no-pager
tail -50 /var/log/airplay-aa/aaserver.log /var/log/airplay-aa/inject.log
ls /sys/class/udc/; lsmod | grep -E 'libcomposite|dwc2'
# Idle: ModeSwitcher / waiting for USB. After plug: past ModeSwitcher, no SSL errors.
```

### Car sequence

1. Power Pi from **PSU or powered hub** (not starve from car).  
2. Wait ~45s.  
3. Data cable: Pi USB-C **gadget/data** port → car **AA** USB.  
4. AirPlay → **Pi AirPlay AA**.  
5. If still "not responding": pull `/var/log/airplay-aa/aaserver.log` for SSL/ModeSwitcher lines.

**Car path:** no UTM / DHU required — car only after certs are verified on the Pi.

**OpenAuto / Linux HU:** side quest — **abandoned**. Target is car USB AOAP only. Install may remain on `juan@10.0.0.220`; do not run it. Power still blocks (Pi undervolt when fed from host USB-C).
