import SwiftUI

protocol AdvertisingBannerProvider {
    associatedtype Banner: View
    @ViewBuilder func banner() -> Banner
}

struct ReservedAdBanner: View {
    let tier: AccountTierView

    var body: some View {
        if AppConfiguration.adsEnabled, tier != .pro {
            Text("Advertisement")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: 50)
                .accessibilityLabel("Advertisement")
        }
    }
}

enum AccountTierView {
    case anonymous
    case free
    case pro
}

#if canImport(GoogleMobileAds)
import GoogleMobileAds

// The AdMob SDK is intentionally not linked by default. A release adapter must set
// GADRequestConfiguration.maxAdContentRating to AppConfiguration.adMobMaximumContentRating
// before loading the app-local banner unit ID.
#endif
