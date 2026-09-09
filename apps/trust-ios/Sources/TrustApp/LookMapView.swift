import MapKit
import SwiftUI
import TrustCore

struct LookMapView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var position: MapCameraPosition = .automatic

    private var display: (name: String, live: LocationPoint, trail: [LocationPoint], watching: Bool)? {
        if let id = model.mapSubjectID {
            return model.mapDisplay(for: id)
        }
        if let session = model.activeSession {
            return model.mapDisplay(for: session.event.subjectID)
        }
        return nil
    }

    var body: some View {
        ZStack(alignment: .top) {
            palette.paper.ignoresSafeArea()
            if let display {
                map(display)
                    .ignoresSafeArea()
                hud(display)
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
            if let live = display?.live {
                position = .region(
                    MKCoordinateRegion(
                        center: live.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                    )
                )
            }
        }
    }

    private func map(
        _ display: (name: String, live: LocationPoint, trail: [LocationPoint], watching: Bool)
    ) -> some View {
        Map(position: $position) {
            MapPolyline(coordinates: display.trail.map(\.coordinate))
                .stroke(palette.ink, lineWidth: 2.5)
            Annotation(TrustCopy.live, coordinate: display.live.coordinate) {
                TrustLivePin(
                    initials: display.name.trustInitials,
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

    private func hud(
        _ display: (name: String, live: LocationPoint, trail: [LocationPoint], watching: Bool)
    ) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(TrustCopy.mastheadName)
                    .font(TrustTheme.display(24))
                    .foregroundStyle(palette.ink)
                    .accessibilityLabel(TrustCopy.appName)
                Spacer()
                Button(TrustCopy.close) { model.closeMap() }
                    .buttonStyle(TrustHardButtonStyle())
                    .accessibilityLabel(TrustCopy.close)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)
            TrustHairline()
                .padding(.horizontal, 16)

            Spacer()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    TrustFolio(
                        text: display.watching ? TrustCopy.watchingNow : TrustCopy.live,
                        color: palette.accent,
                        size: 10
                    )
                    Spacer()
                    if display.watching, let hours = model.activeSession?.event.historyWindowHours {
                        TrustFolio(text: TrustCopy.lastHours(hours), size: 10)
                    }
                }
                Text(display.name)
                    .font(TrustTheme.display(22))
                    .foregroundStyle(palette.ink)
                if display.watching {
                    Text(TrustCopy.subjectNotified(name: display.name))
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    if model.coverage.canExtendHistory,
                       let hours = model.activeSession?.event.historyWindowHours,
                       hours <= CircleCoverage.freeHistoryHours {
                        Button(TrustCopy.includeLast24Hours) {
                            model.extendLookHistory()
                        }
                        .buttonStyle(TrustTextButtonStyle())
                        .padding(.top, 2)
                    }
                } else {
                    Text(TrustCopy.mapLiveBody(name: display.name))
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
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
