import MapKit
import SwiftUI
import TrustCore

struct LookMapView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        ZStack(alignment: .top) {
            palette.paper.ignoresSafeArea()
            if let session = model.activeSession {
                map(session)
                    .ignoresSafeArea()
                hud(session)
            } else {
                VStack(spacing: 16) {
                    Text(TrustCopy.lookClosed)
                        .font(TrustTheme.display(22))
                        .foregroundStyle(palette.ink)
                    Button(TrustCopy.done) { model.closeMap() }
                        .buttonStyle(TrustFilledButtonStyle())
                        .padding(.horizontal, 24)
                }
            }
        }
        .onAppear {
            if let live = model.activeSession?.live {
                position = .region(
                    MKCoordinateRegion(
                        center: live.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                    )
                )
            }
        }
    }

    private func map(_ session: LookSession) -> some View {
        Map(position: $position) {
            MapPolyline(coordinates: session.trail.map(\.coordinate))
                .stroke(palette.ink, lineWidth: 2.5)
            Annotation(TrustCopy.live, coordinate: session.live.coordinate) {
                TrustLivePin(
                    initials: session.event.subjectName.trustInitials,
                    caption: TrustCopy.live
                )
            }
        }
        .mapStyle(mapStyle)
        .colorScheme(model.appearance.nightEdition ? .dark : .light)
        .mapControls {
            MapCompass()
            MapPitchToggle()
        }
    }

    private var mapStyle: MapStyle {
        if #available(iOS 18.0, *) {
            return .standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll)
        }
        return .standard(elevation: .flat, pointsOfInterest: .excludingAll)
    }

    private func hud(_ session: LookSession) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(TrustCopy.mastheadName)
                    .font(TrustTheme.display(24))
                    .foregroundStyle(palette.ink)
                    .accessibilityLabel(TrustCopy.appName)
                Spacer()
                Button(TrustCopy.close) { model.closeMap() }
                    .buttonStyle(TrustHardButtonStyle())
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)
            TrustHairline()
                .padding(.horizontal, 16)

            Spacer()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    TrustFolio(text: TrustCopy.watchingNow, color: palette.accent, size: 10)
                    Spacer()
                    TrustFolio(text: TrustCopy.lastHours(session.event.historyWindowHours), size: 10)
                }
                Text(session.event.subjectName)
                    .font(TrustTheme.display(22))
                    .foregroundStyle(palette.ink)
                Text(TrustCopy.subjectNotified(name: session.event.subjectName))
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                if model.coverage.canExtendHistory,
                   session.event.historyWindowHours <= CircleCoverage.freeHistoryHours {
                    Button(TrustCopy.includeLast24Hours) {
                        model.extendLookHistory()
                    }
                    .buttonStyle(TrustTextButtonStyle())
                    .padding(.top, 2)
                }
            }
            .padding(14)
            .background(palette.paper)
            .overlay(Rectangle().stroke(palette.ink, lineWidth: 1))
            .padding(12)
        }
    }
}

extension LocationPoint {
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
