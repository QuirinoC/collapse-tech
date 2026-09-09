import SwiftUI
import TrustCore

/// Circle — vertical list of people who share with you. No map-first home.
struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        Group {
            if model.pairIsActive {
                circleList
            } else {
                ScrollView {
                    InviteView(compactEmptyState: true)
                        .padding(.top, 8)
                }
            }
        }
        .background(palette.paper.ignoresSafeArea())
        .onAppear {
            model.location.setMapActive(false)
        }
    }

    /// Native `List` for scannable people rows (HIG: Prefer displaying text in a list).
    private var circleList: some View {
        List {
            if model.isSharingLocation && model.location.needsAlwaysForSharing {
                Section {
                    alwaysBanner
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                .listRowBackground(palette.paper)
                .listRowSeparator(.hidden)
            }

            if let banner = model.coverage.banner {
                Section {
                    Text(banner.uppercased())
                        .font(TrustTheme.folio(10))
                        .tracking(1.1)
                        .foregroundStyle(palette.accent)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityAddTraits(.isStaticText)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                .listRowBackground(palette.paper)
                .listRowSeparator(.hidden)
            }

            Section {
                ForEach(model.circle) { member in
                    personRow(member)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                        .listRowBackground(palette.paper)
                        .listRowSeparatorTint(palette.ink.opacity(0.08))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(palette.paper.ignoresSafeArea())
    }

    private var alwaysBanner: some View {
        HStack(alignment: .center, spacing: 10) {
            TrustFolio(text: TrustCopy.alwaysForSharing, color: palette.accent, size: 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(model.location.needsSystemSettings ? TrustCopy.openSettings : TrustCopy.allowAlways) {
                if model.location.needsSystemSettings {
                    model.openSystemSettings()
                } else {
                    model.requestAlwaysLocation()
                }
            }
            .font(TrustTheme.folio(11))
            .tracking(1.0)
            .textCase(.uppercase)
            .foregroundStyle(palette.ink)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(model.location.needsSystemSettings ? TrustCopy.openSettings : TrustCopy.allowAlways)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { TrustHairline() }
    }

    private func personRow(_ member: TrustedPerson) -> some View {
        let subtitle = inboundSubtitle(for: member)
        let accentVerb = isAccentSubtitle(member)
        let action = lookingAt(member) || member.inboundLive ? TrustCopy.view : TrustCopy.look
        return Button {
            activate(member)
        } label: {
            HStack(alignment: .center, spacing: 14) {
                TrustPersonAvatar(name: member.displayName, index: avatarIndex(for: member))

                VStack(alignment: .leading, spacing: 4) {
                    Text(member.person.displayName)
                        .font(TrustTheme.display(22))
                        .foregroundStyle(palette.ink)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(TrustTheme.ui(14))
                        .foregroundStyle(accentVerb ? palette.accent : palette.muted)
                        .lineLimit(2)
                }

                Spacer(minLength: 8)

                trailingControl(for: member)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(member.person.displayName), \(subtitle)")
        .accessibilityHint(action == TrustCopy.look
            ? TrustCopy.lookWillNotify
            : TrustCopy.view)
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private func trailingControl(for member: TrustedPerson) -> some View {
        if lookingAt(member) || member.inboundLive {
            Text(TrustCopy.view.uppercased())
                .font(TrustTheme.folio(11))
                .tracking(1.0)
                .foregroundStyle(palette.ink)
                .padding(.horizontal, 14)
                .frame(minWidth: 64, minHeight: 44)
                .overlay(Rectangle().stroke(palette.ink, lineWidth: 1))
                .accessibilityHidden(true)
        } else {
            Text(TrustCopy.look.uppercased())
                .font(TrustTheme.folio(11))
                .tracking(1.0)
                .foregroundStyle(palette.accentOn)
                .padding(.horizontal, 14)
                .frame(minWidth: 64, minHeight: 44)
                .background(palette.accent)
                .accessibilityHidden(true)
        }
    }

    private func activate(_ member: TrustedPerson) {
        if lookingAt(member) || member.inboundLive {
            model.openMap(for: member)
        } else {
            model.openLook(for: member.person)
        }
    }

    private func lookingAt(_ member: TrustedPerson) -> Bool {
        model.activeSession?.event.subjectID == member.id
    }

    private func isAccentSubtitle(_ member: TrustedPerson) -> Bool {
        if let promise = member.promise, !promise.youAreSubject, promise.status == .overdue {
            return true
        }
        return !member.inboundLive
    }

    /// Permission-aware: sealed → Home/Away only; live → place OK.
    private func inboundSubtitle(for member: TrustedPerson) -> String {
        if let promise = member.promise, !promise.youAreSubject {
            switch promise.status {
            case .overdue:
                return TrustCopy.promiseOverdue
            case .noSignal:
                return TrustCopy.promiseNoSignal
            case .resolved, .active:
                break
            }
        }

        let presence = presenceLabel(for: member)

        if member.inboundLive {
            if let place = livePlaceContext(for: member) {
                return "\(presence) · \(place)"
            }
            return presence
        }

        // Sealed / Until they look: Home/Away only — never neighborhood·distance.
        return presence
    }

    private func presenceLabel(for member: TrustedPerson) -> String {
        guard member.inboundPresenceGranted, let home = member.homePresence else {
            return member.inboundLive ? TrustCopy.live : TrustCopy.sealed.capitalized
        }
        switch home.state {
        case .home: return TrustCopy.homeChip
        case .away: return TrustCopy.awayChip
        case .unknown: return member.inboundLive ? TrustCopy.live : TrustCopy.sealed.capitalized
        }
    }

    private func livePlaceContext(for member: TrustedPerson) -> String? {
        guard member.inboundLive else { return nil }
        if let home = member.homePresence {
            switch home.state {
            case .home:
                if let label = home.placeLabel, label != "Home", !label.isEmpty {
                    return label
                }
                return nil
            case .away, .unknown:
                if let label = home.placeLabel, label != "Home", !label.isEmpty {
                    return label
                }
            }
        }
        return nil
    }

    private func avatarIndex(for member: TrustedPerson) -> Int {
        model.circle.firstIndex(where: { $0.id == member.id }) ?? 0
    }
}

struct TrustPersonAvatar: View {
    let name: String
    var index: Int = 0
    @Environment(\.trustPalette) private var palette

    private static let fills: [Color] = [
        Color(red: 0.12, green: 0.12, blue: 0.12),
        Color(red: 0.28, green: 0.28, blue: 0.28),
        Color(red: 0.42, green: 0.42, blue: 0.42),
        Color(red: 0.18, green: 0.22, blue: 0.20),
        Color(red: 0.22, green: 0.18, blue: 0.18)
    ]

    var body: some View {
        Text(name.trustInitials)
            .font(TrustTheme.label(14))
            .foregroundStyle(palette.paper)
            .frame(width: 48, height: 48)
            .background(Self.fills[abs(index) % Self.fills.count])
            .clipShape(Circle())
            .accessibilityHidden(true)
    }
}
