import CoreLocation
import Foundation
import TrustCore

final class LocationCoordinator: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let precisePurposeKey = "PreciseEscrow"

    @Published var authorization: CLAuthorizationStatus = .notDetermined
    @Published var accuracyAuthorization: CLAccuracyAuthorization = .fullAccuracy
    @Published var lastFix: LocationPoint?
    @Published var isUsingSimulatorFeed = true
    @Published var isSharing = false

    var onLocations: (([LocationPoint]) -> Void)?

    private let manager = CLLocationManager()
    private let alwaysAskedKey = "trust.location.didRequestAlways"
    private var isMapActive = false
    private var isAppActive = true
    private var pendingAlwaysAfterWhenInUse = false
    private var awaitingAlwaysAnswer = false
    private var didRequestPreciseThisSession = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 50
        manager.pausesLocationUpdatesAutomatically = true
        manager.showsBackgroundLocationIndicator = false
        manager.allowsBackgroundLocationUpdates = false
        authorization = manager.authorizationStatus
        accuracyAuthorization = manager.accuracyAuthorization
    }

    var hasAccess: Bool {
        authorization == .authorizedAlways || authorization == .authorizedWhenInUse
    }

    var hasAlways: Bool {
        authorization == .authorizedAlways
    }

    var isPrecise: Bool {
        accuracyAuthorization == .fullAccuracy
    }

    var isDenied: Bool {
        authorization == .denied || authorization == .restricted
    }

    var needsAlwaysForSharing: Bool {
        isSharing && authorization == .authorizedWhenInUse
    }

    var needsSystemSettings: Bool {
        if isDenied { return true }
        return isSharing && authorization == .authorizedWhenInUse && didRequestAlwaysUpgrade
    }

    var statusLabel: String {
        switch authorization {
        case .authorizedAlways: return TrustCopy.always
        case .authorizedWhenInUse: return TrustCopy.whileUsing
        case .denied, .restricted: return TrustCopy.denied
        case .notDetermined: return TrustCopy.notAsked
        @unknown default: return TrustCopy.unknown
        }
    }

    var accuracyLabel: String {
        isPrecise ? TrustCopy.precise : TrustCopy.approximate
    }

    func setMapActive(_ active: Bool) {
        isMapActive = active
        applyTracking()
    }

    func setAppActive(_ active: Bool) {
        isAppActive = active
        applyTracking()
    }

    func setSharing(_ sharing: Bool) {
        isSharing = sharing
        if sharing {
            requestPreciseIfNeeded()
        } else {
            didRequestPreciseThisSession = false
        }
        applyTracking()
    }

    func requestWhenInUse() {
        guard authorization == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    func requestAlways() {
        switch authorization {
        case .notDetermined:
            pendingAlwaysAfterWhenInUse = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            awaitingAlwaysAnswer = true
            manager.requestAlwaysAuthorization()
        case .authorizedAlways:
            applyTracking()
        default:
            break
        }
    }

    func requestPrecise() {
        guard hasAccess, !isPrecise else { return }
        didRequestPreciseThisSession = true
        manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.precisePurposeKey) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.accuracyAuthorization = self.manager.accuracyAuthorization
                self.applyTracking()
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async {
            self.authorization = manager.authorizationStatus
            self.accuracyAuthorization = manager.accuracyAuthorization
            if self.awaitingAlwaysAnswer {
                self.awaitingAlwaysAnswer = false
                if self.authorization == .authorizedWhenInUse || self.isDenied {
                    self.didRequestAlwaysUpgrade = true
                }
            }
            if self.pendingAlwaysAfterWhenInUse, self.authorization == .authorizedWhenInUse {
                self.pendingAlwaysAfterWhenInUse = false
                self.requestAlways()
            } else if self.pendingAlwaysAfterWhenInUse, self.isDenied {
                self.pendingAlwaysAfterWhenInUse = false
            }
            self.requestPreciseIfNeeded()
            self.applyTracking()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let points = locations.map {
            LocationPoint(
                timestamp: $0.timestamp,
                latitude: $0.coordinate.latitude,
                longitude: $0.coordinate.longitude
            )
        }
        DispatchQueue.main.async {
            if let last = points.last {
                self.lastFix = last
                self.isUsingSimulatorFeed = false
            }
            if !points.isEmpty {
                self.onLocations?(points)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.isUsingSimulatorFeed = true
        }
    }

    private var wantsBackground: Bool {
        isSharing && authorization == .authorizedAlways
    }

    private var wantsForegroundUpdates: Bool {
        hasAccess && isAppActive && (isMapActive || isSharing)
    }

    private func applyTracking() {
        let background = wantsBackground
        manager.allowsBackgroundLocationUpdates = background
        manager.showsBackgroundLocationIndicator = background
        manager.pausesLocationUpdatesAutomatically = !background
        if background {
            manager.desiredAccuracy = kCLLocationAccuracyBest
            manager.distanceFilter = 25
            manager.startUpdatingLocation()
            manager.startMonitoringSignificantLocationChanges()
        } else if wantsForegroundUpdates {
            manager.desiredAccuracy = isSharing ? kCLLocationAccuracyBest : kCLLocationAccuracyHundredMeters
            manager.distanceFilter = isSharing ? 25 : 50
            manager.startUpdatingLocation()
            manager.stopMonitoringSignificantLocationChanges()
        } else {
            manager.stopUpdatingLocation()
            manager.stopMonitoringSignificantLocationChanges()
            if !hasAccess {
                isUsingSimulatorFeed = true
            }
        }
    }

    private func requestPreciseIfNeeded() {
        guard isSharing, hasAccess, !isPrecise, !didRequestPreciseThisSession else { return }
        requestPrecise()
    }

    private var didRequestAlwaysUpgrade: Bool {
        get { UserDefaults.standard.bool(forKey: alwaysAskedKey) }
        set { UserDefaults.standard.set(newValue, forKey: alwaysAskedKey) }
    }
}
