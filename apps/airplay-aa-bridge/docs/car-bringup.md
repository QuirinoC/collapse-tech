# Pi 5 car bring-up

The Pi receives AirPlay as **Pi AirPlay AA** and sends video to the head unit
over wired Android Auto USB. Prove the complete path on the Mac bench before
moving the data cable to the car. Compatibility with this user's actual car
head unit remains **unverified**; a passing Mac DHU session does not establish
that every car will accept AAServer. See [current evidence](STATUS.md).

## Keep the established power wiring

| Connection | Established arrangement |
| --- | --- |
| Pi power | Official 27 W brick → PD trigger set to **5 V** → GPIO physical pins **2/4** |
| Ground | GPIO physical pin **6** |
| Pi USB-C | **Data only** → Mac USB for the bench, then car Android Auto USB |

Keep GPIO power connected throughout testing and use a known data cable on
USB-C. This Pi has one USB-C connector; there is no separate USB-C power port.
Do not connect a PSU to that connector or change the established GPIO circuit.
No EEPROM change, reboot, or manual UDC/gadget unbind is part of this bring-up.
The existing service manages the USB gadget.

## Check the phone identity before testing

AAServer acts as the phone. Its certificate must have **O=CarService**, be
currently valid, match its key, and authenticate to the head unit. The old
2048 **O=Android-Auto-Internal** identity belongs to the head unit; installing
it on AAServer caused the DHU's `Invalid peer certificate name` rejection.
The stock AACS CarService certificate expired in 2022.

The current verified candidate expires **December 9, 2026 at 18:39:03 UTC**.
Replace it with a current signed phone identity before that date. See
[certificate provenance and renewal](../certs/README.md); changing dates or
generating a self-signed replacement does not supply a trusted identity.

From this directory on the Mac, validate a directory containing
`android_auto.crt` and `android_auto.key`:

```bash
./scripts/check-phone-certs.sh /path/to/current-phone-identity
```

Check the identity actually used by the Pi, using its reachable address:

```bash
ssh quirino@10.0.0.113 \
  'sudo /opt/airplay-aa/scripts/check-phone-certs.sh /opt/airplay-aa/libexec/aaserver'
ssh quirino@10.0.0.113 \
  'openssl x509 -in /opt/airplay-aa/libexec/aaserver/android_auto.crt -noout -subject -issuer -dates -fingerprint -sha256'
```

These commands display certificate metadata and check the matching key without
printing it. The guard checks role, dates and key match; the real DHU/car
session establishes whether the peer accepts the identity. To install a
replacement, follow the guarded [certificate installer](../certs/README.md).
`install-dhu-certs.sh` extracts head-unit material for local inspection only.

## Finish the real Mac bench test first

Keep GPIO power connected and connect the Pi USB-C data cable to the Mac. Pi
and Mac/iPhone must share a network for AirPlay. The Android Auto transport
itself uses USB.

First select `AIRPLAY_AA_SOURCE=test-pattern` in
`/etc/airplay-aa/bridge.env` on the Pi and apply that source change with the
service restart described in [Mac testing](mac-testing.md). From this directory
on the Mac:

```bash
./scripts/test-e2e.sh --pi-host quirino@10.0.0.113 --expect-smpte
```

Inspect the saved `.local/bench/<timestamp>/summary.json` and decoded images.
A pass requires USB accessory mode, an authenticated video session, and moving
decoded SMPTE bars. AOAP enumeration, an established TLS cipher, or a black
window alone does not establish a working video path.

Then select `AIRPLAY_AA_SOURCE=airplay`, apply the source change, and mirror a
visibly moving video or clock to **Pi AirPlay AA** through macOS screen/window
mirroring. Run the AirPlay acceptance test:

```bash
./scripts/test-e2e.sh --expect-airplay --pi-host quirino@10.0.0.113
```

This second pass additionally exercises UxPlay and AirPlay. Leave the source
set to `airplay` for the car. Full source selection and failure-stage details
are in [Mac testing](mac-testing.md).

## Move the data cable to the parked car

1. Keep the established 5 V GPIO power arrangement connected and allow the
   service to start. Confirm the receiver appears as **Pi AirPlay AA**.
2. Move the Pi USB-C **data** cable from the Mac to the car's **Android Auto**
   USB port.
3. Keep the phone and Pi on the same network. On iPhone select Screen Mirroring
   → **Pi AirPlay AA**, then play visibly moving content.
4. Confirm the car accepts the Android Auto session and displays that content.
   Record the actual car/head-unit model and result; this is the compatibility
   test still outstanding.

Use the operating system's **Screen Mirroring** control. A video app's direct
AirPlay playback control can select a different input mode; the Mac QuickTime
test stalled at zero progress and supplied no mirrored video in that mode.
See [Mac testing](mac-testing.md#then-prove-airplay-too) for the tested workflow.

## Diagnose the failed stage

Use the actual reachable Pi address to collect evidence:

```bash
ssh quirino@10.0.0.113
systemctl is-active airplay-aa-bridge
journalctl -u airplay-aa-bridge -n 100 --no-pager
tail -80 /var/log/airplay-aa/aaserver.log /var/log/airplay-aa/inject.log /var/log/airplay-aa/uxplay.log
```

Before a USB head unit connects, AAServer waiting in ModeSwitcher is expected.
After connection, check the sequence: protocol negotiation, successful
authentication, service discovery, `video channel id=N` (neither 0 nor 255),
and `sent first live AU`. The final evidence is decoded moving video on the
head-unit display.

For `device is not responding`, retain the logs around the failure. Check the
actual runtime certificate, the data cable and Android Auto port, the existing
GPIO power supply, and AAServer errors. Use the first failed stage to choose
the next fix instead of repeatedly restarting or rebinding the gadget.
