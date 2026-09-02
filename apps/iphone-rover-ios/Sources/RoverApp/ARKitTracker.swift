import ARKit
import Combine
import Foundation

struct RoverPose: Equatable {
    let x: Float
    let y: Float
    let z: Float
    let yaw: Float
}

final class ARKitTracker: NSObject, ObservableObject {
    let session = ARSession()
    @Published private(set) var pose: RoverPose?
    @Published private(set) var trackingDescription = "Not started"
    @Published private(set) var hasSceneDepth = false

    func start() {
        guard ARWorldTrackingConfiguration.isSupported else {
            trackingDescription = "World tracking unavailable"
            return
        }

        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
            hasSceneDepth = true
        }
        session.delegate = self
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        trackingDescription = hasSceneDepth
            ? "World tracking + LiDAR depth"
            : "World tracking (RGB + IMU)"
    }

    func stop() {
        session.pause()
        pose = nil
        trackingDescription = "Paused"
    }
}

extension ARKitTracker: ARSessionDelegate {
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let transform = frame.camera.transform
        let yaw = atan2(transform.columns.0.z, transform.columns.0.x)
        let nextPose = RoverPose(
            x: transform.columns.3.x,
            y: transform.columns.3.y,
            z: transform.columns.3.z,
            yaw: yaw
        )
        DispatchQueue.main.async { [weak self] in
            self?.pose = nextPose
            self?.trackingDescription = self?.description(for: frame.camera.trackingState)
                ?? "Tracking"
        }
    }

    private func description(for state: ARCamera.TrackingState) -> String {
        switch state {
        case .normal:
            return hasSceneDepth ? "Tracking + LiDAR depth" : "Tracking (RGB + IMU)"
        case .notAvailable:
            return "Tracking unavailable"
        case .limited(let reason):
            switch reason {
            case .initializing: return "Tracking initializing"
            case .relocalizing: return "Tracking relocalizing"
            case .excessiveMotion: return "Tracking limited: slow down"
            case .insufficientFeatures: return "Tracking limited: add visual texture"
            case .insufficientLight: return "Tracking limited: add light"
            @unknown default: return "Tracking limited"
            }
        }
    }
}
