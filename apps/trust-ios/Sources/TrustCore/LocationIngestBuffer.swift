import Foundation

/// Client-side buffer of GPS points waiting to reach the API.
/// Server retention is 26 hours; this matches that so a failed ingest does not
/// drop the Look trail. Not a 30-day on-device dossier.
public struct LocationIngestBuffer: Equatable, Codable, Sendable {
    public static let retention: TimeInterval = 26 * 60 * 60

    public var points: [LocationPoint]

    public init(points: [LocationPoint] = []) {
        self.points = points
    }

    public mutating func append(_ incoming: [LocationPoint], now: Date) {
        for point in incoming.sorted(by: { $0.timestamp < $1.timestamp }) {
            if points.last == point { continue }
            points.append(point)
        }
        prune(now: now)
    }

    public mutating func prune(now: Date) {
        let oldest = now.addingTimeInterval(-Self.retention)
        let newest = now.addingTimeInterval(120)
        points.removeAll { $0.timestamp < oldest || $0.timestamp > newest }
        points.sort { $0.timestamp < $1.timestamp }
    }

    public mutating func removePrefix(_ count: Int) {
        guard count > 0, !points.isEmpty else { return }
        points.removeFirst(min(count, points.count))
    }
}
