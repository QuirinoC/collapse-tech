import SwiftUI

protocol AdvertisingBannerProvider {
    associatedtype Banner: View
    @ViewBuilder func banner() -> Banner
}

struct ReservedAdBanner: View {
    let tier: AccountTierView

    var body: some View {
        if AppConfiguration.adsEnabled, tier != .pro {
            Text(PixelboardL10n.advertisement)
                .font(PixelboardTheme.mono(8))
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(PixelboardTheme.muted)
                .frame(maxWidth: .infinity, minHeight: 50)
                .padding(5)
                .background(PixelboardTheme.paper.opacity(0.88))
                .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                .accessibilityLabel(PixelboardL10n.advertisement)
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
