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
                    eyebrow: "Community safety",
                    title: "Report\ncurrent position."
                ) {
                    dismiss()
                }

                Text("Mark the affected area. We capture the pixels and placement history. You do not need a screenshot.")
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
                    dimensionField("Width", value: $regionWidth)
                    dimensionField("Height", value: $regionHeight)
                }

                PixelboardFieldLabel(title: "Reason", hint: nil) {
                    Picker("Reason", selection: $reason) {
                        Text("Select a reason").tag(Optional<ReportReason>.none)
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
                    title: "Note",
                    hint: reason == .other ? "Required · 500 characters" : "Optional · 500 characters"
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

                Button(submitting ? "Submitting…" : "Submit report") {
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
        if model.account == nil { return "Sign in before submitting a report." }
        if reason == .other { return "A note is required when the reason is Other." }
        return " "
    }
}

private extension ReportReason {
    var label: String {
        switch self {
        case .explicitSexualContent: "Explicit sexual content"
        case .graphicViolence: "Graphic violence"
        case .hateOrHarassment: "Hate or harassment"
        case .threat: "Threat"
        case .illegalContent: "Illegal content"
        case .copyright: "Copyright"
        case .other: "Other"
        }
    }
}
