# iPhone Rover validation

The first physical test must be performed with the wheels off the ground, then inside a taped indoor course at the lowest speed. The iPhone app and firmware provide the signals needed for the checks below; the repository does not contain hardware measurements yet.

## Test sequence

1. **Bench safety**: lift the chassis, verify the physical master switch, then send no command for 500 ms. Both motors must be stopped.
2. **BLE latency**: send numbered commands at 10 Hz and record the app send timestamp plus the next telemetry timestamp carrying that sequence.
3. **Disconnect stop**: remove Bluetooth range or stop the app while moving slowly. Firmware must stop within its 300 ms command timeout.
4. **Stopping distance**: on a marked floor, drive at the maximum configured speed and issue stop. Measure the distance until both wheels stop; repeat ten times.
5. **Runtime and thermal**: run a repeatable target-follow course until the battery cutoff, logging battery voltage, board temperature, and resets.
6. **Pose drift**: place tape marks at a known start and finish, drive a square using encoder odometry and ARKit pose, and compare both final poses with the physical mark.
7. **Repeatability**: run the same course at least five times on both a textured mat and a featureless floor.

## CSV schema

The analyzer accepts one row per observation:

```text
run_id,timestamp_ms,event,sequence,command_sent_ms,ar_x_m,ar_z_m,encoder_x_m,encoder_z_m,battery_mv,temperature_c,stopped
```

Use `event=telemetry` for telemetry samples and `event=stop` for the stop command. Missing optional measurements are reported as unavailable rather than treated as passing.

## Automated analysis

From the repository root:

```bash
python3 tools/iphone-rover/validate_rover.py path/to/rover-log.csv
```

The tool reports:

- command-to-telemetry latency (target p95 <= 150 ms)
- stop-event response evidence and measured final displacement when present
- runtime from the first to last sample
- maximum observed temperature
- ARKit-versus-encoder endpoint error
- repeatability spread across runs

The tool intentionally does not invent pass/fail results when the log has no physical samples.

## Prototype go/no-go

Proceed to a refined prototype only if the physical test demonstrates reliable stop-on-timeout behavior, no controller resets, useful runtime, bounded endpoint drift on the intended floor, and repeatable course completion. A camera-only demo that cannot stop safely or loses tracking on the target floor is not a successful autonomous prototype.
