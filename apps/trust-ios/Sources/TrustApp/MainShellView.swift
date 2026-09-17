import SwiftUI
import TrustCore

/// T1–T4 shell: "Trust." masthead with a caption that follows the route, native `TabView`,
/// offline strip, toast. Sheets that can open from any tab live here.
struct MainShellView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(spacing: 0) {
            masthead
            if model.isOffline, let since = model.snapshot?.fetchedAt {
                TrustOfflineBanner(since: since) {
                    Task { await model.refresh() }
                }
            }
            TabView(selection: $model.selectedTab) {
                CircleView()
                    .tabItem { Label(MainTab.circle.title, systemImage: MainTab.circle.systemImage) }
                    .tag(MainTab.circle)

                SharingView()
                    .tabItem { Label(MainTab.sharing.title, systemImage: MainTab.sharing.systemImage) }
                    .tag(MainTab.sharing)

                InviteView()
                    .tabItem { Label(MainTab.invite.title, systemImage: MainTab.invite.systemImage) }
                    .tag(MainTab.invite)

                YouView()
                    .tabItem { Label(MainTab.you.title, systemImage: MainTab.you.systemImage) }
                    .tag(MainTab.you)
            }
            .tint(palette.accent)
        }
        .background(palette.paper.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                TrustToastView(toast: toast) { model.toast = nil }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 62)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.22), value: model.toast?.id)
        .onAppear {
            Task { await model.refresh() }
        }
        .sheet(item: $model.lookSubject) { subject in
            LookConfirmSheet(subject: subject)
                .environmentObject(model)
                .environment(\.trustPalette, palette)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
                .presentationCornerRadius(28)
                .trustFormSheet()
        }
        .sheet(isPresented: $model.showingViewLog) {
            NavigationStack {
                ViewLogView(inSheet: true)
            }
            .environmentObject(model)
            .environment(\.trustPalette, palette)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(palette.paper)
            .trustFormSheet()
        }
        .sheet(isPresented: $model.showingPaywall) {
            PlusPaywall()
                .environmentObject(model)
                .environment(\.trustPalette, palette)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
                .trustFormSheet()
        }
        .sheet(isPresented: $model.showingAlwaysExplainer) {
            AlwaysExplainerSheet()
                .environmentObject(model)
                .environment(\.trustPalette, palette)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
                .trustFormSheet()
        }
        .sheet(item: timedShareTarget) { target in
            DurationSheet(personID: target.id)
                .environmentObject(model)
                .environment(\.trustPalette, palette)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
                .trustFormSheet()
        }
    }

    private struct TimedShareTarget: Identifiable {
        let id: UUID
    }

    private var timedShareTarget: Binding<TimedShareTarget?> {
        Binding(
            get: { model.timedSharePersonID.map(TimedShareTarget.init) },
            set: { model.timedSharePersonID = $0?.id }
        )
    }

    /// `.app-header`: wordmark left, route caption right.
    private var masthead: some View {
        HStack(alignment: .center) {
            TrustWordmarkTitle(size: 34)
            if model.isDemoMode, !model.isScreenshotLaunch {
                TrustEyebrow(text: TrustCopy.demoBannerTitle, color: palette.accent, size: 9)
                    .padding(.leading, 8)
            }
            Spacer(minLength: 0)
            Text(caption.uppercased())
                .font(TrustTheme.folio(9))
                .tracking(1.2)
                .foregroundStyle(Color(hex: 0x73756C))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, TrustTheme.gutter)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(palette.paper)
    }

    private var caption: String {
        switch model.selectedTab {
        case .circle:
            if model.circlePath.last == .map { return TrustCopy.map }
            return TrustCopy.circle
        case .sharing: return TrustCopy.sharing
        case .invite: return TrustCopy.inviteTab
        case .you: return TrustCopy.you
        }
    }
}
