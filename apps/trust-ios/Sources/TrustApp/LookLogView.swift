import SwiftUI
import TrustCore

struct LookLogView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TrustPanelHeading(eyebrow: "Look log", title: "Every look stays.") {
                    model.showingLookLog = false
                }

                Text("Append-only while the account exists. Deleting your account removes your location and look history. Free keeps \(CircleCoverage.freeLookLogDays) days. Circle keeps a year and can export.")
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)

                if let banner = model.coverage.banner {
                    TrustFolio(text: banner, color: palette.accent, size: 10)
                }

                if model.lookLog.isEmpty {
                    TrustSurface {
                        Text("No looks yet.")
                            .font(TrustTheme.ui(16))
                            .foregroundStyle(palette.muted)
                    }
                } else {
                    VStack(spacing: 0) {
                        ForEach(model.lookLog) { event in
                            logRow(event)
                        }
                    }
                }

                if (model.snapshot?.retainedLookLogCount ?? 0) > 0 {
                    Text("\(model.snapshot?.retainedLookLogCount ?? 0) older looks are held for Circle retention.")
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.accent)
                }

                if model.coverage.canExportLookLog {
                    ShareLink(item: model.lookLogExportText) {
                        Text("Export log")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .disabled(model.lookLog.isEmpty)
                } else {
                    Text("Circle keeps the log for a year and lets either of you export. Looking is already included.")
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                }
            }
            .padding(24)
        }
        .background(palette.paper.ignoresSafeArea())
    }

    private func logRow(_ event: LookEvent) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(event.viewerName)
                    .font(TrustTheme.ui(15, weight: .medium))
                    .foregroundStyle(palette.ink)
                Spacer()
                Text(event.at.formatted(date: .abbreviated, time: .shortened))
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
            }
            Text("Looked at \(event.subjectName) · live + last \(event.historyWindowHours)h")
                .font(TrustTheme.ui(14))
                .foregroundStyle(palette.muted)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { TrustHairline() }
    }
}
