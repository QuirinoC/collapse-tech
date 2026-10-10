# Pi 5 car bring-up

The Pi receives AirPlay as **Pi AirPlay AA** and sends video to the head unit
over wired Android Auto USB. Prove the complete path on the Mac bench before
moving the power/data cable to the car. Compatibility with this user's actual
car head unit currently **fails activation after accepted input binding and
video setup**. Two full Mac AirPlay/USB DHU passes proved automatic input and
focus negotiation without a console override. The latest Mazda attempt still
failed; subsequent evidence includes an unexplained Pi restart and repeated
**USB1 not responding** messages. Hardware probes are on hold. See [current evidence](STATUS.md).

## Actual power and USB connection

| Connection | User-confirmed arrangement |
| --- | --- |
| Pi USB-C | **Power and data** from the Mazda Android Auto USB port |
| Separate power connection | None |

Disconnecting USB-C removes power. When the Pi is reachable, shut it down before
removing or moving that cable. A Mac bench connection also needs to carry both
power and data. Reliable host-supplied power has not been established: prior
kernel undervoltage warnings and the later restart require investigation before
further car trials. No alternative power arrangement is verified. Do not change
EEPROM or manually unbind the gadget as a diagnostic step; the existing service
manages it.

The installed service and peripheral boot configuration are persistent. Runtime
directories, the video FIFO and idle video are recreated after boot. There is no
separate power-before-data sequence with the actual wiring: plugging in USB-C
supplies both. The bridge waits for the head unit and handles endpoint enable
during startup. A user power cycle started the current input/focus build in the
Mazda with intact runtime hashes and real processes, but activation still failed.
Sustained boot, power stability and cable reconnect remain unverified.

## Check the phone identity before testing

AAServer acts as the phone. Its certificate must have **O=CarService**, be
currently valid, match its key, and authenticate to the head unit. The old
2048 **O=Android-Auto-Internal** identity belongs to the head unit; installing
it on AAServer caused the DHU's `Invalid peer certificate name` rejection.
The stock AACS CarService certificate expired in 2022.

The current installed phone identity expires **December 9, 2026 at 18:39:03 UTC**.
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

Connect the Pi USB-C power/data cable to the Mac. Pi
and Mac/iPhone must share a network for AirPlay. The Android Auto transport
itself uses USB.

First select `AIRPLAY_AA_SOURCE=test-pattern` in
`/etc/airplay-aa/bridge.env` on the Pi and apply that source change with the
service restart described in [Mac testing](mac-testing.md). From this directory
on the Mac:

```bash
./scripts/test-e2e.sh --headless --expect-auto-start --expect-smpte --pi-host quirino@10.0.0.113
```

Inspect the saved `.local/bench/<timestamp>/summary.json` and decoded images.
A pass requires USB accessory mode, an authenticated video session, real input
binding, accepted setup, Pi-requested projected focus, a head-unit grant and
moving decoded SMPTE bars. AOAP enumeration, an established TLS cipher, or a
black window alone does not establish a working video path.

Then select `AIRPLAY_AA_SOURCE=airplay`, apply the source change, and mirror a
visibly moving video or clock to **Pi AirPlay AA** through macOS screen/window
mirroring. Run the AirPlay acceptance test:

```bash
./scripts/test-e2e.sh --headless --expect-auto-start --expect-airplay --pi-host quirino@10.0.0.113
```

This second pass additionally exercises UxPlay and AirPlay. Leave the source
set to `airplay` for the car. Full source selection and failure-stage details
are in [Mac testing](mac-testing.md).

## Parked-car acceptance, after the power/USB failure is resolved

1. Park the vehicle and engage the parking brake. Mazda's
   [first-connection guide](https://connect.mazda.com/en/smartphone-integration/android-auto/type-a/index.html)
   requires it; enable the connected device if the car offers Always Enable or
   Enable Once. The Pi emulates the Android device and has no Android setup UI.
2. Shut the Pi down before changing any connection that supplies power, when
   reachable. The splitter's power routing and supply rating remain unverified.
3. Connect Pi USB-C to the car's **Android Auto** USB port. This supplies both
   data and, in the original wiring, power; allow the service to start and confirm
   **Pi AirPlay AA**. Verify the actual power arrangement before accepting this
   test.
4. Keep the phone and Pi on the same network. On iPhone select Screen Mirroring
   → **Pi AirPlay AA**, then play visibly moving content.
5. Confirm the car accepts the Android Auto session and displays that content.
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
After connection, check protocol negotiation, successful authentication,
service discovery, `video channel id=N` (neither 0 nor 255), accepted setup,
projected focus indication and StartIndication. `sent first live AU` is an
injector write and does not establish head-unit acceptance. The final evidence is decoded moving video on the
head-unit display.

If systemd says active, also check that AAServer, UxPlay and the injector are
actually running and their executable/script files are nonempty. An unclean
restart exposed empty installed files during this trial. Installers now use
`atomic_install.py` to fsync the replacement file, rename it and fsync its
directory. Keep power stable throughout updates; these are per-file writes,
not a whole-deployment transaction.

For `device is not responding`, retain the logs around the failure. Check the
actual runtime certificate, cable and Android Auto port, supplied USB power,
and AAServer errors. The latest failure remains undiagnosed and SSH is currently
unreachable. Preserve evidence and stop additional protocol probes after repeated
USB errors. Use the first failed stage to choose the next fix instead of
repeatedly restarting or rebinding the gadget.
