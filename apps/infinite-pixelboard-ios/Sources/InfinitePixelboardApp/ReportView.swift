import SwiftUI
import PixelboardCore

struct ReportView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var regionWidth = 8
    @State private var regionHeight = 8
    @State private var submitting = false
    @State private var errorMessage: String?

    private var region: ReportRegion {
        ReportRegion.centered(
            on: model.selectedPosition,
            width: regionWidth,
            height: regionHeight
        )
    }

    private var canSubmit: Bool {
        guard model.account != nil, let reason, !submitting else { return false }
        if reason == .other {
            return !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return true
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PixelboardPanelHeading(
                    eyebrow: PixelboardL10n.communitySafety,
                    title: PixelboardL10n.reportCurrentPositionHeading
                ) {
                    dismiss()
                }

                Text(PixelboardL10n.reportAreaNote)
                    .font(PixelboardTheme.sans(15))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                    .padding(.top, 28)
                    .padding(.bottom, 18)

                Text("\(PixelboardTheme.coordinate(row: model.selectedPosition.row, column: model.selectedPosition.column))  ·  \(region.width) × \(region.height)")
                    .font(PixelboardTheme.mono(10.5))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                    .padding(.bottom, 10)

                HStack(spacing: 10) {
                    dimensionField(PixelboardL10n.width, value: $regionWidth)
                    dimensionField(PixelboardL10n.height, value: $regionHeight)
                }

                PixelboardFieldLabel(title: PixelboardL10n.reason, hint: nil) {
                    Picker(PixelboardL10n.reason, selection: $reason) {
                        Text(PixelboardL10n.selectAReason).tag(Optional<ReportReason>.none)
                        ForEach(ReportReason.allCases) { value in
                            Text(value.label).tag(Optional(value))
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(PixelboardTheme.field)
                    .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                    .tint(PixelboardTheme.ink)
                }

                PixelboardFieldLabel(
                    title: PixelboardL10n.note,
                    hint: reason == .other
                        ? PixelboardL10n.requiredNoteHint
                        : PixelboardL10n.optionalNoteHint
                ) {
                    TextField("", text: $note, axis: .vertical)
                        .lineLimit(4...8)
                        .font(PixelboardTheme.sans(15))
                        .foregroundStyle(PixelboardTheme.ink)
                        .padding(10)
                        .background(PixelboardTheme.field)
                        .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                }

                Text(statusText)
                    .font(PixelboardTheme.mono(10))
                    .foregroundStyle(errorMessage == nil ? PixelboardTheme.muted : PixelboardTheme.accent)
                    .padding(.top, 12)
                    .padding(.bottom, 16)

                Button(submitting ? PixelboardL10n.submitting : PixelboardL10n.submitReport) {
                    submitting = true
                    errorMessage = nil
                    Task {
                        let result = await model.submitReport(
                            reason: reason,
                            note: note,
                            region: region
                        )
                        submitting = false
                        if result {
                            dismiss()
                        } else {
                            errorMessage = model.statusMessage
                        }
                    }
                }
                .buttonStyle(PixelboardFilledButtonStyle())
                .disabled(!canSubmit)
                .opacity(canSubmit ? 1 : 0.55)
            }
            .padding(24)
        }
        .background(PixelboardTheme.paper.ignoresSafeArea())
        .preferredColorScheme(.light)
        .scrollDismissesKeyboard(.interactively)
    }

    private func dimensionField(_ title: String, value: Binding<Int>) -> some View {
        PixelboardFieldLabel(title: title, hint: nil) {
            TextField("", value: value, format: .number)
                .keyboardType(.numberPad)
                .font(PixelboardTheme.mono(14))
                .foregroundStyle(PixelboardTheme.ink)
                .padding(10)
                .background(PixelboardTheme.field)
                .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                .onChange(of: value.wrappedValue) { _, next in
                    value.wrappedValue = min(64, max(1, next))
                }
        }
    }

    private var statusText: String {
        if let errorMessage { return errorMessage }
        if model.account == nil { return PixelboardL10n.signInBeforeReport }
        if reason == .other { return PixelboardL10n.otherReasonNoteRequired }
        return " "
    }
}

private extension ReportReason {
    var label: String {
        switch self {
        case .explicitSexualContent: PixelboardL10n.explicitSexualContent
        case .graphicViolence: PixelboardL10n.graphicViolence
        case .hateOrHarassment: PixelboardL10n.hateOrHarassment
        case .threat: PixelboardL10n.threat
        case .illegalContent: PixelboardL10n.illegalContent
        case .copyright: PixelboardL10n.copyright
        case .other: PixelboardL10n.other
        }
    }
}
