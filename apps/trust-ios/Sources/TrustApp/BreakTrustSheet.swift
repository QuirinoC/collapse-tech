import SwiftUI
import TrustCore

struct LookSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        let copy = model.confirmCopy(for: model.lookSubject?.id)
        let name = model.lookSubject?.displayName ?? "them"

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

            Text("Live location, the last 2 hours, and a receipt to \(name). This cannot be undone.")
                .font(TrustTheme.ui(15))
                .foregroundStyle(palette.muted)
                .padding(.bottom, 20)

            fact("Live location")
            fact("Last 2 hours of movement")
            fact("\(name) is notified immediately")

            Text("A quiet notification — not an alarm. There is no “don’t ask again.”")
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
