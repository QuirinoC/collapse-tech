# iPhone Rover first-draft bill of materials

The target is a supervised indoor prototype below $150 excluding the iPhone. Prices are small-quantity estimates and should be confirmed with the chosen supplier.

## Selected baseline

| Item | Baseline choice | Qty | Target cost | Why |
| --- | --- | ---: | ---: | --- |
| Chassis | 2WD differential-drive chassis with caster | 1 | $20–35 | Simple kinematics and in-place turning |
| Drive motors | 3–6 V geared DC motors, ideally with quadrature encoders | 2 | included or $15–30 | Encoders make speed and distance observable |
| Controller | ESP32-S3 development board | 1 | $8–20 | BLE, Wi-Fi, PWM, GPIO, and enough headroom for telemetry |
| Motor driver | Dual H-bridge sized above measured stall current | 1 | $10–25 | Keeps motor power away from ESP32 GPIOs |
| Battery | Protected 2S Li-ion/LiPo pack, approximately 2.2 Ah | 1 | $15–30 | Enough voltage for motors and a regulated logic rail |
| Charger | Charger matched to the exact battery chemistry and cell count | 1 | $10–20 | Avoid charging loose cells with an improvised circuit |
| Logic regulator | 5 V buck converter, at least 3 A transient capacity | 1 | $8–15 | Prevents motor voltage sag from resetting the controller |
| Safety | Inline fuse, master switch, two bumper switches, LED/buzzer | 1 set | $8–15 | Independent stop path and visible state |
| Wiring | Screw terminals/JST connectors, breadboard or perfboard, capacitors | 1 set | $10–15 | Secure power and motor connections |
| Phone mount | Rigid clamp or printed mount with camera clearance | 1 | $5–15 | Keeps the rear camera forward and the phone restrained |

An encoder-equipped build should land around $116–$148 when the simple chassis, printed mount, low-cost ESP32 board, and correctly sized budget driver are used. A premium high-current driver can push the build above $150; select it only if the measured motor stall current requires it. The first bench test can use non-encoder motors, but that is not the target autonomy configuration.

## Electrical rules

1. Measure each motor's stall current before selecting the H-bridge. The Adafruit reference chassis specifies 3–6 V motors with 1.5 A hard stall current per motor; use a driver and wiring that can tolerate both motors starting together.
2. Use a fuse close to the battery and a physical master switch. The firmware watchdog is not a substitute for removing motor power.
3. Feed the ESP32 through a regulator, not directly from a 2S pack. Add bulk capacitance near the motor driver and logic board.
4. Tie grounds together at a deliberate power junction. Keep motor current paths short and separate from encoder and logic wiring.
5. Use a protected pack and a charger designed for that pack. Do not use loose unprotected 18650 cells in a moving prototype.
6. Mount the battery low and below the phone. The phone is the largest and most fragile payload.

## Proposed wiring

```text
2S battery
  ├── fuse ── master switch ── motor-driver VM ── left/right motors
  └── buck converter ── ESP32 5V/VIN

ESP32
  ├── PWM/direction ── dual H-bridge
  ├── encoder A/B inputs ── left/right motors
  ├── bumper inputs ── normally-closed stop switches
  └── BLE GATT ── iPhone app
```

The bumper switches should be wired so that a triggered switch is interpreted as a stop even if the Bluetooth connection or application code is unhealthy. For the first revision, the physical master switch remains the final emergency stop.

## Deferred hardware

- LiDAR or a separate depth camera
- Raspberry Pi or Jetson computer
- Pan/tilt camera mount
- GPS
- Custom PCB
- Wireless charging

The iPhone supplies the camera and optional depth data. The deferred parts should only be added after the camera-to-motor loop, encoder odometry, and safety behavior are repeatable.
