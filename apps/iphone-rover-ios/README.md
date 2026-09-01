# iPhone Rover iOS app

This app is the camera, on-device vision loop, and BLE controller for the iPhone Rover prototype.

## Build

The project is generated with XcodeGen:

```bash
xcodegen generate
open iPhoneRover.xcodeproj
```

Select a physical iPhone. The simulator cannot provide the camera, Bluetooth, or ARKit behavior required by the rover.

The app starts an `AVCaptureSession`, starts an ARKit world-tracking session, and scans for the `iPhone Rover` BLE service. The `RoverDetector.mlmodel` resource is optional. Without it, the app uses a rectangle-detection fallback so the control and camera loop can be tested before a custom detector is trained.

## Autonomy boundary

The first autonomous mode is target following at a capped speed. The phone sends desired left/right motor values; the ESP32 owns PWM, encoder handling, watchdog timeout, bumper blocking, and emergency-stop behavior. If the target disappears, the app sends a stop command, while the firmware independently stops when commands become stale.

LiDAR is an enhancement, not a requirement. ARKit reports world tracking and scene depth when the device supports it; camera-only iPhones remain in RGB + IMU mode.

## Add a detector

Train a small detector for the intended target, export it as a Core ML model, name the compiled resource `RoverDetector.mlmodelc`, and add the source `.mlmodel` to the application target. The app will load it automatically and route inference through Vision/Core ML.

## Permissions

The app only requests camera and Bluetooth permissions. It uses BLE directly, so the first draft does not require local-network access or Bonjour configuration.
