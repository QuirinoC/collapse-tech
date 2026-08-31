import Foundation

public protocol TrustClock: Sendable {
    func now() -> Date
}

public struct SystemClock: TrustClock {
    public init() {}
    public func now() -> Date { Date() }
}

public struct Person: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var displayName: String
    public var hasPro: Bool
    public var onboardingComplete: Bool
    public var phoneVerified: Bool

    public init(
        id: UUID = UUID(),
        displayName: String,
        hasPro: Bool = false,
        onboardingComplete: Bool = true,
        phoneVerified: Bool = false
    ) {
        self.id = id
        self.displayName = displayName
        self.hasPro = hasPro
        self.onboardingComplete = onboardingComplete
        self.phoneVerified = phoneVerified
    }
}

public enum PairStatus: String, Codable, Sendable {
    case pending
    case active
    case revoked
}

public struct TrustPair: Identifiable, Hashable, Codable, Sendable {
    public var id: UUID
    public var inviteCode: String
    public var status: PairStatus
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        inviteCode: String,
        status: PairStatus,
        createdAt: Date
    ) {
        self.id = id
        self.inviteCode = inviteCode
        self.status = status
        self.createdAt = createdAt
    }
}

/// Presence without coordinates. Home UI must never derive a map from this.
public struct PresenceSnapshot: Equatable, Codable, Sendable {
    public var lastActiveAt: Date
    public var batteryPercent: Int
    public var isCharging: Bool
    public var gotHomeAt: Date?
    public var checkedInAt: Date?

    public init(
        lastActiveAt: Date,
        batteryPercent: Int,
        isCharging: Bool,
        gotHomeAt: Date? = nil,
        checkedInAt: Date? = nil
    ) {
        self.lastActiveAt = lastActiveAt
        self.batteryPercent = batteryPercent
        self.isCharging = isCharging
        self.gotHomeAt = gotHomeAt
        self.checkedInAt = checkedInAt
    }
}

public struct LocationPoint: Equatable, Codable, Sendable {
    public var timestamp: Date
    public var latitude: Double
    public var longitude: Double

    public init(timestamp: Date, latitude: Double, longitude: Double) {
        self.timestamp = timestamp
        self.latitude = latitude
        self.longitude = longitude
    }
}

public struct LookEvent: Identifiable, Equatable, Codable, Sendable {
    public var id: UUID
    public var viewerID: UUID
    public var viewerName: String
    public var subjectID: UUID
    public var subjectName: String
    public var at: Date
    public var historyWindowHours: Int
    public var includedLive: Bool

    public init(
        id: UUID = UUID(),
        viewerID: UUID,
        viewerName: String,
        subjectID: UUID,
        subjectName: String,
        at: Date,
        historyWindowHours: Int,
        includedLive: Bool
    ) {
        self.id = id
        self.viewerID = viewerID
        self.viewerName = viewerName
        self.subjectID = subjectID
        self.subjectName = subjectName
        self.at = at
        self.historyWindowHours = historyWindowHours
        self.includedLive = includedLive
    }
}

public struct LookSession: Identifiable, Equatable, Sendable {
    public var id: UUID
    public var event: LookEvent
    public var live: LocationPoint
    public var trail: [LocationPoint]

    public init(id: UUID = UUID(), event: LookEvent, live: LocationPoint, trail: [LocationPoint]) {
        self.id = id
        self.event = event
        self.live = live
        self.trail = trail
    }
}

public struct LookReceipt: Equatable, Sendable {
    public var title: String
    public var body: String
    public var at: Date

    public init(title: String, body: String, at: Date) {
        self.title = title
        self.body = body
        self.at = at
    }
}

public enum ShareRestingMode: String, Codable, Sendable, Equatable {
    case untilTheyLook
    case always
}

public enum SharePresentation: Equatable, Sendable {
    case untilTheyLook
    case always
    case timed(ends: Date, revertsTo: ShareRestingMode)
}

public struct PersonShareState: Equatable, Codable, Sendable {
    public var resting: ShareRestingMode
    public var timedUntil: Date?

    public init(resting: ShareRestingMode = .untilTheyLook, timedUntil: Date? = nil) {
        self.resting = resting
        self.timedUntil = timedUntil
    }

    public func presentation(at now: Date) -> SharePresentation {
        if let timedUntil, timedUntil > now {
            return .timed(ends: timedUntil, revertsTo: resting)
        }
        return resting == .always ? .always : .untilTheyLook
    }

    public func chipLabel(at now: Date) -> String {
        switch presentation(at: now) {
        case .untilTheyLook:
            return TrustCopy.untilTheyLook
        case .always:
            return TrustCopy.always
        case .timed(let ends, _):
            let minutes = max(1, Int(ceil(ends.timeIntervalSince(now) / 60)))
            if minutes >= 60 {
                return "\(minutes / 60)h \(minutes % 60)m"
            }
            return "\(minutes)m"
        }
    }
}

/// Your location is in the product whenever anyone is in the circle.
/// Until they look (escrow), Always, and For a while all require Always so Look
/// still works when Trust is not open. An empty circle is not sharing.
public enum OutboundLocationSharing: Sendable {
    public static func isActive(trustedCount: Int) -> Bool {
        trustedCount > 0
    }
}

public enum TimedShareDuration: String, CaseIterable, Sendable, Equatable {
    case hour
    case tonight
    case home

    public var label: String {
        switch self {
        case .hour: return "1 hour"
        case .tonight: return "Tonight"
        case .home: return "Until I get home"
        }
    }

    public var afterPhrase: String {
        switch self {
        case .hour: return "After 1 hour"
        case .tonight: return "After tonight"
        case .home: return "When you get home"
        }
    }

    public func endDate(from now: Date, calendar: Calendar = .current) -> Date {
        switch self {
        case .hour:
            return now.addingTimeInterval(3600)
        case .tonight:
            if let end = calendar.date(bySettingHour: 23, minute: 59, second: 0, of: now), end > now {
                return end
            }
            return now.addingTimeInterval(6 * 3600)
        case .home:
            return now.addingTimeInterval(4 * 3600)
        }
    }
}

public struct TrustedPerson: Identifiable, Equatable, Sendable {
    public var person: Person
    public var presence: PresenceSnapshot
    public var share: PersonShareState
    public var inboundLive: Bool
    /// Coordinates only when this person is visible to you. Always nil when sealed.
    public var livePoint: LocationPoint?

    public var id: UUID { person.id }
    public var displayName: String { person.displayName }

    public init(
        person: Person,
        presence: PresenceSnapshot,
        share: PersonShareState,
        inboundLive: Bool,
        livePoint: LocationPoint? = nil
    ) {
        self.person = person
        self.presence = presence
        self.share = share
        self.inboundLive = inboundLive
        self.livePoint = inboundLive ? livePoint : nil
    }
}

public enum LookError: Error, Equatable {
    case confirmationRequired
    case pairInactive
    case noPartner
}

public enum PairingError: Error, Equatable {
    case invalidCode
    case alreadyPaired
}
