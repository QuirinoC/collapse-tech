import Foundation

public enum RoverConnectionState: Equatable, Sendable {
    case disconnected
    case scanning
    case connecting
    case connected
    case fault(String)
}

public enum RoverSafetyState: Equatable, Sendable {
    case ready
    case obstacle
    case emergencyStop
    case staleTelemetry
}

public struct RoverSafetyMonitor: Sendable {
    public var telemetryTimeout: TimeInterval = 1.0

    public init(telemetryTimeout: TimeInterval = 1.0) {
        self.telemetryTimeout = telemetryTimeout
    }

    public func state(
        telemetry: RoverTelemetry?,
        now: Date = Date(),
        lastTelemetryAt: Date?
    ) -> RoverSafetyState {
        guard let telemetry, let lastTelemetryAt else {
            return .staleTelemetry
        }

        if telemetry.emergencyStop {
            return .emergencyStop
        }

        if now.timeIntervalSince(lastTelemetryAt) > telemetryTimeout {
            return .staleTelemetry
        }

        return .ready
    }
}
