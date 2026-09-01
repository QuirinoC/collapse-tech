import Foundation
import PixelboardCore
import UIKit
import UserNotifications

@MainActor
final class PushNotificationCoordinator: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = PushNotificationCoordinator()

    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    var onOpenPosition: ((BoardPosition) -> Void)?

    private let center = UNUserNotificationCenter.current()
    private let installationKey = "pixelboard.push.installation-id"
    private var api: PixelboardAPIClient?
    private var registeredToken: String?
    private var registrationGeneration: UInt64 = 0
    private var registrationTask: Task<Void, Never>?

    override private init() {
        super.init()
        center.delegate = self
    }

    var notificationsEnabled: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    func prepare(api: PixelboardAPIClient) async {
        self.api = api
        await refreshAuthorizationStatus()
        if authorizationStatus == .authorized || authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func requestPermission(api: PixelboardAPIClient) async -> Bool {
        self.api = api
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound])
            await refreshAuthorizationStatus()
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            return false
        }
    }

    func unregister(api: PixelboardAPIClient) async throws {
        registrationGeneration &+= 1
        self.api = nil
        registrationTask?.cancel()
        await registrationTask?.value
        registrationTask = nil
        if let installationId = existingInstallationId {
            try await api.removePushDevice(installationId: installationId)
        }
        registeredToken = nil
        self.api = nil
    }

    func resetAfterAccountDeletion() async {
        registrationGeneration &+= 1
        api = nil
        registrationTask?.cancel()
        await registrationTask?.value
        registrationTask = nil
        registeredToken = nil
        api = nil
    }

    nonisolated func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor [weak self] in
            guard let self, let api else { return }
            let generation = self.registrationGeneration
            registeredToken = token
            guard generation == self.registrationGeneration,
                  let installationId = self.installationId else { return }
            registrationTask = Task { [weak self] in
                guard let self else { return }
                try? await api.registerPushDevice(
                    installationId: installationId,
                    token: token,
                    environment: Self.apnsEnvironment,
                    bundleId: AppConfiguration.bundleIdentifier)
                guard generation == self.registrationGeneration else { return }
                self.registrationTask = nil
            }
        }
    }

    nonisolated func didFailToRegister(error: Error) {
        Task { @MainActor [weak self] in
            self?.registeredToken = nil
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let payload = response.notification.request.content.userInfo["pixelboard"]
                as? [String: Any],
              let row = payload["row"] as? Int,
              let column = payload["column"] as? Int else {
            return
        }
        onOpenPosition?(BoardPosition(row: row, column: column))
    }

    private var installationId: UUID? {
        if let raw = UserDefaults.standard.string(forKey: installationKey) {
            return UUID(uuidString: raw)
        }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString, forKey: installationKey)
        return id
    }

    private var existingInstallationId: UUID? {
        guard let raw = UserDefaults.standard.string(forKey: installationKey) else {
            return nil
        }
        return UUID(uuidString: raw)
    }

    private static var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    private func refreshAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }
}

final class PushNotificationAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { @MainActor in
            _ = PushNotificationCoordinator.shared
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushNotificationCoordinator.shared.didRegister(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotificationCoordinator.shared.didFailToRegister(error: error)
    }
}
