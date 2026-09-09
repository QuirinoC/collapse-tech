import SwiftUI
import TrustCore

struct LookLogView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(TrustCopy.everyLookStays)
                        .font(TrustTheme.display(28))
                        .foregroundStyle(palette.ink)
                        .listRowBackground(palette.paper)
                        .listRowSeparator(.hidden)
                        .accessibilityAddTraits(.isHeader)

                    Text(TrustCopy.lookLogIntroText(freeDays: CircleCoverage.freeLookLogDays))
                        .font(TrustTheme.ui(15))
                        .foregroundStyle(palette.muted)
                        .listRowBackground(palette.paper)

                    if let banner = model.coverage.banner {
                        TrustFolio(text: banner, color: palette.accent, size: 10)
                            .listRowBackground(palette.paper)
                    }
                }

                Section {
                    if model.lookLog.isEmpty {
                        Text(TrustCopy.noLooksYet)
                            .font(TrustTheme.ui(16))
                            .foregroundStyle(palette.muted)
                            .frame(minHeight: 44)
                            .listRowBackground(palette.paper)
                    } else {
                        ForEach(model.lookLog) { event in
                            logRow(event)
                                .listRowBackground(palette.paper)
                        }
                    }
                } header: {
                    Text(TrustCopy.lookLog)
                        .font(TrustTheme.folio(11))
                        .foregroundStyle(palette.muted)
                        .textCase(.uppercase)
                }

                Section {
                    if (model.snapshot?.retainedLookLogCount ?? 0) > 0 {
                        Text(TrustCopy.olderLooksHeld(model.snapshot?.retainedLookLogCount ?? 0))
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.accent)
                            .listRowBackground(palette.paper)
                    }

                    if model.coverage.canExportLookLog {
                        ShareLink(item: model.lookLogExportText) {
                            Text(TrustCopy.exportLog)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(TrustOutlineButtonStyle(compact: true))
                        .disabled(model.lookLog.isEmpty)
                        .listRowBackground(palette.paper)
                        .accessibilityLabel(TrustCopy.exportLog)
                    } else {
                        Text(TrustCopy.circleKeepsLog)
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.muted)
                            .listRowBackground(palette.paper)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(palette.paper.ignoresSafeArea())
            .navigationTitle(TrustCopy.lookLog)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // HIG sheets: Cancel/Close on leading edge for single-view sheets.
                ToolbarItem(placement: .cancellationAction) {
                    Button(TrustCopy.close) {
                        model.showingLookLog = false
                        dismiss()
                    }
                    .font(TrustTheme.folio(12))
                    .tracking(1)
                    .textCase(.uppercase)
                    .foregroundStyle(palette.ink)
                    .frame(minHeight: 44)
                }
            }
        }
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
        .padding(.vertical, 4)
        .frame(minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
