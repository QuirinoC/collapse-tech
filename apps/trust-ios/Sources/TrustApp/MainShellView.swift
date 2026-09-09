import SwiftUI
import TrustCore

/// List-first shell: Circle · Sharing · Invite · You + Masthead.
/// Native `TabView` for top-level navigation (HIG: tab bars are for navigation, with labels + SF Symbols).
struct MainShellView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(spacing: 0) {
            masthead
            TabView(selection: $model.selectedTab) {
                HomeView()
                    .tabItem {
                        Label(MainTab.circle.title, systemImage: MainTab.circle.systemImage)
                    }
                    .tag(MainTab.circle)
                    .accessibilityLabel(MainTab.circle.title)

                SharingView()
                    .tabItem {
                        Label(MainTab.sharing.title, systemImage: MainTab.sharing.systemImage)
                    }
                    .tag(MainTab.sharing)
                    .accessibilityLabel(MainTab.sharing.title)

                InviteView()
                    .tabItem {
                        Label(MainTab.invite.title, systemImage: MainTab.invite.systemImage)
                    }
                    .tag(MainTab.invite)
                    .accessibilityLabel(MainTab.invite.title)

                SettingsView(embedded: true)
                    .tabItem {
                        Label(MainTab.you.title, systemImage: MainTab.you.systemImage)
                    }
                    .tag(MainTab.you)
                    .accessibilityLabel(MainTab.you.title)
            }
            .tint(palette.accent)
        }
        .background(palette.paper.ignoresSafeArea())
        .onAppear {
            Task { await model.refresh() }
        }
    }

    /// Brand-critical masthead (HIG allows custom brand chrome; system components surround it).
    private var masthead: some View {
        VStack(spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text(mastheadTitle)
                    .font(TrustTheme.display(26))
                    .foregroundStyle(palette.ink)
                    .accessibilityLabel(TrustCopy.appName)
                    .accessibilityAddTraits(.isHeader)
                if model.isDemoMode {
                    TrustFolio(text: TrustCopy.demoBannerTitle, color: palette.accent, size: 9)
                }
                Spacer(minLength: 0)
                if model.selectedTab == .circle, model.beingWatched != nil {
                    TrustFolio(text: TrustCopy.theyAreLooking, color: palette.accent, size: 10)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .frame(minHeight: 44)

            Rectangle()
                .fill(palette.accent)
                .frame(height: 2)
                .accessibilityHidden(true)
        }
        .background(palette.paper)
    }

    private var mastheadTitle: String {
        model.selectedTab == .you ? TrustCopy.you : TrustCopy.mastheadName
    }
}
