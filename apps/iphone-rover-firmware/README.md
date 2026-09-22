# iPhone Rover firmware

This is the safety-critical motion bridge for the iPhone Rover prototype. It targets the ESP32-S3-DevKitC-1 in the Adafruit cart (product 5364) running the Arduino framework and exposes a small BLE GATT service.

## Build

Install PlatformIO, connect the ESP32-S3-DevKitC-1, then run:

```bash
pio run
pio run --target upload
pio device monitor
```

The GPIO assignments are in `src/main.cpp` and match this S3 DevKit plus a DRV8833 driver. Check them against the physical carrier board before power is applied.

## Safety behavior

- A command expires after 300 ms without a newer command.
- BLE disconnect immediately stops both motors.
- The emergency-stop input latches the motors off until reboot.
- Bumper inputs block forward motion into the pressed side but allow reverse motion.
- Motor commands are clamped to `-1000...1000`.
- A separate battery fuse, master switch, and physical motor-power cutoff are still required.

The emergency-stop input is a firmware signal only. The physical master switch must remove motor power independently of the ESP32.

## BLE protocol

Service UUID: `8f9a0000-4a0a-4a4a-9f6d-0f6d2b2f1000`

| Characteristic | UUID suffix | Properties | Payload |
| --- | --- | --- | --- |
| Commands | `0001` | Write | `M,sequence,left,right\n` |
| Telemetry | `0002` | Read/Notify | `T,sequence,leftTicks,rightTicks,batteryMv,estop,commandAgeMs\n` |

`left` and `right` are signed motor requests from `-1000` to `1000`. The app should send them at least every 100 ms while driving, leaving margin before the 300 ms watchdog expires.

## Encoder note

The firmware counts rising edges from each encoder's A channel and uses B for direction. It does not yet convert ticks to distance; wheel diameter, gear ratio, and ticks-per-revolution must be calibrated for each motor batch.
