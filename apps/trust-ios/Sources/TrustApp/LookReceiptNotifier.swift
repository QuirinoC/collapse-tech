import Foundation
import TrustCore
import UIKit
import UserNotifications

@MainActor
final class LookReceiptNotifier: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published var authorization: UNAuthorizationStatus = .notDetermined

    private let installationKey = "trust.push.installation-id"
    private var client: TrustClient?
    private var registeredToken: String?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        refreshStatus()
    }

    func prepare(client: TrustClient) {
        self.client = client
        refreshStatus()
        if authorization == .authorized || authorization == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func refreshStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.authorization = settings.authorizationStatus
            }
        }
    }

    func requestPermission() async {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
        refreshStatus()
        if authorization == .authorized || authorization == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func unregister() async {
        if let installationId {
            try? await client?.removePushDevice(installationId: installationId)
        }
        registeredToken = nil
        client = nil
        cancelTimedEnd()
    }

    private static let timedEndIdentifier = "trust.timed-share.end"

    /// Local notice when a For a while share seals again. One pending request at a time —
    /// the newest timer wins, which matches the server (one timed overlay per edge, latest set).
    func scheduleTimedEnd(at date: Date) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.timedEndIdentifier])
        let content = UNMutableNotificationContent()
        content.title = TrustCopy.appName
        content.body = TrustCopy.timerEnded
        content.sound = .default
        let interval = max(1, date.timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        center.add(UNNotificationRequest(identifier: Self.timedEndIdentifier, content: content, trigger: trigger))
    }

    func cancelTimedEnd() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.timedEndIdentifier])
    }

    nonisolated func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            registeredToken = token
            guard let client, let installationId else { return }
            try? await client.registerPushDevice(
                installationId: installationId,
                token: token,
                environment: Self.apnsEnvironment
            )
        }
    }

    nonisolated func didFailToRegister(error: Error) {
        Task { @MainActor in
            registeredToken = nil
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .list])
    }

    private var installationId: UUID? {
        if let raw = UserDefaults.standard.string(forKey: installationKey),
           let id = UUID(uuidString: raw) {
            return id
        }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString, forKey: installationKey)
        return id
    }

    private static var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
}

final class TrustAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        LookReceiptNotifier.shared?.didRegister(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        LookReceiptNotifier.shared?.didFailToRegister(error: error)
    }
}

extension LookReceiptNotifier {
    static var shared: LookReceiptNotifier?
}
