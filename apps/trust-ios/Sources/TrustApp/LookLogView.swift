import SwiftUI
import TrustCore

struct LookLogView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TrustPanelHeading(eyebrow: TrustCopy.lookLog, title: TrustCopy.everyLookStays) {
                    model.showingLookLog = false
                }

                Text(TrustCopy.lookLogIntroText(freeDays: CircleCoverage.freeLookLogDays))
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)

                if let banner = model.coverage.banner {
                    TrustFolio(text: banner, color: palette.accent, size: 10)
                }

                if model.lookLog.isEmpty {
                    TrustSurface {
                        Text(TrustCopy.noLooksYet)
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
                    Text(TrustCopy.olderLooksHeld(model.snapshot?.retainedLookLogCount ?? 0))
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.accent)
                }

                if model.coverage.canExportLookLog {
                    ShareLink(item: model.lookLogExportText) {
                        Text(TrustCopy.exportLog)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .disabled(model.lookLog.isEmpty)
                } else {
                    Text(TrustCopy.circleKeepsLog)
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
            Text(TrustCopy.lookedAtRow(name: event.subjectName, hours: event.historyWindowHours))
                .font(TrustTheme.ui(14))
                .foregroundStyle(palette.muted)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { TrustHairline() }
    }
}
