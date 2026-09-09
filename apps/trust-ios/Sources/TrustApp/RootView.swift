import SwiftUI
import TrustCore

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    private var palette: TrustPalette {
        model.appearance.nightEdition ? .night : .paper
    }

    private var lookConfirmTitle: String {
        model.confirmCopy(for: model.lookSubject?.id).title
    }

    private var lookConfirmMessage: String {
        let copy = model.confirmCopy(for: model.lookSubject?.id)
        // Lead with the non-silent receipt promise (product + HIG: clear consequence).
        return "\(TrustCopy.lookWillNotify)\n\n\(copy.body)"
    }

    var body: some View {
        ZStack {
            palette.paper.ignoresSafeArea()
            switch model.phase {
            case .login:
                LoginView()
            case .onboarding:
                OnboardingView()
            case .home:
                MainShellView()
            }
        }
        .environment(\.trustPalette, palette)
        .preferredColorScheme(model.appearance.nightEdition ? .dark : .light)
        .tint(palette.accent)
        .onChange(of: scenePhase) { _, phase in
            model.location.setAppActive(phase == .active)
        }
        .sheet(isPresented: $model.showingLookLog) {
            LookLogView()
                .environmentObject(model)
                .environment(\.trustPalette, palette)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
        }
        // HIG (Alerts / modality): intentional Look uses a confirmation dialog (action sheet),
        // not a custom sheet — clear Confirm + Cancel with notification consequence in the message.
        .confirmationDialog(
            lookConfirmTitle,
            isPresented: $model.showingLookConfirm,
            titleVisibility: .visible
        ) {
            Button(TrustCopy.look) {
                model.confirmLook()
            }
            Button(TrustCopy.cancel, role: .cancel) {
                model.lookSubject = nil
            }
        } message: {
            Text(lookConfirmMessage)
        }
        // Optional secondary map after Look / for live people — not the default home.
        .fullScreenCover(isPresented: $model.showingMap) {
            LookMapView()
                .environmentObject(model)
                .environment(\.trustPalette, palette)
        }
        .overlay(alignment: .top) {
            if let banner = model.quietBanner {
                QuietReceiptBanner(receipt: banner) {
                    model.quietBanner = nil
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.25), value: model.quietBanner?.at)
        .onChange(of: model.quietBanner?.at) { _, _ in
            guard model.quietBanner != nil else { return }
            Task {
                try? await Task.sleep(for: .seconds(4.5))
                model.quietBanner = nil
            }
        }
    }
}

struct QuietReceiptBanner: View {
    let receipt: LookReceipt
    let dismiss: () -> Void
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TrustFolio(text: TrustCopy.notification, color: palette.accent, size: 10)
            Text(receipt.title)
                .font(TrustTheme.ui(16, weight: .medium))
                .foregroundStyle(palette.ink)
            Text(receipt.body)
                .font(TrustTheme.ui(14))
                .foregroundStyle(palette.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 44)
        .background(palette.paper)
        .overlay(Rectangle().stroke(palette.ink, lineWidth: 1))
        .onTapGesture(perform: dismiss)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(receipt.title). \(receipt.body)")
        .accessibilityHint(TrustCopy.close)
    }
}
