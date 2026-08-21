import Foundation

enum AppConfiguration {
    static let baseURL: URL = {
        if let value = ProcessInfo.processInfo.environment["PIXELBOARD_BASE_URL"],
           let url = URL(string: value) {
            return url
        }
        return URL(string: "https://pixelboard.example.invalid")!
    }()

    static let monthlyProductID = "com.collapse.infinitepixelboard.pro.monthly"
    static let annualProductID = "com.collapse.infinitepixelboard.pro.annual"

    // Ads require an explicit code change plus an app-local AdMob unit ID.
    static let adsEnabled = false
    static let adMobMaximumContentRating = "G"
}
