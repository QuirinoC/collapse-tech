import Combine
import Foundation

enum RoverDriveMode: String, CaseIterable {
    case manual = "Manual"
    case targetFollow = "Target follow"
}

final class RoverSessionModel: ObservableObject {
    @Published private(set) var connectionState: RoverConnectionState = .disconnected
    @Published private(set) var telemetry: RoverTelemetry? = nil
    @Published private(set) var latestObservation: RoverVisionObservation? = nil
    @Published private(set) var inferenceStatus: VisionInferenceEngine.EngineStatus
    @Published private(set) var mode: RoverDriveMode = .manual
    @Published private(set) var lastTelemetryAt: Date? = nil
    @Published private(set) var calibration: RoverCalibration

    let camera = CameraCapture()
    let tracker = ARKitTracker()

    private let transport = BluetoothRoverTransport()
    private let vision = VisionInferenceEngine()
    private let calibrationStore = RoverCalibrationStore()
    private var sequence: UInt32 = 0
    private var lastCommandAt = Date.distantPast
    private var cancellables = Set<AnyCancellable>()

    init() {
        inferenceStatus = vision.status
        calibration = calibrationStore.load()
        transport.$connectionState
            .receive(on: DispatchQueue.main)
            .assign(to: &$connectionState)
        transport.$telemetry
            .receive(on: DispatchQueue.main)
            .sink { [weak self] telemetry in
                self?.telemetry = telemetry
                if telemetry != nil {
                    self?.lastTelemetryAt = Date()
                }
            }
            .store(in: &cancellables)

        camera.onFrame = { [weak self] buffer in
            guard let self else { return }
            let observation = self.vision.analyze(buffer)
            DispatchQueue.main.async {
                self.latestObservation = observation
                if self.mode == .targetFollow {
                    self.driveToward(observation)
                }
            }
        }
    }

    func startSensors() {
        camera.start()
        tracker.start()
    }

    func stopSensors() {
        stop()
        camera.stop()
        tracker.stop()
    }

    func toggleConnection() {
        if case .connected = connectionState {
            transport.disconnect()
        } else {
            transport.connect()
        }
    }

    func setMode(_ mode: RoverDriveMode) {
        self.mode = mode
        if mode == .manual {
            stop()
        }
    }

    func updateCalibration(_ calibration: RoverCalibration) {
        self.calibration = calibration
        calibrationStore.save(calibration)
    }

    func captureTargetSize() {
        guard let observation = latestObservation else { return }
        var updated = calibration
        updated.stopArea = min(max(observation.area, 0.03), 0.75)
        updateCalibration(updated)
    }

    func drive(linear: Double, angular: Double) {
        guard mode == .manual else { return }
        send(DifferentialDrive.command(
            sequence: nextSequence(),
            linear: linear,
            angular: angular
        ))
    }

    func stop() {
        send(DifferentialDrive.command(
            sequence: nextSequence(),
            linear: 0,
            angular: 0
        ), force: true)
    }

    private func driveToward(_ observation: RoverVisionObservation?) {
        guard let observation, observation.confidence >= 0.65 else {
            stop()
            return
        }

        // Keep the first autonomous mode deliberately bounded and slow:
        // center the detected target, then approach until it fills the frame.
        let error = Double(observation.centerX - 0.5)
        let angular = min(
            max(error * calibration.steeringGain, -0.65),
            0.65
        )
        let linear = observation.area < calibration.stopArea
            ? min(
                max(calibration.maximumLinearSpeed - abs(error) * 0.15, 0),
                calibration.maximumLinearSpeed
            )
            : 0
        send(DifferentialDrive.command(
            sequence: nextSequence(),
            linear: linear,
            angular: angular
        ))
    }

    private func send(_ command: MotorCommand, force: Bool = false) {
        let now = Date()
        guard force || now.timeIntervalSince(lastCommandAt) >= 0.05 else {
            return
        }
        lastCommandAt = now
        transport.send(command)
    }

    private func nextSequence() -> UInt32 {
        sequence &+= 1
        return sequence
    }
}
