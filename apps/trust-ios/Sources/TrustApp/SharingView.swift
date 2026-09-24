import SwiftUI
import TrustCore

/// T2 Sharing — what each person can see of you. Until / Always / For a while inline,
/// Pause and Stop on every row, Remove to drop the pair. Always and For a while carry a
/// Plus mark when not covered; tapping them is the intent-triggered paywall placement.
struct SharingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var stopTarget: TrustedPerson?
    @State private var pauseTarget: TrustedPerson?
    @State private var removeTarget: TrustedPerson?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustPageTitle(text: TrustCopy.sharing)
                    .padding(.top, 4)
                Text(TrustCopy.sharingSub)
                    .trustFont(13)
                    .foregroundStyle(palette.muted)
                    .padding(.top, 6)

                if model.circle.isEmpty {
                    TrustEmptyState(
                        glyph: "person.badge.plus",
                        title: TrustCopy.sharingEmptyTitle,
                        message: TrustCopy.sharingEmptyBody,
                        actionTitle: TrustCopy.inviteSomeone
                    ) {
                        model.selectedTab = .invite
                    }
                } else {
                    Text(TrustCopy.sharingIntro)
                        .trustFont(13)
                        .lineSpacing(3)
                        .foregroundStyle(Color(hex: 0x787B71))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                        .padding(.bottom, 20)

                    if let banner = model.coverage.banner {
                        TrustEyebrow(text: banner, color: palette.accent, size: 10)
                            .padding(.bottom, 12)
                    }

                    TrustSectionHeading(TrustCopy.youShareWith(count: model.circle.count))

                    ForEach(model.circle) { member in
                        OutboundRow(
                            member: member,
                            seed: seed(member),
                            onPause: { pauseTarget = member },
                            onStop: { stopTarget = member },
                            onRemove: { removeTarget = member }
                        )
                        TrustRowDivider()
                    }

                    Button {
                        model.selectedTab = .invite
                    } label: {
                        Label(TrustCopy.inviteSomeone, systemImage: "plus")
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    .padding(.top, 18)

                    Text(TrustCopy.modeKey)
                        .trustFont(12)
                        .lineSpacing(4)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(palette.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(.top, 20)
                }
            }
            .padding(.horizontal, TrustTheme.gutter)
            .padding(.bottom, 28)
            .trustReadableWidth()
        }
        .background(palette.paper.ignoresSafeArea())
        .refreshable { await model.refresh() }
        .confirmationDialog(
            stopTarget.map { TrustCopy.stopConfirm(name: $0.firstName) } ?? "",
            isPresented: Binding(get: { stopTarget != nil }, set: { if !$0 { stopTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(TrustCopy.stop, role: .destructive) {
                if let target = stopTarget { model.stopSharing(personID: target.id) }
                stopTarget = nil
            }
            Button(TrustCopy.cancel, role: .cancel) { stopTarget = nil }
        }
        .confirmationDialog(
            pauseTarget.map { TrustCopy.pauseConfirm(name: $0.firstName) } ?? "",
            isPresented: Binding(get: { pauseTarget != nil }, set: { if !$0 { pauseTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(TrustCopy.pause, role: .destructive) {
                if let target = pauseTarget { model.pauseSharing(personID: target.id) }
                pauseTarget = nil
            }
            Button(TrustCopy.cancel, role: .cancel) { pauseTarget = nil }
        }
        .confirmationDialog(
            removeTarget.map { TrustCopy.removeConfirm(name: $0.firstName) } ?? "",
            isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(TrustCopy.remove, role: .destructive) {
                if let target = removeTarget { model.removePerson(personID: target.id) }
                removeTarget = nil
            }
            Button(TrustCopy.cancel, role: .cancel) { removeTarget = nil }
        }
    }

    private func seed(_ member: TrustedPerson) -> Int {
        model.circle.firstIndex { $0.id == member.id } ?? 0
    }
}

/// `.outbound-row` — person, current state, mode control, description + Pause / Stop / Remove.
struct OutboundRow: View {
    let member: TrustedPerson
    var seed: Int = 0
    let onPause: () -> Void
    let onStop: () -> Void
    let onRemove: () -> Void
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    private enum Mode: Hashable { case until, always, timed }

    private var presentation: SharePresentation {
        model.shareState(for: member.id).presentation(at: Date())
    }

    private var selection: Mode? {
        switch presentation {
        case .off, .pause: return nil
        case .untilTheyLook: return .until
        case .always: return .always
        case .timed: return .timed
        }
    }

    private var locked: Bool { !model.coverage.canShareAvailable }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                TrustAvatar(name: member.person.displayName, seed: seed, size: 38)
                VStack(alignment: .leading, spacing: 4) {
                    Text(member.person.displayName)
                        .trustFont(15, weight: .semibold)
                        .foregroundStyle(palette.ink)
                    Text(stateLabel)
                        .trustFont(12)
                        .foregroundStyle(palette.muted)
                }
                Spacer()
                Image(systemName: presentation.isAvailable ? "eye" : "lock")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color(hex: 0x858B7B))
                    .accessibilityHidden(true)
            }
            .accessibilityElement(children: .combine)

            TrustModeControl<Mode>(
                items: [
                    .init(id: .until, label: TrustCopy.untilTheyLook),
                    .init(id: .always, label: TrustCopy.always, locked: locked),
                    .init(id: .timed, label: TrustCopy.forAWhile, locked: locked)
                ],
                selection: selection
            ) { mode in
                switch mode {
                case .until: model.setResting(.untilTheyLook, for: member.id)
                case .always: model.setResting(.always, for: member.id)
                case .timed: model.openTimedSharePicker(personID: member.id)
                }
            }
            .accessibilityLabel(TrustCopy.sharingModeLabel(name: member.firstName))

            if case .timed(let ends, _) = presentation {
                HStack(spacing: 8) {
                    Image(systemName: "clock")
                        .font(.system(size: 12, weight: .medium))
                        .accessibilityHidden(true)
                    Text(ends, style: .relative)
                    Spacer()
                    Button(TrustCopy.howLong) { model.openTimedSharePicker(personID: member.id) }
                        .buttonStyle(TrustLinkButtonStyle())
                }
                .font(TrustTheme.ui(12, weight: .medium))
                .foregroundStyle(palette.muted)
            }

            HStack(alignment: .center, spacing: 8) {
                Text(description)
                    .font(TrustTheme.ui(12))
                    .lineSpacing(2)
                    .foregroundStyle(Color(hex: 0x7F8375))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                if case .pause = presentation {
                    Button(TrustCopy.resume) {
                        model.setResting(.untilTheyLook, for: member.id)
                    }
                    .font(TrustTheme.ui(12, weight: .semibold))
                    .foregroundStyle(palette.ink)
                    .frame(minHeight: 32)
                } else if !presentation.isNotSharing {
                    Button(TrustCopy.pause, action: onPause)
                        .font(TrustTheme.ui(12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x7A7468))
                        .frame(minHeight: 32)
                        .accessibilityLabel("\(TrustCopy.pause) · \(member.person.displayName)")
                }
                if !presentation.isOff {
                    Button(TrustCopy.stop, action: onStop)
                        .font(TrustTheme.ui(12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x9C5C51))
                        .frame(minHeight: 32)
                        .accessibilityLabel("\(TrustCopy.stop) · \(member.person.displayName)")
                }
            }

            Button(TrustCopy.remove, action: onRemove)
                .font(TrustTheme.ui(12, weight: .medium))
                .foregroundStyle(palette.muted)
                .frame(minHeight: 32, alignment: .leading)
                .accessibilityLabel("\(TrustCopy.remove) · \(member.person.displayName)")
        }
        .padding(.vertical, 16)
    }

    private var stateLabel: String {
        switch presentation {
        case .off: return TrustCopy.notSharing
        case .pause: return TrustCopy.paused
        case .untilTheyLook: return TrustCopy.rowSealedUntilLook
        case .always, .timed: return TrustCopy.rowLocationAvailable
        }
    }

    private var description: String {
        switch presentation {
        case .off: return TrustCopy.descOff
        case .pause: return TrustCopy.descPause
        case .untilTheyLook: return TrustCopy.descUntil
        case .always: return TrustCopy.descAlways
        case .timed(let ends, _): return TrustCopy.descTimed(until: ends.formatted(date: .omitted, time: .shortened))
        }
    }
}

