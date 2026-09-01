import SwiftUI
import TrustCore

struct PairingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(TrustCopy.inviteSomeone)
                .font(TrustTheme.display(22))
                .foregroundStyle(palette.ink)
            Text(TrustCopy.inviteSomeoneBody)
                .font(TrustTheme.ui(13))
                .foregroundStyle(palette.muted)

            Button(TrustCopy.createInvite) {
                model.createInvite()
            }
            .buttonStyle(TrustOutlineButtonStyle(compact: true))

            if let code = model.pendingInviteCode {
                Text(code)
                    .font(TrustTheme.display(22, italic: false))
                    .tracking(2)
                    .foregroundStyle(palette.ink)
                ShareLink(item: TrustCopy.inviteMessage(code: code)) {
                    Text(TrustCopy.shareInvite)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))
            }

            TrustFieldLabel(title: TrustCopy.joinWithCode, hint: nil) {
                TextField("ABC123", text: $model.inviteCodeDraft)
                    .textInputAutocapitalization(.characters)
                    .font(TrustTheme.ui(16, weight: .medium))
                    .foregroundStyle(palette.ink)
                    .padding(12)
                    .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
            }
            Button(TrustCopy.join) {
                model.joinInvite()
            }
            .buttonStyle(TrustOutlineButtonStyle(compact: true))

            if let notice = model.pairingNotice {
                Text(notice)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
            }
        }
        .padding(14)
        .background(palette.paper)
        .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
    }
}
