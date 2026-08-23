import Foundation

enum AppConfiguration {
    static let baseURL: URL = {
        if let value = ProcessInfo.processInfo.environment["PIXELBOARD_BASE_URL"],
           let url = URL(string: value) {
            return url
        }
        if let value = Bundle.main.object(forInfoDictionaryKey: "PixelboardBaseURL") as? String,
           let url = URL(string: value) {
            return url
        }
        return URL(string: "https://pixelboard.collapsetechnologies.com")!
    }()

    static let monthlyProductID = "com.collapsetechnologies.pixelboard.pro.monthly"
    static let annualProductID = "com.collapsetechnologies.pixelboard.pro.annual"

    // Ads require an explicit code change plus an app-local AdMob unit ID.
    static let adsEnabled = false
    static let adMobMaximumContentRating = "G"
}
