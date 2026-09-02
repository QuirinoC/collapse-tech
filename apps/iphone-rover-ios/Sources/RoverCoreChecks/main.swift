import Foundation
import RoverCore

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    precondition(condition(), message)
}

let command = MotorCommand(sequence: 12, left: 1200, right: -1400)
check(
    String(data: command.wireData, encoding: .utf8) == "M,12,1000,-1000\n",
    "motor command wire format"
)

let telemetry = RoverTelemetry(
    wireData: Data("T,22,-14,33,7420,1,45\n".utf8)
)
check(
    telemetry == RoverTelemetry(
        sequence: 22,
        leftTicks: -14,
        rightTicks: 33,
        batteryMillivolts: 7420,
        emergencyStop: true,
        commandAgeMilliseconds: 45
    ),
    "telemetry parsing"
)
check(
    RoverTelemetry(wireData: Data("garbage".utf8)) == nil,
    "malformed telemetry rejection"
)

let mixedDrive = DifferentialDrive.command(sequence: 1, linear: 1, angular: 1)
check(mixedDrive.left == 0 && mixedDrive.right == 1000, "drive normalization")

let now = Date()
let monitor = RoverSafetyMonitor(telemetryTimeout: 1)
let stopTelemetry = RoverTelemetry(
    sequence: 1,
    leftTicks: 0,
    rightTicks: 0,
    batteryMillivolts: 7600,
    emergencyStop: true,
    commandAgeMilliseconds: 0
)
check(
    monitor.state(telemetry: stopTelemetry, now: now, lastTelemetryAt: now)
        == .emergencyStop,
    "emergency stop safety state"
)
check(
    monitor.state(telemetry: nil, now: now, lastTelemetryAt: nil)
        == .staleTelemetry,
    "stale telemetry safety state"
)

print("RoverCoreChecks: all checks passed")
