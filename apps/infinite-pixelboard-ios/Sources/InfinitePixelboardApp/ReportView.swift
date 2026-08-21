import SwiftUI
import PixelboardCore

struct ReportView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReportReason = .other
    @State private var note = ""
    @State private var submitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Current position") {
                    LabeledContent("Row", value: "\(model.selectedPosition.row)")
                    LabeledContent("Column", value: "\(model.selectedPosition.column)")
                }
                Section("Reason") {
                    Picker("Reason", selection: $reason) {
                        ForEach(ReportReason.allCases) { reason in
                            Text(reason.label).tag(reason)
                        }
                    }
                    TextField("Optional note", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section {
                    Button("Submit report") {
                        submitting = true
                        Task {
                            if await model.submitReport(reason: reason, note: note) {
                                dismiss()
                            }
                            submitting = false
                        }
                    }
                    .disabled(submitting || model.account == nil)
                } footer: {
                    if model.account == nil {
                        Text("Sign in before submitting a report.")
                    }
                }
            }
            .navigationTitle("Report content")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
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
