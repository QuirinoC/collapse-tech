import MapKit
import SwiftUI
import TrustCore

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        ZStack(alignment: .top) {
            map
                .ignoresSafeArea()

            VStack(spacing: 0) {
                chrome
                Spacer(minLength: 0)
                if model.pairIsActive {
                    sealedMarks
                    peopleIndex
                } else {
                    PairingView()
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                }
            }
        }
        .background(palette.paper.ignoresSafeArea())
        .onAppear {
            frameMap()
            model.prepareMapLocation()
            Task { await model.refresh() }
        }
        .onDisappear {
            model.location.setMapActive(false)
        }
        .onChange(of: model.activeSession?.id) { _, _ in frameMap() }
        .onChange(of: model.circle.count) { _, _ in frameMap() }
        .onChange(of: model.location.lastFix?.latitude) { _, _ in frameMap() }
    }

    private var chrome: some View {
        VStack(spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 14) {
                Text(TrustCopy.mastheadName)
                    .font(TrustTheme.display(26))
                    .foregroundStyle(palette.ink)
                    .accessibilityLabel(TrustCopy.appName)
                Spacer()
                Button {
                    model.showingSettings = true
                } label: {
                    TrustFolio(text: model.you.identity, color: palette.muted, size: 10)
                }
                .accessibilityLabel(TrustCopy.settings)
                Button {
                    model.showingLookLog = true
                } label: {
                    Text(logLabel)
                        .font(TrustTheme.folio(11))
                        .tracking(1.1)
                        .foregroundStyle(palette.ink)
                }
                .accessibilityLabel(TrustCopy.lookLog)
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 8)

            if model.beingWatched != nil {
                HStack {
                    TrustFolio(text: TrustCopy.theyAreLooking, color: palette.accent, size: 10)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }

            if model.isSharingLocation && model.location.needsAlwaysForSharing {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    TrustFolio(text: TrustCopy.alwaysForSharing, color: palette.accent, size: 10)
                    Spacer()
                    Button(model.location.needsSystemSettings ? TrustCopy.openSettings : TrustCopy.allowAlways) {
                        if model.location.needsSystemSettings {
                            model.openSystemSettings()
                        } else {
                            model.requestAlwaysLocation()
                        }
                    }
                    .font(TrustTheme.folio(10))
                    .tracking(1.0)
                    .textCase(.uppercase)
                    .foregroundStyle(palette.ink)
                    .accessibilityHint(TrustCopy.alwaysNeededForSharing)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }

            if let banner = model.coverage.banner {
                Text(banner.uppercased())
                    .font(TrustTheme.folio(10))
                    .tracking(1.1)
                    .foregroundStyle(palette.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
        }
        .background(palette.paper.opacity(0.94))
        .overlay(alignment: .bottom) { TrustHairline() }
    }

    private var map: some View {
        Map(position: $position) {
            if let coordinate = youCoordinate {
                Annotation(TrustCopy.you, coordinate: coordinate) {
                    TrustLivePin(initials: "Y", caption: TrustCopy.you, you: true)
                }
            }
            ForEach(liveMembers) { member in
                if let coordinate = liveCoordinate(for: member) {
                    Annotation(member.displayName, coordinate: coordinate) {
                        Button {
                            activate(member)
                        } label: {
                            TrustLivePin(
                                initials: member.displayName.trustInitials,
                                caption: caption(for: member)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(accessibilityLabel(for: member))
                    }
                }
            }
        }
        .mapStyle(mapStyle)
        .mapControls { }
        .colorScheme(model.appearance.nightEdition ? .dark : .light)
        .accessibilityLabel(TrustCopy.circleMapAccessibility)
    }

    private var mapStyle: MapStyle {
        if #available(iOS 18.0, *) {
            return .standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll)
        }
        return .standard(elevation: .flat, pointsOfInterest: .excludingAll)
    }

    /// Lock chips on the map surface — never a coordinate for sealed people.
    private var sealedMarks: some View {
        Group {
            if sealedMembers.isEmpty {
                EmptyView()
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(sealedMembers) { member in
                        Button {
                            model.openLook(for: member.person)
                        } label: {
                            TrustSealedMark(initials: member.displayName.trustInitials)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(accessibilityLabel(for: member))
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            }
        }
    }

    /// Thin horizontal index — not a column roster.
    private var peopleIndex: some View {
        VStack(spacing: 0) {
            TrustHairline()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.circle) { member in
                        personChip(member)
                    }
                    ShareLink(item: TrustCopy.inviteMessage(code: model.pendingInviteCode ?? "TRUST")) {
                        Text(TrustCopy.inviteLine)
                            .font(TrustTheme.display(15))
                            .foregroundStyle(palette.muted)
                            .padding(.horizontal, 6)
                    }
                    .accessibilityLabel(TrustCopy.inviteAccessibility(line: TrustCopy.inviteLine))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
        }
        .background(palette.paper)
    }

    private func personChip(_ member: TrustedPerson) -> some View {
        let share = member.share.presentation(at: Date())
        return Button {
            activate(member)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(member.displayName)
                    .font(TrustTheme.display(17, italic: true))
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                Text(verb(for: member, share: share))
                    .font(TrustTheme.folio(10))
                    .tracking(1.0)
                    .foregroundStyle(lookingAt(member) || !member.inboundLive ? palette.accent : palette.ink)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: member))
    }

    private var liveMembers: [TrustedPerson] {
        model.circle.filter(\.inboundLive)
    }

    private var sealedMembers: [TrustedPerson] {
        model.circle.filter { !$0.inboundLive }
    }

    private func lookingAt(_ member: TrustedPerson) -> Bool {
        model.activeSession?.event.subjectID == member.id
    }

    private func activate(_ member: TrustedPerson) {
        if lookingAt(member) {
            model.showingMap = true
        } else if member.inboundLive {
            model.openShare(for: member.person)
        } else {
            model.openLook(for: member.person)
        }
    }

    private func verb(for member: TrustedPerson, share: SharePresentation) -> String {
        if lookingAt(member) { return TrustCopy.openMap.uppercased() }
        if !member.inboundLive { return TrustCopy.look.uppercased() }
        switch share {
        case .always: return TrustCopy.always.uppercased()
        case .timed:
            return member.share.chipLabel(at: Date()).uppercased()
        case .untilTheyLook:
            return TrustCopy.look.uppercased()
        }
    }

    private func caption(for member: TrustedPerson) -> String {
        switch member.share.presentation(at: Date()) {
        case .always: return TrustCopy.always
        case .timed: return member.share.chipLabel(at: Date())
        case .untilTheyLook: return TrustCopy.live
        }
    }

    private func accessibilityLabel(for member: TrustedPerson) -> String {
        let share = member.share.presentation(at: Date())
        if member.inboundLive {
            return TrustCopy.visibleNowAccessibility(name: member.displayName, verb: verb(for: member, share: share))
        }
        return TrustCopy.sealedAccessibility(name: member.displayName, verb: verb(for: member, share: share))
    }

    private var youCoordinate: CLLocationCoordinate2D? {
        model.location.lastFix?.coordinate
    }

    private func liveCoordinate(for member: TrustedPerson) -> CLLocationCoordinate2D? {
        guard member.inboundLive else { return nil }
        if let session = model.activeSession, session.event.subjectID == member.id {
            return session.live.coordinate
        }
        return member.livePoint?.coordinate
    }

    private func frameMap() {
        var coordinates: [CLLocationCoordinate2D] = []
        if let you = youCoordinate {
            coordinates.append(you)
        }
        coordinates.append(contentsOf: liveMembers.compactMap(liveCoordinate))
        guard let first = coordinates.first else { return }
        var minLat = first.latitude
        var maxLat = first.latitude
        var minLon = first.longitude
        var maxLon = first.longitude
        for coordinate in coordinates {
            minLat = min(minLat, coordinate.latitude)
            maxLat = max(maxLat, coordinate.latitude)
            minLon = min(minLon, coordinate.longitude)
            maxLon = max(maxLon, coordinate.longitude)
        }
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max(0.02, (maxLat - minLat) * 1.8 + 0.01),
            longitudeDelta: max(0.02, (maxLon - minLon) * 1.8 + 0.01)
        )
        position = .region(MKCoordinateRegion(center: center, span: span))
    }

    private var logLabel: String {
        TrustCopy.lookLogChrome()
    }
}
