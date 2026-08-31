import SwiftUI
import TrustCore

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrustWordmark()

            Spacer(minLength: 24)

            VStack(spacing: 18) {
                Text(TrustCopy.mastheadName)
                    .font(TrustTheme.display(56))
                    .foregroundStyle(palette.ink)
                    .accessibilityLabel(TrustCopy.appName)
                    .accessibilityAddTraits(.isHeader)
                TrustRule()
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 24)

            VStack(spacing: 16) {
                // SignInWithAppleButton is rounded system chrome; Masthead is a sharp plate.
                // SF Symbol apple.logo is Apple's mark — not a custom logo.
                Button {
                    Task { await model.signIn(with: .apple) }
                } label: {
                    HStack(spacing: 10) {
                        if model.isSigningIn {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(palette.paper)
                                .accessibilityHidden(true)
                        } else {
                            Image(systemName: "apple.logo")
                                .font(.system(size: 18, weight: .medium))
                                .accessibilityHidden(true)
                        }
                        Text(model.isSigningIn ? "Signing in…" : "Log in with Apple")
                            .font(TrustTheme.ui(17, weight: .medium))
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(TrustAppleButtonStyle())
                .clipShape(Rectangle())
                .contentShape(Rectangle())
                .disabled(model.isSigningIn)
                .accessibilityLabel("Log in with Apple")
                .accessibilityValue(model.isSigningIn ? "Signing in" : "")

                HStack(spacing: 14) {
                    Link("Terms of Service", destination: AppConfiguration.termsURL)
                    Link("Privacy", destination: AppConfiguration.privacyURL)
                    Link("Support", destination: AppConfiguration.supportURL)
                }
                .font(TrustTheme.folio(10))
                .tracking(0.7)
                .textCase(.uppercase)
                .foregroundStyle(palette.muted)
                .tint(palette.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }

            if let notice = model.authNotice, !notice.isEmpty {
                Text(notice)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 12)
                    .accessibilityIdentifier("login-notice")
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background {
            ZStack {
                palette.paper
                LoginAtlasBackground()
            }
            .ignoresSafeArea()
        }
        .task { await model.prepareLogin() }
    }
}
