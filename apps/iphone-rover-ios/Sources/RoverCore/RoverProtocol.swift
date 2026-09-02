import Foundation

public enum RoverBluetooth {
    public static let service = "8f9a0000-4a0a-4a4a-9f6d-0f6d2b2f1000"
    public static let command = "8f9a0001-4a0a-4a4a-9f6d-0f6d2b2f1000"
    public static let telemetry = "8f9a0002-4a0a-4a4a-9f6d-0f6d2b2f1000"
}

public struct MotorCommand: Equatable, Sendable {
    public let sequence: UInt32
    public let left: Int16
    public let right: Int16

    public init(sequence: UInt32, left: Int16, right: Int16) {
        self.sequence = sequence
        self.left = Self.clamp(left)
        self.right = Self.clamp(right)
    }

    public var wireData: Data {
        Data("M,\(sequence),\(left),\(right)\n".utf8)
    }

    private static func clamp(_ value: Int16) -> Int16 {
        min(max(value, -1000), 1000)
    }
}

public struct RoverTelemetry: Equatable, Sendable {
    public let sequence: UInt32
    public let leftTicks: Int32
    public let rightTicks: Int32
    public let batteryMillivolts: UInt16
    public let emergencyStop: Bool
    public let commandAgeMilliseconds: UInt32

    public init(
        sequence: UInt32,
        leftTicks: Int32,
        rightTicks: Int32,
        batteryMillivolts: UInt16,
        emergencyStop: Bool,
        commandAgeMilliseconds: UInt32
    ) {
        self.sequence = sequence
        self.leftTicks = leftTicks
        self.rightTicks = rightTicks
        self.batteryMillivolts = batteryMillivolts
        self.emergencyStop = emergencyStop
        self.commandAgeMilliseconds = commandAgeMilliseconds
    }

    public init?(wireData: Data) {
        guard let line = String(data: wireData, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        else {
            return nil
        }

        let fields = line.split(separator: ",")
        guard fields.count == 7,
              fields[0] == "T",
              let sequence = UInt32(fields[1]),
              let leftTicks = Int32(fields[2]),
              let rightTicks = Int32(fields[3]),
              let batteryMillivolts = UInt16(fields[4]),
              let stopValue = UInt8(fields[5]),
              let age = UInt32(fields[6]),
              stopValue <= 1
        else {
            return nil
        }

        self.init(
            sequence: sequence,
            leftTicks: leftTicks,
            rightTicks: rightTicks,
            batteryMillivolts: batteryMillivolts,
            emergencyStop: stopValue == 1,
            commandAgeMilliseconds: age
        )
    }
}

public enum DifferentialDrive {
    public static func command(
        sequence: UInt32,
        linear: Double,
        angular: Double
    ) -> MotorCommand {
        let safeLinear = min(max(linear, -1), 1)
        let safeAngular = min(max(angular, -1), 1)
        let left = safeLinear - safeAngular
        let right = safeLinear + safeAngular
        let scale = max(1, abs(left), abs(right))

        return MotorCommand(
            sequence: sequence,
            left: Int16((left / scale * 1000).rounded()),
            right: Int16((right / scale * 1000).rounded())
        )
    }
}
