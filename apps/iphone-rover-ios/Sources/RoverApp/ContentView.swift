import SwiftUI
import Foundation

struct ContentView: View {
    @EnvironmentObject private var model: RoverSessionModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    statusCard
                    CameraPreview(session: model.camera.session)
                        .frame(height: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .bottomLeading) {
                            Text(model.latestObservation.map {
                                "\($0.label) \(Int($0.confidence * 100))%"
                            } ?? "No target")
                            .font(.caption.monospaced())
                            .padding(8)
                            .background(.black.opacity(0.65))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .padding(10)
                        }

                    Picker("Drive mode", selection: modeBinding) {
                        ForEach(RoverDriveMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    calibrationCard

                    if model.mode == .manual {
                        JoystickView { linear, angular in
                            model.drive(linear: linear, angular: angular)
                        } onRelease: {
                            model.stop()
                        }
                        .frame(height: 220)
                    } else {
                        Text("Target follow is intentionally slow. The rover stops when the target is lost.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        model.stop()
                    } label: {
                        Label("Stop motors", systemImage: "octagon.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }
                .padding()
            }
            .navigationTitle("iPhone Rover")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(
                        model.connectionState == .connected ? "Disconnect" : "Connect",
                        action: model.toggleConnection
                    )
                }
            }
            .onAppear(perform: model.startSensors)
            .onDisappear(perform: model.stopSensors)
        }
    }

    private var modeBinding: Binding<RoverDriveMode> {
        Binding(
            get: { model.mode },
            set: { model.setMode($0) }
        )
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(connectionText, systemImage: connectionIcon)
                    .foregroundStyle(connectionColor)
                Spacer()
                Text(batteryText)
                    .font(.caption.monospaced())
            }
            Text("ARKit: \(model.tracker.trackingDescription)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(model.tracker.hasSceneDepth
                 ? "LiDAR depth available"
                 : "RGB + IMU mode; LiDAR optional")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Vision: \(visionText)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var calibrationCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Autonomy calibration")
                .font(.headline)
            HStack {
                Text("Max speed")
                Slider(value: maxSpeedBinding, in: 0.03...0.30)
                Text(String(format: "%.2f", model.calibration.maximumLinearSpeed))
                    .font(.caption.monospaced())
                    .frame(width: 40)
            }
            HStack {
                Text("Steering")
                Slider(value: steeringGainBinding, in: 0.5...3.5)
                Text(String(format: "%.1f", model.calibration.steeringGain))
                    .font(.caption.monospaced())
                    .frame(width: 40)
            }
            HStack {
                Text("Stop area")
                Slider(value: stopAreaBinding, in: 0.05...0.75)
                Text(String(format: "%.2f", model.calibration.stopArea))
                    .font(.caption.monospaced())
                    .frame(width: 40)
            }
            Button("Use current target size") {
                model.captureTargetSize()
            }
            .font(.caption)
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var maxSpeedBinding: Binding<Double> {
        Binding(
            get: { model.calibration.maximumLinearSpeed },
            set: { value in
                var calibration = model.calibration
                calibration.maximumLinearSpeed = value
                model.updateCalibration(calibration)
            }
        )
    }

    private var steeringGainBinding: Binding<Double> {
        Binding(
            get: { model.calibration.steeringGain },
            set: { value in
                var calibration = model.calibration
                calibration.steeringGain = value
                model.updateCalibration(calibration)
            }
        )
    }

    private var stopAreaBinding: Binding<Double> {
        Binding(
            get: { model.calibration.stopArea },
            set: { value in
                var calibration = model.calibration
                calibration.stopArea = value
                model.updateCalibration(calibration)
            }
        )
    }

    private var connectionText: String {
        switch model.connectionState {
        case .disconnected: return "Disconnected"
        case .scanning: return "Scanning"
        case .connecting: return "Connecting"
        case .connected: return "Connected"
        case .fault(let message): return message
        }
    }

    private var connectionIcon: String {
        model.connectionState == .connected ? "checkmark.circle.fill" : "antenna.radiowaves.left.and.right"
    }

    private var connectionColor: Color {
        model.connectionState == .connected ? .green : .secondary
    }

    private var batteryText: String {
        guard let telemetry = model.telemetry else { return "-- mV" }
        return "\(telemetry.batteryMillivolts) mV"
    }

    private var visionText: String {
        switch model.inferenceStatus {
        case .coreMLModelLoaded: return "Core ML model loaded"
        case .rectangleFallback: return "rectangle fallback (add RoverDetector.mlmodel)"
        case .unavailable(let error): return error
        }
    }
}

private struct JoystickView: View {
    let onMove: (Double, Double) -> Void
    let onRelease: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Circle()
                    .fill(.secondary.opacity(0.15))
                    .overlay(Circle().stroke(.secondary.opacity(0.3), lineWidth: 2))
                Image(systemName: "joystick")
                    .font(.system(size: 52))
                    .foregroundStyle(.tint)
            }
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let center = CGPoint(
                            x: geometry.size.width / 2,
                            y: geometry.size.height / 2
                        )
                        let dx = (value.location.x - center.x) / (geometry.size.width / 2)
                        let dy = (value.location.y - center.y) / (geometry.size.height / 2)
                        onMove(
                            -min(max(Double(dy), -1), 1),
                            min(max(Double(dx), -1), 1)
                        )
                    }
                    .onEnded { _ in onRelease() }
            )
        }
    }
}
