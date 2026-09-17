import SwiftUI
import TrustCore

/// T3 Invite — "I trust you with my location." Share a link, or enter a code. No email.
/// Invite ≠ permission: joining is Off both ways until each person picks a mode.
struct InviteView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @FocusState private var codeFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustPageTitle(text: TrustCopy.inviteTab)
                    .padding(.top, 4)
                Text(TrustCopy.inviteSub)
                    .trustFont(13)
                    .foregroundStyle(palette.muted)
                    .padding(.top, 6)

                inviteArt
                    .frame(maxWidth: .infinity)
                    .frame(height: 140)
                    .padding(.vertical, 14)

                Text(TrustCopy.inviteLine)
                    .font(TrustTheme.display(31))
                    .tracking(-1)
                    .foregroundStyle(palette.ink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
                    .accessibilityAddTraits(.isHeader)

                Text(TrustCopy.inviteDescription)
                    .trustFont(13)
                    .lineSpacing(4)
                    .foregroundStyle(Color(hex: 0x777B6E))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 24)

                if let code = model.pendingInviteCode {
                    TrustCard(fill: Color(hex: 0xF0F3E9)) {
                        VStack(alignment: .leading, spacing: 10) {
                            TrustEyebrow(text: TrustCopy.yourCode, size: 10)
                            Text(code)
                                .font(TrustTheme.mono(30))
                                .tracking(4)
                                .foregroundStyle(palette.ink)
                                .textSelection(.enabled)
                                .accessibilityLabel(code.map(String.init).joined(separator: " "))
                            Text(TrustCopy.inviteReadyBody)
                                .font(TrustTheme.ui(13))
                                .foregroundStyle(palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                            ShareLink(item: TrustCopy.inviteMessage(code: code)) {
                                Label(TrustCopy.shareInviteLink, systemImage: "link")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(TrustFilledButtonStyle())
                            .padding(.top, 4)
                        }
                    }
                } else {
                    Button {
                        model.createInvite()
                    } label: {
                        Label(TrustCopy.createInvite, systemImage: "link")
                    }
                    .buttonStyle(TrustFilledButtonStyle())
                }

                HStack(spacing: 12) {
                    TrustHairline()
                    Text("OR")
                        .font(TrustTheme.folio(9))
                        .tracking(1)
                        .foregroundStyle(Color(hex: 0x939587))
                    TrustHairline()
                }
                .padding(.vertical, 18)
                .accessibilityHidden(true)

                TrustFieldLabel(title: TrustCopy.enterACode, hint: nil) {
                    HStack(spacing: 10) {
                        TextField(TrustCopy.codePlaceholder, text: $model.inviteCodeDraft)
                            .textFieldStyle(TrustTextFieldStyle())
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .keyboardType(.asciiCapable)
                            .submitLabel(.join)
                            .focused($codeFocused)
                            .onSubmit { model.joinInvite() }
                            .accessibilityLabel(TrustCopy.enterACode)
                        Button {
                            codeFocused = false
                            model.joinInvite()
                        } label: {
                            if model.isJoining {
                                ProgressView().tint(palette.accentOn)
                            } else {
                                Text(TrustCopy.join)
                            }
                        }
                        .buttonStyle(TrustFilledButtonStyle(expand: false))
                        .disabled(model.inviteCodeDraft.trimmingCharacters(in: .whitespaces).isEmpty || model.isJoining)
                    }
                }

                if let notice = model.inviteNotice {
                    Text(notice)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.accent)
                        .padding(.top, 10)
                        .accessibilityIdentifier("invite-notice")
                }

                if !model.circle.isEmpty {
                    Text(TrustCopy.seatsUsed(count: model.circle.count, limit: model.coverage.trustedPeopleLimit))
                        .font(TrustTheme.ui(12))
                        .foregroundStyle(palette.muted)
                        .padding(.top, 14)
                }

                TrustFootnote(glyph: "lock", text: TrustCopy.inviteFootnote)
                    .padding(.top, 16)
            }
            .padding(.horizontal, TrustTheme.gutter)
            .padding(.bottom, 28)
            .trustReadableWidth()
        }
        .scrollDismissesKeyboard(.interactively)
        .background(palette.paper.ignoresSafeArea())
    }

    /// `.invite-art` — two orbits, two avatars, a red plus.
    private var inviteArt: some View {
        ZStack {
            Ellipse()
                .stroke(Color(hex: 0xDCDED1), lineWidth: 1)
                .frame(width: 170, height: 117)
                .rotationEffect(.degrees(-28))
            Ellipse()
                .stroke(Color(hex: 0xDCDED1), lineWidth: 1)
                .frame(width: 178, height: 120)
                .rotationEffect(.degrees(28))
            HStack(spacing: 24) {
                TrustAvatar(name: model.you.displayName, seed: 0, size: 60)
                    .overlay(Circle().stroke(palette.paper, lineWidth: 5))
                TrustAvatar(name: "?", seed: 2, size: 60)
                    .overlay(Circle().stroke(palette.paper, lineWidth: 5))
            }
            Text("+")
                .font(TrustTheme.ui(19, weight: .medium))
                .foregroundStyle(palette.accent)
        }
        .accessibilityHidden(true)
    }
}
