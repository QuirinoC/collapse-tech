import SwiftUI
import TrustCore

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @FocusState private var handleFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustWordmark()
                    .padding(.bottom, 28)

                Text(TrustCopy.yourHandle)
                    .font(TrustTheme.display(40))
                    .foregroundStyle(palette.ink)
                    .accessibilityAddTraits(.isHeader)
                TrustRule()
                    .padding(.top, 12)
                    .padding(.bottom, 18)
                Text(TrustCopy.onboardingIntro)
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 20) {
                    TrustFieldLabel(title: TrustCopy.handle, hint: handleHint) {
                        HStack(spacing: 8) {
                            Text("@")
                                .font(TrustTheme.ui(17, weight: .medium))
                                .foregroundStyle(palette.muted)
                            TextField("jordan", text: handleBinding)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.asciiCapable)
                                .font(TrustTheme.ui(17))
                                .foregroundStyle(palette.ink)
                                .focused($handleFocused)
                        }
                        .padding(12)
                        .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                    }

                    Text(TrustCopy.handleRules)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)

                    Button(TrustCopy.continueAction) {
                        Task { await model.completeOnboarding() }
                    }
                    .buttonStyle(TrustFilledButtonStyle())
                    .disabled(model.isOnboardingBusy || !model.onboardingHandleIsValid || model.handleAvailability == false)

                    if let notice = model.onboardingNotice, !notice.isEmpty {
                        Text(notice)
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.muted)
                    }
                }
                .padding(.top, 28)

                Spacer(minLength: 32)

                Button(TrustCopy.signOut) {
                    model.signOut()
                }
                .buttonStyle(TrustTextButtonStyle())
                .padding(.bottom, 12)
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(palette.paper.ignoresSafeArea())
        .onAppear { handleFocused = true }
    }

    private var handleBinding: Binding<String> {
        Binding(
            get: { model.onboardingHandle },
            set: { model.setOnboardingHandle($0) }
        )
    }

    private var handleHint: String? {
        switch TrustHandle.status(of: model.onboardingHandle) {
        case .reserved:
            return TrustCopy.handleReserved
        case .invalid:
            return nil
        case .valid:
            if model.handleAvailability == true { return TrustCopy.handleAvailable }
            if model.handleAvailability == false { return TrustCopy.handleTaken }
            return nil
        }
    }
}
