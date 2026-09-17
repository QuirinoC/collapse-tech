import SwiftUI
import TrustCore

/// T1 Circle — list-first. SHARED WITH YOU + Map →; rows are Sealed (Look) or Available (View).
/// No `+`, no counters, no page title competing with the wordmark.
struct CircleView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        NavigationStack(path: $model.circlePath) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if model.circle.isEmpty {
                        TrustEmptyState(
                            glyph: "lock",
                            title: TrustCopy.circleEmptyTitle,
                            message: TrustCopy.circleEmptyBody,
                            actionTitle: TrustCopy.inviteSomeone
                        ) {
                            model.selectedTab = .invite
                        }
                    } else {
                        TrustSectionHeading(TrustCopy.sharedWithYou) {
                            Button(TrustCopy.map) { model.openMap() }
                                .buttonStyle(TrustLinkButtonStyle())
                                .accessibilityLabel(TrustCopy.mapAccessibility)
                        }
                        .padding(.top, 6)

                        ForEach(sharing) { member in
                            CirclePersonRow(member: member, seed: seed(member))
                            TrustRowDivider()
                        }

                        if !notSharing.isEmpty {
                            TrustSectionHeading(TrustCopy.notSharingWithYou)
                                .padding(.top, 22)
                            ForEach(notSharing) { member in
                                CirclePersonRow(member: member, seed: seed(member))
                                TrustRowDivider()
                            }
                        }

                        TrustFootnote(text: TrustCopy.circleFootnote)
                            .padding(.top, 18)
                    }
                }
                .padding(.horizontal, TrustTheme.gutter)
                .padding(.bottom, 24)
                .trustReadableWidth()
            }
            .background(palette.paper.ignoresSafeArea())
            .refreshable { await model.refresh() }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: CircleRoute.self) { route in
                switch route {
                case .view(let id):
                    ViewScreen(personID: id)
                case .map:
                    MapScreen()
                }
            }
        }
        .onAppear { model.releaseMapLocation() }
    }

    private var sharing: [TrustedPerson] {
        model.circle.filter { !isNotSharing($0) }
    }

    private var notSharing: [TrustedPerson] {
        model.circle.filter { isNotSharing($0) }
    }

    /// Prefer the inbound share when the payload has it; otherwise the Look-probe set.
    private func isNotSharing(_ member: TrustedPerson) -> Bool {
        if let inbound = member.inboundPresentation { return inbound.isOff }
        return model.notSharingWithYou.contains(member.id)
    }

    private func seed(_ member: TrustedPerson) -> Int {
        model.circle.firstIndex { $0.id == member.id } ?? 0
    }
}

/// `.person-row` — avatar, name, permission-aware status, Look / View pill.
struct CirclePersonRow: View {
    let member: TrustedPerson
    var seed: Int = 0
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    private enum Action { case look, view, none }

    private var isNotSharing: Bool {
        if let inbound = member.inboundPresentation { return inbound.isOff }
        return model.notSharingWithYou.contains(member.id)
    }
    private var opened: Bool { model.isOpened(member) }

    private var action: Action {
        if isNotSharing { return .none }
        if member.isAvailable || opened { return .view }
        return .look
    }

    var body: some View {
        Button {
            switch action {
            case .look: model.openLook(member)
            case .view: model.openView(member)
            case .none: break
            }
        } label: {
            HStack(alignment: .center, spacing: 12) {
                TrustAvatar(name: member.person.displayName, seed: seed, size: 44)
                VStack(alignment: .leading, spacing: 5) {
                    Text(member.person.displayName)
                        .trustFont(15, weight: .semibold)
                        .foregroundStyle(palette.ink)
                        .lineLimit(1)
                    statusLine
                }
                Spacer(minLength: 8)
                if action != .none {
                    Text(action == .look ? TrustCopy.look : TrustCopy.view)
                        .trustFont(13, weight: .semibold)
                        .foregroundStyle(action == .look ? palette.accent : Color(hex: 0x77796F))
                        .padding(.horizontal, 14)
                        .frame(minWidth: 66, minHeight: 34)
                        .background(Capsule().stroke(action == .look ? Color(hex: 0xF0C8BE) : palette.line, lineWidth: 1))
                        .accessibilityHidden(true)
                }
            }
            .padding(.vertical, 14)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == .none)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(member.person.displayName). \(statusText)")
        .accessibilityHint(hint)
    }

    @ViewBuilder
    private var statusLine: some View {
        if isNotSharing {
            TrustStatusLine(glyph: "lock", text: TrustCopy.rowNotSharingWithYou)
        } else if opened, member.isSealed {
            TrustStatusLine(glyph: "eye", text: TrustCopy.rowLookedTapView)
        } else if member.isAvailable {
            if let presence = member.visiblePresence {
                TrustStatusLine(presence: presence, text: TrustCopy.rowAvailable(presence: presence.label))
            } else {
                TrustStatusLine(glyph: "eye", text: TrustCopy.rowAvailablePresenceHidden)
            }
        } else if let presence = member.visiblePresence {
            TrustStatusLine(presence: presence, text: TrustCopy.rowSealed(presence: presence.label))
        } else {
            TrustStatusLine(glyph: "lock", text: TrustCopy.rowSealedPresenceHidden)
        }
    }

    private var statusText: String {
        if isNotSharing { return TrustCopy.rowNotSharingWithYou }
        if opened, member.isSealed { return TrustCopy.rowLookedTapView }
        if member.isAvailable {
            return member.visiblePresence.map { TrustCopy.rowAvailable(presence: $0.label) } ?? TrustCopy.rowAvailablePresenceHidden
        }
        return member.visiblePresence.map { TrustCopy.rowSealed(presence: $0.label) } ?? TrustCopy.rowSealedPresenceHidden
    }

    private var hint: String {
        switch action {
        case .look: return TrustCopy.lookHint(name: member.firstName)
        case .view: return TrustCopy.viewHint(name: member.firstName)
        case .none: return ""
        }
    }
}
