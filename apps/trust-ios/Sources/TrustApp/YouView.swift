import SwiftUI
import TrustCore

/// T4 You — status, presence triad (free), Plus card, settings, view log, Stop all,
/// Sign out, Delete, legal. Your controls first, upsell second.
struct YouView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var showingDeleteAccount = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TrustPageTitle(text: TrustCopy.you)
                        .padding(.top, 4)

                    profileCard
                        .padding(.top, 22)
                        .padding(.bottom, 24)

                    statusCard
                        .padding(.bottom, 26)

                    presenceSection
                        .padding(.bottom, 26)

                    homePlaceSection
                        .padding(.bottom, 26)

                    plusCard
                        .padding(.bottom, 26)

                    settingsSection
                        .padding(.bottom, 26)

                    viewLogSection

                    Button(TrustCopy.stopAll) {
                        model.stopAllRequested = true
                    }
                    .buttonStyle(TrustTextButtonStyle(color: palette.accent))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 22)
                    .disabled(model.outboundActiveCount == 0)

                    Button(TrustCopy.signOut) {
                        model.signOut()
                    }
                    .buttonStyle(TrustTextButtonStyle())
                    .frame(maxWidth: .infinity)

                    Button(TrustCopy.deleteAccount) {
                        showingDeleteAccount = true
                    }
                    .buttonStyle(TrustTextButtonStyle(color: Color(hex: 0x9C5C51)))
                    .frame(maxWidth: .infinity)

                    legal
                        .padding(.top, 20)

                    signoff
                        .padding(.top, 28)
                }
                .padding(.horizontal, TrustTheme.gutter)
                .padding(.bottom, 28)
                .trustReadableWidth()
            }
            .background(palette.paper.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { route in
                if route == "log" {
                    ViewLogView(inSheet: false)
                }
            }
        }
        .confirmationDialog(TrustCopy.stopAllConfirm, isPresented: $model.stopAllRequested, titleVisibility: .visible) {
            Button(TrustCopy.stopAll, role: .destructive) { model.stopAll() }
            Button(TrustCopy.cancel, role: .cancel) {}
        }
        .confirmationDialog(TrustCopy.deleteAccountConfirm, isPresented: $showingDeleteAccount, titleVisibility: .visible) {
            Button(TrustCopy.deleteAccount, role: .destructive) {
                Task { await model.deleteAccount() }
            }
            Button(TrustCopy.cancel, role: .cancel) {}
        }
        .task {
            guard !model.isDemoMode else { return }
            model.syncHomeMonitoring()
            if let signed = await model.store.refreshEntitlement() {
                await model.syncCircleEntitlement(signedTransactionInfo: signed)
            }
        }
    }

    // MARK: Profile / status

    private var profileCard: some View {
        HStack(spacing: 14) {
            TrustAvatar(name: model.you.displayName, seed: 0, size: 70)
            VStack(alignment: .leading, spacing: 6) {
                Text(model.you.displayName)
                    .font(TrustTheme.display(24))
                    .tracking(-0.6)
                    .foregroundStyle(palette.ink)
                Text([model.you.handle.map { "@\($0)" }, model.coverage.planLabel].compactMap { $0 }.joined(separator: " · "))
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var statusCard: some View {
        TrustCard {
            VStack(alignment: .leading, spacing: 8) {
                TrustEyebrow(text: TrustCopy.status, size: 10)
                Text(TrustCopy.sealedByDefault)
                    .font(TrustTheme.display(22))
                    .tracking(-0.5)
                    .foregroundStyle(palette.ink)
                Text(model.outboundActiveCount > 0 ? TrustCopy.statusSharing(count: model.outboundActiveCount) : TrustCopy.statusNone)
                    .trustFont(13)
                    .lineSpacing(3)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let banner = model.coverage.banner {
                    TrustEyebrow(text: banner, color: palette.accent, size: 9)
                        .padding(.top, 2)
                }
                Button(TrustCopy.manageSharing) { model.selectedTab = .sharing }
                    .buttonStyle(TrustLinkButtonStyle())
            }
        }
    }

    // MARK: Presence triad (free, manual, global)

    private var presenceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TrustSectionHeading(TrustCopy.presence)
            Text(TrustCopy.presenceNote)
                .trustFont(12)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            TrustModeControl<HomePresenceKind>(
                items: HomePresenceKind.triad.map { .init(id: $0, label: $0.label) },
                selection: model.myPresence == .unknown ? nil : model.myPresence
            ) { kind in
                model.setPresence(kind)
            }
            .accessibilityLabel(TrustCopy.presence)
            .accessibilityHint(TrustCopy.presenceHint)
            Text(presenceCopy)
                .trustFont(12)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var presenceCopy: String {
        switch model.myPresence {
        case .home: return TrustCopy.presenceHomeCopy
        case .away: return TrustCopy.presenceAwayCopy
        case .hidden: return TrustCopy.presenceHiddenCopy
        case .unknown: return TrustCopy.presenceUnknownCopy
        }
    }

    // MARK: Home place (on-device coords; server gets presence only)

    private var homePlaceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TrustSectionHeading(TrustCopy.homePlace)
            Text(TrustCopy.homePlaceNote)
                .trustFont(12)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Text(model.location.homeIsSet ? TrustCopy.homeIsSetLabel : TrustCopy.homeNotSetLabel)
                .trustFont(13, weight: .semibold)
                .foregroundStyle(palette.ink)
            if model.location.homeIsSet, !model.location.hasAlways {
                Text(TrustCopy.homeNeedsAlways)
                    .trustFont(12)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button(TrustCopy.allowAlways) { model.requestAlwaysLocation() }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
            }
            HStack(spacing: 12) {
                Button(TrustCopy.setHomeHere) { model.setHomeFromCurrentLocation() }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                if model.location.homeIsSet {
                    Button(TrustCopy.clearHome) { model.clearHomePlace() }
                        .buttonStyle(TrustTextButtonStyle(color: Color(hex: 0x9C5C51)))
                }
            }
        }
    }

    // MARK: Plus teaser

    private var plusCard: some View {
        TrustCard(fill: palette.paper) {
            VStack(alignment: .leading, spacing: 10) {
                TrustEyebrow(text: TrustCopy.trustPlus, color: palette.accent, size: 10)
                Text(TrustCopy.plusHeadline)
                    .font(TrustTheme.display(24))
                    .tracking(-0.6)
                    .foregroundStyle(palette.ink)
                VStack(alignment: .leading, spacing: 6) {
                    tierLine(TrustCopy.freePlan.replacingOccurrences(of: " plan", with: ""), TrustCopy.plusFreeLine)
                    tierLine(TrustCopy.plusPlan, TrustCopy.plusPlusLine)
                }
                .padding(.top, 2)
                Text(TrustCopy.plusNote(monthly: monthlyPrice, annual: annualPrice))
                    .font(TrustTheme.ui(12))
                    .lineSpacing(3)
                    .foregroundStyle(Color(hex: 0x8A8E80))
                    .fixedSize(horizontal: false, vertical: true)
                if model.coverage.isCovered {
                    Text(TrustCopy.youHavePlus)
                        .font(TrustTheme.ui(13, weight: .semibold))
                        .foregroundStyle(palette.ink)
                    Link(TrustCopy.manageSubscription, destination: StoreManager.manageSubscriptionsURL)
                        .font(TrustTheme.ui(13, weight: .medium))
                        .foregroundStyle(palette.accent)
                        .frame(minHeight: 44)
                } else {
                    Button(TrustCopy.seePlus) { model.showingPaywall = true }
                        .buttonStyle(TrustOutlineButtonStyle(compact: true))
                        .padding(.top, 4)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: TrustTheme.radius, style: .continuous)
                .stroke(Color(hex: 0xE5E5DB), lineWidth: 1)
        )
    }

    private func tierLine(_ title: String, _ body: String) -> some View {
        (Text(title).fontWeight(.semibold).foregroundColor(palette.ink) + Text(" — \(body)").foregroundColor(Color(hex: 0x6F7468)))
            .font(TrustTheme.ui(13))
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var monthlyPrice: String {
        model.store.products.first { $0.id == AppConfiguration.monthlyProductID }?.displayPrice ?? AppConfiguration.monthlyDisplayPrice
    }

    private var annualPrice: String {
        model.store.products.first { $0.id == AppConfiguration.annualProductID }?.displayPrice ?? AppConfiguration.annualDisplayPrice
    }

    // MARK: Settings

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrustSectionHeading(TrustCopy.settings)
            settingsRow(title: TrustCopy.lookNotifications, body: TrustCopy.lookNotificationsBody, glyph: "lock")
            if model.receipts.authorization == .denied {
                Text(TrustCopy.notificationsOff)
                    .font(TrustTheme.ui(12))
                    .foregroundStyle(palette.muted)
                    .padding(.vertical, 10)
                Button(TrustCopy.openIOSSettings) { model.openSystemSettings() }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .padding(.bottom, 12)
            } else if model.receipts.authorization == .notDetermined, !model.circle.isEmpty {
                Button(TrustCopy.allowNotifications) { Task { await model.requestNotifications() } }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .padding(.vertical, 12)
            }
            if model.isSharingLocation {
                locationRow
            }
        }
    }

    @ViewBuilder
    private var locationRow: some View {
        if model.location.isDenied {
            settingsRow(title: TrustCopy.location, body: TrustCopy.locationDeniedBody, glyph: "location.slash")
            Button(TrustCopy.openIOSSettings) { model.openSystemSettings() }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))
                .padding(.vertical, 12)
        } else if model.location.needsAlwaysForSharing {
            settingsRow(title: TrustCopy.location, body: model.location.needsSystemSettings ? TrustCopy.keptWhileUsing : TrustCopy.alwaysNeededForSharing, glyph: "location")
            Button(model.location.needsSystemSettings ? TrustCopy.openSettings : TrustCopy.allowAlways) {
                if model.location.needsSystemSettings { model.openSystemSettings() } else { model.requestAlwaysLocation() }
            }
            .buttonStyle(TrustOutlineButtonStyle(compact: true))
            .padding(.vertical, 12)
        } else if model.location.hasAccess, !model.location.isPrecise {
            settingsRow(title: TrustCopy.location, body: TrustCopy.locationReducedAccuracy, glyph: "location")
            Button(TrustCopy.allowPreciseLocation) { model.location.requestPrecise() }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))
                .padding(.vertical, 12)
        } else {
            settingsRow(title: TrustCopy.location, body: model.location.statusLabel, glyph: "location")
        }
    }

    private func settingsRow(title: String, body: String, glyph: String) -> some View {
        HStack(alignment: .center, spacing: 15) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(TrustTheme.ui(15, weight: .semibold))
                    .foregroundStyle(palette.ink)
                Text(body)
                    .font(TrustTheme.ui(12))
                    .lineSpacing(2)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Image(systemName: glyph)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(palette.muted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 16)
        .frame(minHeight: 64)
        .overlay(alignment: .bottom) { TrustHairline() }
        .accessibilityElement(children: .combine)
    }

    // MARK: View log (inline preview + destination)

    private var viewLogSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrustSectionHeading(TrustCopy.viewLog) {
                if !model.lookLog.isEmpty {
                    NavigationLink(value: "log") {
                        HStack(spacing: 4) {
                            Text(TrustCopy.allViews)
                            Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold))
                        }
                        .font(TrustTheme.ui(13, weight: .medium))
                        .foregroundStyle(palette.accent)
                        .frame(minHeight: 44)
                    }
                }
            }
            if model.lookLog.isEmpty {
                Text(TrustCopy.noViewsYet)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(Color(hex: 0x808573))
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                ForEach(model.lookLog.prefix(3)) { event in
                    ViewLogRow(event: event, youID: model.you.id)
                    TrustRowDivider()
                }
            }
        }
    }

    // MARK: Legal / signoff

    private var legal: some View {
        VStack(alignment: .center, spacing: 8) {
            Text(TrustCopy.weDoNotSellLocation)
            HStack(spacing: 8) {
                Link(TrustCopy.privacy, destination: AppConfiguration.privacyURL)
                Text("·")
                Link(TrustCopy.terms, destination: AppConfiguration.termsURL)
                Text("·")
                Link(TrustCopy.support, destination: AppConfiguration.supportURL)
            }
            #if DEBUG
            Text("API \(AppConfiguration.apiBaseURL.absoluteString)")
                .font(TrustTheme.ui(11))
            #endif
        }
        .font(TrustTheme.ui(12))
        .foregroundStyle(palette.muted)
        .tint(palette.muted)
        .frame(maxWidth: .infinity)
    }

    private var signoff: some View {
        VStack(spacing: 8) {
            TrustWordmarkTitle(size: 30)
            Text(TrustCopy.signoff)
                .font(TrustTheme.ui(12))
                .foregroundStyle(palette.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

/// `.receipt-row` — one view-log line, both directions.
struct ViewLogRow: View {
    let event: LookEvent
    let youID: UUID
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(event.logLine(youID: youID))
                .font(TrustTheme.ui(14))
                .foregroundStyle(palette.ink)
            Text("\(event.at.formatted(date: .abbreviated, time: .shortened)) · \(kindLabel)")
                .font(TrustTheme.ui(12))
                .foregroundStyle(palette.muted)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var kindLabel: String {
        switch event.kind {
        case .view: return TrustCopy.kindView
        case .removed: return TrustCopy.kindRemoved
        case .look: return TrustCopy.kindLook
        }
    }
}

/// D3 View log — chronological, both directions. Free keeps 30 days; Plus keeps a year + export.
struct ViewLogView: View {
    var inSheet: Bool
    var asTab: Bool = false
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustPageTitle(text: asTab ? TrustCopy.log : TrustCopy.viewLog)
                    .padding(.top, 4)
                if !asTab {
                Text(TrustCopy.viewLogIntro)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 6)
                Text(TrustCopy.viewLogRetention(freeDays: CircleCoverage.freeLookLogDays))
                    .font(TrustTheme.ui(12))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 4)
                    .padding(.bottom, 18)
                }

                if model.lookLog.isEmpty {
                    Text(TrustCopy.noViewsYet)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(Color(hex: 0x808573))
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                } else {
                    ForEach(model.lookLog) { event in
                        ViewLogRow(event: event, youID: model.you.id)
                        TrustRowDivider()
                    }
                }

                if let retained = model.snapshot?.retainedLookLogCount, retained > 0 {
                    Text(TrustCopy.olderEntriesHeld(retained))
                        .font(TrustTheme.ui(12))
                        .foregroundStyle(palette.accent)
                        .padding(.top, 14)
                }

                if model.coverage.canExportLookLog, !model.lookLog.isEmpty {
                    ShareLink(item: model.lookLogExportText) {
                        Label(TrustCopy.exportLog, systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .padding(.top, 18)
                }
            }
            .padding(.horizontal, TrustTheme.gutter)
            .padding(.bottom, 28)
            .trustReadableWidth()
        }
        .background(palette.paper.ignoresSafeArea())
        .toolbar(asTab ? .hidden : .visible, for: .navigationBar)
        .toolbarBackground(palette.paper, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            if !asTab {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        if inSheet { model.showingViewLog = false } else { dismiss() }
                    } label: {
                        HStack(spacing: 4) {
                            if !inSheet {
                                Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold))
                            }
                            Text(inSheet ? TrustCopy.close : TrustCopy.you)
                        }
                        .font(TrustTheme.ui(15, weight: .medium))
                        .foregroundStyle(palette.ink)
                    }
                }
            }
        }
    }
}
