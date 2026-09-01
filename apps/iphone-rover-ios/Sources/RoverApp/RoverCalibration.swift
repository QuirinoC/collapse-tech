import Foundation

struct RoverCalibration: Codable, Equatable {
    var maximumLinearSpeed = 0.12
    var steeringGain = 1.8
    var stopArea = 0.18

    static let defaults = RoverCalibration()
}

final class RoverCalibrationStore {
    private let key = "iphone-rover.calibration"

    func load() -> RoverCalibration {
        guard let data = UserDefaults.standard.data(forKey: key),
              let calibration = try? JSONDecoder().decode(
                  RoverCalibration.self,
                  from: data
              )
        else {
            return .defaults
        }
        return calibration
    }

    func save(_ calibration: RoverCalibration) {
        guard let data = try? JSONEncoder().encode(calibration) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
