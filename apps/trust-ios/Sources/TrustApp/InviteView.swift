import SwiftUI
import TrustCore

/// Invite — “I trust you with my location.”
struct InviteView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    var compactEmptyState = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if !compactEmptyState {
                    TrustFolio(text: TrustCopy.inviteTab, size: 10)
                        .padding(.bottom, 10)
                }

                Text(TrustCopy.inviteLine)
                    .font(TrustTheme.display(32))
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)

                TrustRule(width: 48)
                    .padding(.bottom, 16)

                Text(TrustCopy.inviteBody)
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)
                    .padding(.bottom, 28)

                if let code = model.pendingInviteCode {
                    TrustFolio(text: TrustCopy.yourCode, size: 10)
                        .padding(.bottom, 8)
                    Text(code)
                        .font(TrustTheme.display(36, italic: false))
                        .tracking(3)
                        .foregroundStyle(palette.ink)
                        .padding(.bottom, 20)

                    ShareLink(item: TrustCopy.inviteMessage(code: code)) {
                        Text(TrustCopy.shareInvite)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TrustFilledButtonStyle())
                    .padding(.bottom, 10)
                    .accessibilityLabel(TrustCopy.shareInvite)
                } else {
                    Button(TrustCopy.createInvite) {
                        model.createInvite()
                    }
                    .buttonStyle(TrustFilledButtonStyle())
                    .padding(.bottom, 10)
                }

                TrustFieldLabel(title: TrustCopy.joinWithCode, hint: TrustCopy.enterACode) {
                    TextField("ABC123", text: $model.inviteCodeDraft)
                        .textInputAutocapitalization(.characters)
                        .font(TrustTheme.ui(16, weight: .medium))
                        .foregroundStyle(palette.ink)
                        .padding(14)
                        .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                }
                .padding(.top, 18)
                .padding(.bottom, 12)

                Button(TrustCopy.join) {
                    model.joinInvite()
                }
                .buttonStyle(TrustOutlineButtonStyle())

                if let notice = model.pairingNotice {
                    Text(notice)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                        .padding(.top, 14)
                }
            }
            .padding(24)
        }
        .background(palette.paper.ignoresSafeArea())
        .onAppear {
            // Demo: mint a code without wiping the lean circle.
            if model.pendingInviteCode == nil, model.isDemoMode {
                model.createInvite()
            }
        }
    }
}
