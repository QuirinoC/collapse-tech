import SwiftUI
import TrustCore

/// Outbound sharing — Until / Always / While per person. No They/I switch.
struct SharingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var duration: TimedShareDuration = .hour

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(TrustCopy.peopleITrust)
                        .font(TrustTheme.display(28))
                        .foregroundStyle(palette.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(TrustCopy.peopleITrustSub)
                        .font(TrustTheme.ui(15))
                        .foregroundStyle(palette.muted)
                }
                .padding(.vertical, 6)
                .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 8, trailing: 20))
                .listRowBackground(palette.paper)
                .listRowSeparator(.hidden)
            }

            if !model.circle.isEmpty {
                Section {
                    Button(TrustCopy.setAllUntilTheyLook) {
                        model.setAllUntilTheyLook()
                    }
                    .font(TrustTheme.folio(11))
                    .tracking(0.9)
                    .textCase(.uppercase)
                    .foregroundStyle(palette.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                    .listRowBackground(palette.paper)
                    .accessibilityLabel(TrustCopy.setAllUntilTheyLook)
                }
            }

            if model.circle.isEmpty {
                Section {
                    Text(TrustCopy.inviteSomeoneBody)
                        .font(TrustTheme.ui(15))
                        .foregroundStyle(palette.muted)
                        .listRowBackground(palette.paper)
                }
            } else {
                Section {
                    ForEach(model.circle) { member in
                        shareRow(member)
                            .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                            .listRowBackground(palette.paper)
                            .listRowSeparatorTint(palette.ink.opacity(0.08))
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(palette.paper.ignoresSafeArea())
        .sheet(isPresented: $model.showingTimedShare) {
            timedDurationSheet
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(palette.paper)
        }
    }

    private func shareRow(_ member: TrustedPerson) -> some View {
        let state = model.shareState(for: member.id)
        let presentation = state.presentation(at: Date())
        let mode = outboundMode(presentation)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                TrustPersonAvatar(name: member.displayName, index: avatarIndex(for: member))
                VStack(alignment: .leading, spacing: 2) {
                    Text(member.person.displayName)
                        .font(TrustTheme.ui(17, weight: .semibold))
                        .foregroundStyle(palette.ink)
                    Text(member.person.identity)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            // System segmented control — HIG touch targets / familiar selection affordance.
            Picker(TrustCopy.sharing, selection: Binding(
                get: { mode },
                set: { newMode in
                    switch newMode {
                    case .until:
                        model.setUntilTheyLook(personID: member.id)
                    case .always:
                        model.setAlways(personID: member.id)
                    case .timed:
                        model.openTimedSharePicker(personID: member.id)
                    }
                }
            )) {
                Text(TrustCopy.untilShort).tag(OutboundMode.until)
                Text(TrustCopy.always).tag(OutboundMode.always)
                Text(TrustCopy.whileShort).tag(OutboundMode.timed)
            }
            .pickerStyle(.segmented)
            .accessibilityLabel(TrustCopy.sharing)
            .tint(palette.accent)

            Toggle(isOn: Binding(
                get: { member.outboundPresenceGranted },
                set: { model.setPresenceGrant(personID: member.id, enabled: $0) }
            )) {
                Text(TrustCopy.homePresenceShort)
                    .font(TrustTheme.ui(14, weight: .medium))
                    .foregroundStyle(palette.ink)
            }
            .tint(palette.accent)
            .frame(minHeight: 44)

            if case .timed(let until, _) = presentation {
                Text(until, style: .relative)
                    .font(TrustTheme.folio(10))
                    .tracking(0.8)
                    .foregroundStyle(palette.accent)
                    .textCase(.uppercase)
            }
        }
    }

    private var timedDurationSheet: some View {
        let name = model.circle.first(where: { $0.id == model.timedSharePersonID })?.person.displayName
            ?? TrustCopy.them
        return NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                TrustFolio(text: "\(TrustCopy.tagException) · \(name)", size: 10)
                    .padding(.bottom, 8)
                Text(TrustCopy.forAWhile)
                    .font(TrustTheme.display(26))
                    .foregroundStyle(palette.ink)
                    .padding(.bottom, 8)
                TrustRule(width: 44, draws: true)
                    .padding(.bottom, 14)
                Text(TrustCopy.forAWhileBody(name: name))
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)
                    .padding(.bottom, 18)

                List {
                    ForEach(TimedShareDuration.allCases, id: \.self) { option in
                        Button {
                            duration = option
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.label)
                                        .font(TrustTheme.ui(16, weight: .semibold))
                                        .foregroundStyle(palette.ink)
                                    Text(option.afterPhrase)
                                        .font(TrustTheme.ui(13))
                                        .foregroundStyle(palette.muted)
                                }
                                Spacer()
                                if duration == option {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(palette.accent)
                                        .accessibilityHidden(true)
                                }
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(palette.paper)
                        .accessibilityAddTraits(duration == option ? [.isSelected] : [])
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)

                Spacer(minLength: 16)

                Button(TrustCopy.shareForAWhile) {
                    if let id = model.timedSharePersonID {
                        model.setTimedShare(personID: id, duration: duration)
                    }
                    model.dismissTimedSharePicker()
                }
                .buttonStyle(TrustFilledButtonStyle())
                .padding(.bottom, 8)

                Button(TrustCopy.cancel) {
                    model.dismissTimedSharePicker()
                }
                .buttonStyle(TrustTextButtonStyle())
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .padding(24)
            .background(palette.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(TrustCopy.cancel) {
                        model.dismissTimedSharePicker()
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private enum OutboundMode: Hashable {
        case until, always, timed
    }

    private func outboundMode(_ presentation: SharePresentation) -> OutboundMode {
        switch presentation {
        case .untilTheyLook: return .until
        case .always: return .always
        case .timed: return .timed
        }
    }

    private func avatarIndex(for member: TrustedPerson) -> Int {
        model.circle.firstIndex(where: { $0.id == member.id }) ?? 0
    }
}
