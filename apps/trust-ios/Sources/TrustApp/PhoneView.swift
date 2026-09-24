import SwiftUI
import TrustCore

/// Phone gate. A verification text finishes the account. The checkbox starts empty;
/// Send code stays off until it is checked.
struct PhoneView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @FocusState private var focused: Field?

    private enum Field {
        case phone
        case code
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustWordmark()
                    .padding(.bottom, 28)

                Text(TrustCopy.yourPhone)
                    .font(TrustTheme.display(38))
                    .tracking(-1)
                    .foregroundStyle(palette.ink)
                    .accessibilityAddTraits(.isHeader)
                TrustRule()
                    .padding(.top, 12)
                    .padding(.bottom, 18)
                Text(TrustCopy.phoneIntro)
                    .trustFont(15)
                    .lineSpacing(3)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 18) {
                    TrustFieldLabel(title: TrustCopy.phoneNumber, hint: nil) {
                        TextField("415 555 0100", text: $model.phoneDraft)
                            .textContentType(.telephoneNumber)
                            .keyboardType(.phonePad)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(TrustTheme.ui(17))
                            .foregroundStyle(palette.ink)
                            .focused($focused, equals: .phone)
                            .padding(14)
                            .background(palette.paper)
                            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Color(hex: 0xDEDFD5), lineWidth: 1))
                    }

                    Button {
                        model.phoneConsentChecked.toggle()
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: model.phoneConsentChecked ? "checkmark.square.fill" : "square")
                                .font(TrustTheme.ui(20))
                                .foregroundStyle(model.phoneConsentChecked ? palette.accent : palette.ink)
                                .padding(.top, 1)
                            Text(TrustCopy.phoneConsent)
                                .font(TrustTheme.ui(15))
                                .foregroundStyle(palette.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(TrustCopy.phoneConsent)
                    .accessibilityAddTraits(model.phoneConsentChecked ? .isSelected : [])

                    Button(TrustCopy.sendCode) {
                        focused = nil
                        Task { await model.sendPhoneCode() }
                    }
                    .buttonStyle(TrustFilledButtonStyle())
                    .disabled(!canSend)

                    if model.phoneCodeSent {
                        TrustFieldLabel(title: TrustCopy.verificationCode, hint: nil) {
                            TextField("000000", text: $model.phoneCodeDraft)
                                .textContentType(.oneTimeCode)
                                .keyboardType(.numberPad)
                                .font(TrustTheme.ui(17))
                                .foregroundStyle(palette.ink)
                                .focused($focused, equals: .code)
                                .onChange(of: model.phoneCodeDraft) { _, value in
                                    let digits = value.filter(\.isNumber)
                                    if digits != value || digits.count > 6 {
                                        model.phoneCodeDraft = String(digits.prefix(6))
                                    }
                                }
                                .padding(14)
                                .background(palette.paper)
                                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Color(hex: 0xDEDFD5), lineWidth: 1))
                        }

                        Button(TrustCopy.verifyCode) {
                            focused = nil
                            Task { await model.verifyPhoneCode() }
                        }
                        .buttonStyle(TrustFilledButtonStyle())
                        .disabled(model.isOnboardingBusy || model.phoneCodeDraft.count != 6)
                    }

                    if let notice = model.phoneNotice, !notice.isEmpty {
                        Text(notice)
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.accent)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 28)

                Spacer(minLength: 32)

                Button(TrustCopy.signOut) {
                    model.signOut()
                }
                .buttonStyle(TrustTextButtonStyle())
                .frame(maxWidth: .infinity)
                .padding(.bottom, 12)
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 24)
            .trustReadableWidth()
        }
        .scrollDismissesKeyboard(.interactively)
        .background(palette.paper.ignoresSafeArea())
        .onAppear { focused = .phone }
    }

    private var canSend: Bool {
        model.phoneConsentChecked
            && !model.phoneDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !model.isOnboardingBusy
    }
}
