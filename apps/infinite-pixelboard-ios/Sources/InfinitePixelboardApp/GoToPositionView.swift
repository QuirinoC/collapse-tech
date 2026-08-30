import SwiftUI
import PixelboardCore

struct GoToPositionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var rowText: String
    @State private var columnText: String
    @State private var errorMessage: String?

    let initialPosition: BoardPosition
    let onGo: (BoardPosition) -> Void

    init(
        initialPosition: BoardPosition,
        onGo: @escaping (BoardPosition) -> Void
    ) {
        self.initialPosition = initialPosition
        self.onGo = onGo
        _rowText = State(initialValue: String(initialPosition.row))
        _columnText = State(initialValue: String(initialPosition.column))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                PixelboardEyebrow(text: PixelboardL10n.navigate)
                    .padding(.bottom, 18)

                Text(PixelboardL10n.goToCoordinatesHeading)
                    .font(PixelboardTheme.sans(42, weight: .medium))
                    .tracking(-2.2)
                    .textCase(.uppercase)
                    .foregroundStyle(PixelboardTheme.ink)
                    .lineSpacing(-7)

                Text(PixelboardL10n.enterCoordinatesNote)
                    .font(PixelboardTheme.sans(15))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                    .padding(.top, 24)
                    .padding(.bottom, 24)

                HStack(spacing: 12) {
                    coordinateField(PixelboardL10n.row, text: $rowText)
                    coordinateField(PixelboardL10n.column, text: $columnText)
                }

                HStack(spacing: 8) {
                    Button(PixelboardL10n.origin) {
                        go(to: BoardPosition(row: 0, column: 0))
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                    Button(PixelboardL10n.selectedPosition) {
                        go(to: initialPosition)
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                }
                .padding(.top, 12)

                if let errorMessage {
                    Text(errorMessage)
                        .font(PixelboardTheme.mono(10))
                        .foregroundStyle(PixelboardTheme.accent)
                        .padding(.top, 12)
                }

                Spacer(minLength: 24)

                Button(PixelboardL10n.centerBoard) {
                    submit()
                }
                .buttonStyle(PixelboardFilledButtonStyle())
            }
            .padding(24)
            .background(PixelboardTheme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(PixelboardL10n.close) { dismiss() }
                        .buttonStyle(PixelboardTextButtonStyle())
                }
            }
        }
        .preferredColorScheme(.light)
        .presentationDetents([.medium])
    }

    private func coordinateField(
        _ title: String,
        text: Binding<String>
    ) -> some View {
        PixelboardFieldLabel(title: title, hint: nil) {
            TextField("0", text: text)
                .keyboardType(.numbersAndPunctuation)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(PixelboardTheme.mono(15))
                .foregroundStyle(PixelboardTheme.ink)
                .padding(12)
                .background(PixelboardTheme.field)
                .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
        }
    }

    private func submit() {
        guard let row = Int(rowText.trimmingCharacters(in: .whitespacesAndNewlines)),
              let column = Int(columnText.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            errorMessage = PixelboardL10n.wholeNumberCoordinates
            return
        }

        go(to: BoardPosition(row: row, column: column))
    }

    private func go(to position: BoardPosition) {
        onGo(position)
        dismiss()
    }
}
