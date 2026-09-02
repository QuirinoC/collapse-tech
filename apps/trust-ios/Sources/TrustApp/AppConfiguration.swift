import Foundation
import UIKit

enum AppConfiguration {
    static let monthlyProductID = "com.collapsetechnologies.trust.circle.monthly"
    static let annualProductID = "com.collapsetechnologies.trust.circle.annual"
    static let bundleIdentifier = "com.collapsetechnologies.trust"
    static let monthlyDisplayPrice = "$7.99"
    static let annualDisplayPrice = "$69.99"
    static let manageSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!
    static let productionAPIURL = URL(string: "https://trust.collapsetechnologies.com")!
    static let localAPIURL = URL(string: "http://127.0.0.1:5088")!
    static let legalSiteURL = URL(string: "https://collapsetechnologies.com/trust")!
    static let privacyURL = URL(string: "https://collapsetechnologies.com/trust/privacy")!
    static let termsURL = URL(string: "https://collapsetechnologies.com/trust/terms")!
    static let supportURL = URL(string: "https://collapsetechnologies.com/trust/support")!
    static let marketingURL = URL(string: "https://collapsetechnologies.com/trust")!

    static let requestTimeout: TimeInterval = 15
    static let healthProbeTimeout: TimeInterval = 3

    static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }

    /// Build setting, scheme env, or Debug/Release default.
    /// Physical Debug builds must not use loopback — that is the phone, not the Mac API.
    static var apiBaseURL: URL {
        remapLoopbackOnDevice(configuredAPIBaseURL)
    }

    static var usesProductionAPI: Bool {
        apiBaseURL.host?.contains("collapsetechnologies.com") == true
    }

    static var apiHostDescription: String {
        apiBaseURL.host ?? apiBaseURL.absoluteString
    }

    static func isLoopback(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        return host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"
    }

    static func debugAPICandidates(preferred: URL = apiBaseURL) -> [URL] {
        var urls: [URL] = [preferred]
        #if DEBUG
        if isSimulator, preferred != localAPIURL {
            urls.append(localAPIURL)
        }
        if preferred != productionAPIURL {
            urls.append(productionAPIURL)
        }
        #endif
        var seen = Set<String>()
        return urls.filter { seen.insert($0.absoluteString).inserted }
    }

    static func isAPILive(_ base: URL) async -> Bool {
        guard let url = URL(string: "/health/live", relativeTo: base)?.absoluteURL else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = healthProbeTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = healthProbeTimeout
        config.timeoutIntervalForResource = healthProbeTimeout
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }
        do {
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }

    static func firstReachableAPI(preferred: URL = apiBaseURL) async -> URL? {
        for url in debugAPICandidates(preferred: preferred) {
            if await isAPILive(url) { return url }
        }
        return nil
    }

    private static var configuredAPIBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["TRUST_BASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !override.isEmpty,
           let url = URL(string: override) {
            return url
        }
        if let raw = Bundle.main.object(forInfoDictionaryKey: "TRUST_BASE_URL") as? String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty,
               !trimmed.hasPrefix("$("),
               let url = URL(string: trimmed) {
                return url
            }
        }
        #if DEBUG
        return isSimulator ? localAPIURL : productionAPIURL
        #else
        return productionAPIURL
        #endif
    }

    private static func remapLoopbackOnDevice(_ url: URL) -> URL {
        #if DEBUG
        if !isSimulator, isLoopback(url) {
            return productionAPIURL
        }
        #endif
        return url
    }
}
