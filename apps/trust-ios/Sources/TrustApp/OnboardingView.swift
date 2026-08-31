import SwiftUI
import TrustCore

enum TrustDisplayName {
    static func isChosen(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.count >= 2 && trimmed.lowercased() != "you"
    }
}

enum TrustPhoneNumber {
    static func e164(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.filter(\.isNumber)
        if trimmed.hasPrefix("+") {
            guard digits.count >= 8, digits.count <= 15 else { return nil }
            return "+" + digits
        }
        if digits.count == 10 { return "+1" + digits }
        if digits.count == 11, digits.first == "1" { return "+" + digits }
        return nil
    }

    static func masked(_ e164: String) -> String {
        guard e164.count >= 4 else { return "+***" }
        return "+***" + e164.suffix(4)
    }
}

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case name, phone, code
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustWordmark()
                    .padding(.bottom, 28)

                Text("Your profile")
                    .font(TrustTheme.display(40))
                    .foregroundStyle(palette.ink)
                    .accessibilityAddTraits(.isHeader)
                TrustRule()
                    .padding(.top, 12)
                    .padding(.bottom, 18)
                Text("A name people will see, and a phone we verify with a text. Location stays with you until someone looks.")
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 20) {
                    TrustFieldLabel(title: "Display name", hint: nil) {
                        TextField("Your name", text: $model.onboardingName)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)
                            .disableAutocorrection(true)
                            .font(TrustTheme.ui(17))
                            .foregroundStyle(palette.ink)
                            .padding(12)
                            .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                            .focused($focus, equals: .name)
                    }

                    TrustFieldLabel(title: "Phone", hint: model.phoneVerified ? "Verified" : nil) {
                        HStack(spacing: 8) {
                            Text("+")
                                .font(TrustTheme.ui(17, weight: .medium))
                                .foregroundStyle(palette.muted)
                            TextField("1 415 555 0100", text: $model.onboardingPhone)
                                .keyboardType(.phonePad)
                                .textContentType(.telephoneNumber)
                                .font(TrustTheme.ui(17))
                                .foregroundStyle(palette.ink)
                                .focused($focus, equals: .phone)
                                .disabled(model.phoneVerified)
                        }
                        .padding(12)
                        .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                    }

                    if !model.phoneVerified {
                        Button("Send code") {
                            Task { await model.sendOnboardingPhoneCode() }
                        }
                        .buttonStyle(TrustOutlineButtonStyle())
                        .disabled(model.isOnboardingBusy)
                    }

                    if model.phoneCodeSent, !model.phoneVerified {
                        TrustFieldLabel(title: "Code", hint: "6 digits") {
                            TextField("000000", text: $model.onboardingCode)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                                .font(TrustTheme.ui(22, weight: .medium))
                                .tracking(4)
                                .foregroundStyle(palette.ink)
                                .padding(12)
                                .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                                .focused($focus, equals: .code)
                        }

                        if let code = model.developmentOtpCode, !code.isEmpty {
                            Text("Development code \(code)")
                                .font(TrustTheme.ui(14, weight: .medium))
                                .foregroundStyle(palette.ink)
                                .accessibilityLabel("Development code \(code.unspacedDigits)")
                        }

                        Button("Verify") {
                            Task { await model.verifyOnboardingPhoneCode() }
                        }
                        .buttonStyle(TrustFilledButtonStyle())
                        .disabled(model.isOnboardingBusy || model.onboardingCode.filter(\.isNumber).count != 6)
                    }

                    if model.phoneVerified, TrustDisplayName.isChosen(model.onboardingName) {
                        Button("Continue") {
                            Task { await model.completeOnboarding() }
                        }
                        .buttonStyle(TrustFilledButtonStyle())
                        .disabled(model.isOnboardingBusy)
                    }

                    if let notice = model.onboardingNotice, !notice.isEmpty {
                        Text(notice)
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.muted)
                    }
                }
                .padding(.top, 28)

                Spacer(minLength: 32)

                Button("Sign out") {
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
    }
}

private extension String {
    var unspacedDigits: String { filter(\.isNumber) }
}