/// For a while — 15m / 1h / 4h / 8h. Overlays the current resting mode, then seals.
struct DurationSheet: View {
    let personID: UUID
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var duration: TimedShareDuration = .oneHour

    private var name: String { model.member(personID)?.firstName ?? TrustCopy.them }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrustEyebrow(text: "\(TrustCopy.forAWhile) · \(name)", size: 10)
                .padding(.bottom, 10)
            Text(TrustCopy.howLong)
                .font(TrustTheme.display(30))
                .tracking(-0.8)
                .foregroundStyle(palette.ink)
                .padding(.bottom, 10)
                .accessibilityAddTraits(.isHeader)
            Text(TrustCopy.forAWhileWith(name: name))
                .font(TrustTheme.ui(14))
                .lineSpacing(3)
                .foregroundStyle(palette.muted)
                .padding(.bottom, 18)

            VStack(spacing: 0) {
                ForEach(TimedShareDuration.allCases, id: \.self) { option in
                    Button {
                        duration = option
                    } label: {
                        HStack {
                            Text(option.label)
                                .font(TrustTheme.ui(16, weight: duration == option ? .semibold : .regular))
                                .foregroundStyle(palette.ink)
                            Spacer()
                            if duration == option {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(palette.accent)
                                    .accessibilityHidden(true)
                            }
                        }
                        .frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(duration == option ? [.isSelected] : [])
                    TrustRowDivider()
                }
            }

            Spacer(minLength: 20)

            Button(TrustCopy.shareForAWhile) {
                model.setTimedShare(personID: personID, duration: duration)
            }
            .buttonStyle(TrustFilledButtonStyle())

            Button(TrustCopy.cancel) {
                model.timedSharePersonID = nil
            }
            .buttonStyle(TrustTextButtonStyle())
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 26)
        .padding(.top, 22)
        .padding(.bottom, 20)
        .trustReadableWidth()
        .background(palette.paper.ignoresSafeArea())
        .onAppear {
            if case .timed(let ends, _) = model.shareState(for: personID).presentation(at: Date()) {
                let minutes = Int(ends.timeIntervalSinceNow / 60)
                duration = TimedShareDuration.allCases.min { abs($0.minutes - minutes) < abs($1.minutes - minutes) } ?? .oneHour
            }
        }
    }
}

/// First non-Off share → explain Always before the system prompt.
struct AlwaysExplainerSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TrustEyebrow(text: TrustCopy.location, size: 10)
                .padding(.bottom, 10)
            Text(TrustCopy.alwaysTitle)
                .font(TrustTheme.display(28))
                .tracking(-0.8)
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
                .accessibilityAddTraits(.isHeader)
            Text(model.location.needsSystemSettings ? TrustCopy.keptWhileUsing : TrustCopy.alwaysBody)
                .font(TrustTheme.ui(15))
                .lineSpacing(4)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 20)

            Button(model.location.needsSystemSettings ? TrustCopy.openSettings : TrustCopy.allowAlways) {
                model.allowAlwaysFromExplainer()
            }
            .buttonStyle(TrustFilledButtonStyle())

            Button(TrustCopy.later) {
                model.showingAlwaysExplainer = false
            }
            .buttonStyle(TrustTextButtonStyle())
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 26)
        .padding(.top, 22)
        .padding(.bottom, 20)
        .trustReadableWidth()
        .background(palette.paper.ignoresSafeArea())
    }
}
