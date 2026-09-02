import SwiftUI
import TrustCore

struct LookSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        let copy = model.confirmCopy(for: model.lookSubject?.id)
        let name = model.lookSubject?.identity ?? TrustCopy.them

        VStack(alignment: .leading, spacing: 0) {
            Text(copy.title)
                .font(TrustTheme.display(26))
                .foregroundStyle(palette.ink)
                .padding(.bottom, 10)

            TrustRule(width: 44, draws: true)
                .padding(.bottom, 16)

            Text(TrustCopy.lookSheetSummary(name: name))
                .font(TrustTheme.ui(15))
                .foregroundStyle(palette.muted)
                .padding(.bottom, 18)

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
        .padding(.top, 20)
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
