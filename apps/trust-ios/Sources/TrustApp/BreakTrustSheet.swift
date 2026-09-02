import SwiftUI
import TrustCore

struct LookSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        let copy = model.confirmCopy(for: model.lookSubject?.id)
        let name = model.lookSubject?.identity ?? TrustCopy.them

        VStack(alignment: .leading, spacing: 0) {
            Capsule()
                .fill(palette.muted.opacity(0.4))
                .frame(width: 36, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .padding(.bottom, 16)

            Text(copy.title)
                .font(TrustTheme.display(26))
                .foregroundStyle(palette.ink)
                .padding(.bottom, 8)

            Text(TrustCopy.lookSheetSummary(name: name))
                .font(TrustTheme.ui(15))
                .foregroundStyle(palette.muted)
                .padding(.bottom, 20)

            fact(TrustCopy.factLiveLocation)
            fact(TrustCopy.factLastHours)
            fact(TrustCopy.factNotifiedImmediately(name: name))

            Text(TrustCopy.quietNotAlarm)
                .font(TrustTheme.ui(13))
                .foregroundStyle(palette.muted)
                .padding(.top, 16)

            Spacer(minLength: 16)

            Button(TrustCopy.look.uppercased()) {
                model.confirmLook()
            }
            .buttonStyle(TrustFilledButtonStyle())
            .padding(.bottom, 8)

            Button(TrustCopy.cancel) {
                model.showingLookConfirm = false
            }
            .buttonStyle(TrustTextButtonStyle())
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
        .background(palette.paper.ignoresSafeArea())
    }

    private func fact(_ text: String) -> some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(palette.accent)
                .frame(width: 6, height: 6)
            Text(text)
                .font(TrustTheme.ui(15, weight: .medium))
                .foregroundStyle(palette.ink)
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { TrustHairline() }
    }
}
