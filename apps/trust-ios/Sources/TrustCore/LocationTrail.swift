import Foundation

public enum LocationTrail {
    /// Mission District–ish walk used for the review simulator feed.
    public static let home = LocationPoint(
        timestamp: Date(timeIntervalSince1970: 0),
        latitude: 37.7599,
        longitude: -122.4148
    )

    public static func seed(
        around origin: LocationPoint,
        now: Date,
        hours: Double,
        intervalMinutes: Double = 5,
        drift: Double = 0
    ) -> [LocationPoint] {
        let totalMinutes = hours * 60
        let steps = Int(totalMinutes / intervalMinutes)
        return (0...steps).map { index in
            let minutesAgo = totalMinutes - Double(index) * intervalMinutes
            let progress = Double(index) / Double(max(steps, 1))
            let lat = origin.latitude
                + 0.004 * sin(progress * .pi * 2)
                + 0.0015 * progress
                + drift
            let lon = origin.longitude
                + 0.005 * (cos(progress * .pi * 2) - 1)
                - 0.0008 * progress
                + drift * 0.6
            return LocationPoint(
                timestamp: now.addingTimeInterval(-minutesAgo * 60),
                latitude: lat,
                longitude: lon
            )
        }
    }

    public static func step(_ point: LocationPoint, at time: Date, phase: Double) -> LocationPoint {
        LocationPoint(
            timestamp: time,
            latitude: point.latitude + 0.00012 * sin(phase),
            longitude: point.longitude + 0.00012 * cos(phase * 0.7)
        )
    }

    public static func isNearHome(_ point: LocationPoint, home: LocationPoint = home) -> Bool {
        let dlat = point.latitude - home.latitude
        let dlon = point.longitude - home.longitude
        let meters = sqrt(dlat * dlat + dlon * dlon) * 111_000
        return meters < 120
    }
}
