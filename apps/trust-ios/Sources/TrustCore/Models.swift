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
    public var handle: String?

    public var identity: String {
        if let handle, !handle.isEmpty {
            return "@\(handle)"
        }
        return displayName
    }

    public init(
        id: UUID = UUID(),
        displayName: String,
        hasPro: Bool = false,
        onboardingComplete: Bool = true,
        phoneVerified: Bool = false,
        handle: String? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.hasPro = hasPro
        self.onboardingComplete = onboardingComplete
        self.phoneVerified = phoneVerified
        self.handle = handle
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

    public static let sealed = PresenceSnapshot(
        lastActiveAt: .distantPast,
        batteryPercent: 0,
        isCharging: false
    )

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

/// Global, manual presence triad. `hidden` is deliberate — the circle sees no signal at all.
/// `unknown` is "no signal yet". Neither carries coordinates.
public enum HomePresenceKind: String, Codable, Sendable, Equatable, CaseIterable {
    case unknown
    case home
    case away
    case hidden

    /// The three the user picks from on You. `unknown` is server-only.
    public static let triad: [HomePresenceKind] = [.home, .away, .hidden]

    public var label: String {
        switch self {
        case .home: return TrustCopy.presenceHome
        case .away: return TrustCopy.presenceAway
        case .hidden: return TrustCopy.presenceHidden
        case .unknown: return TrustCopy.presenceUnknown
        }
    }
}

public struct HomePresenceSnapshot: Equatable, Codable, Sendable {
    public var state: HomePresenceKind
    public var changedAt: Date
    public var placeLabel: String?

    public init(state: HomePresenceKind, changedAt: Date, placeLabel: String? = nil) {
        self.state = state
        self.changedAt = changedAt
        self.placeLabel = placeLabel
    }
}

public enum PromiseKind: String, Codable, Sendable, Equatable {
    case active
    case resolved
    case overdue
    case noSignal = "no_signal"
}

public struct PromiseSnapshot: Identifiable, Equatable, Codable, Sendable {
    public var id: UUID
    public var subjectID: UUID
    public var trusteeID: UUID
    public var placeLabel: String
    public var deadlineAt: Date
    public var status: PromiseKind
    public var resolvedAt: Date?
    public var youAreSubject: Bool

    public init(
        id: UUID,
        subjectID: UUID,
        trusteeID: UUID,
        placeLabel: String,
        deadlineAt: Date,
        status: PromiseKind,
        resolvedAt: Date? = nil,
        youAreSubject: Bool
    ) {
        self.id = id
        self.subjectID = subjectID
        self.trusteeID = trusteeID
        self.placeLabel = placeLabel
        self.deadlineAt = deadlineAt
        self.status = status
        self.resolvedAt = resolvedAt
        self.youAreSubject = youAreSubject
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

/// `look` — Sealed: notify-first confirm, one snapshot, receipt push.
/// `view` — Available: no sheet, logged, no push.
/// `removed` — pair dropped from the circle; Log only.
public enum LookKind: String, Codable, Sendable, Equatable {
    case look
    case view
    case removed
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
    public var kind: LookKind

    public init(
        id: UUID = UUID(),
        viewerID: UUID,
        viewerName: String,
        subjectID: UUID,
        subjectName: String,
        at: Date,
        historyWindowHours: Int = 0,
        includedLive: Bool = true,
        kind: LookKind = .look
    ) {
        self.id = id
        self.viewerID = viewerID
        self.viewerName = viewerName
        self.subjectID = subjectID
        self.subjectName = subjectName
        self.at = at
        self.historyWindowHours = historyWindowHours
        self.includedLive = includedLive
        self.kind = kind
    }

    /// View log is bidirectional; this is the row copy from `you`'s point of view.
    public func logLine(youID: UUID) -> String {
        let youViewed = viewerID == youID
        switch (kind, youViewed) {
        case (.look, true): return TrustCopy.logYouLooked(name: subjectName)
        case (.look, false): return TrustCopy.logTheyLooked(name: viewerName)
        case (.view, true): return TrustCopy.logYouViewed(name: subjectName)
        case (.view, false): return TrustCopy.logTheyViewed(name: viewerName)
        case (.removed, true): return TrustCopy.logYouRemoved(name: subjectName)
        case (.removed, false): return TrustCopy.logTheyRemoved(name: viewerName)
        }
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

/// Resting outbound mode toward one person. Join default is `off` both ways —
/// an invite is not a permission.
public enum ShareRestingMode: String, Codable, Sendable, Equatable {
    case off
    case pause
    case untilTheyLook
    case always

    /// Wire value for `PATCH /people/{id}/share`.
    public var apiValue: String { rawValue }
}

public enum SharePresentation: Equatable, Sendable {
    case off
    case pause
    case untilTheyLook
    case always
    case timed(ends: Date, revertsTo: ShareRestingMode)

    /// Available = Always or For a while. Sealed = Until they look. Off/Pause = nothing.
    public var isAvailable: Bool {
        switch self {
        case .always, .timed: return true
        case .off, .pause, .untilTheyLook: return false
        }
    }

    public var isSealed: Bool {
        if case .untilTheyLook = self { return true }
        return false
    }

    public var isOff: Bool {
        if case .off = self { return true }
        return false
    }

    /// Off or Pause — not sharing; membership stays.
    public var isNotSharing: Bool {
        switch self {
        case .off, .pause: return true
        default: return false
        }
    }
}

public struct PersonShareState: Equatable, Codable, Sendable {
    public var resting: ShareRestingMode
    public var timedUntil: Date?

    public init(resting: ShareRestingMode = .off, timedUntil: Date? = nil) {
        self.resting = resting
        self.timedUntil = timedUntil
    }

    public func presentation(at now: Date) -> SharePresentation {
        if let timedUntil, timedUntil > now {
            return .timed(ends: timedUntil, revertsTo: resting)
        }
        switch resting {
        case .always: return .always
        case .untilTheyLook: return .untilTheyLook
        case .pause: return .pause
        case .off: return .off
        }
    }

    public func chipLabel(at now: Date) -> String {
        switch presentation(at: now) {
        case .off:
            return TrustCopy.notSharing
        case .pause:
            return TrustCopy.paused
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

/// How hard the device works for the circle. Review-critical: tracking is `off` unless an
/// outbound share is on; Sealed-only circles get coarse fixes and significant-change
/// wake-ups; anyone Available (or a fresh Look at you) earns finer, more frequent fixes.
public enum LocationSharingTier: Equatable, Sendable {
    /// Every outbound share is Off — location is not in the product.
    case off
    /// Only Until-they-look shares: hundred-metre fixes, larger distance filter, significant change.
    case sealed
    /// Always / For a while toward someone, or someone just Looked: best accuracy, tight filter.
    case available
}

/// Your location is in the product only while at least one outbound share is actually sharing.
/// Until they look (escrow), Always, and For a while all require Always so Look
/// still works when Trust is not open. An all-Off / all-Pause circle is not sharing.
public enum OutboundLocationSharing: Sendable {
    public static func isActive(shares: [PersonShareState], at now: Date = Date()) -> Bool {
        shares.contains { !$0.presentation(at: now).isNotSharing }
    }

    /// Tier for the location coordinator. `beingWatched` is a live Look at you — a snapshot
    /// was just taken, so keep the next fix honest for a short while.
    public static func tier(shares: [PersonShareState], beingWatched: Bool = false, at now: Date = Date()) -> LocationSharingTier {
        let presentations = shares.map { $0.presentation(at: now) }
        guard presentations.contains(where: { !$0.isNotSharing }) else { return .off }
        if beingWatched || presentations.contains(where: \.isAvailable) { return .available }
        return .sealed
    }
}

/// For a while durations — the only four the API accepts.
public enum TimedShareDuration: String, CaseIterable, Sendable, Equatable {
    case fifteenMinutes = "15m"
    case oneHour = "1h"
    case fourHours = "4h"
    case eightHours = "8h"

    public var minutes: Int {
        switch self {
        case .fifteenMinutes: return 15
        case .oneHour: return 60
        case .fourHours: return 240
        case .eightHours: return 480
        }
    }

    public var label: String {
        switch self {
        case .fifteenMinutes: return TrustCopy.timed15m
        case .oneHour: return TrustCopy.timed1h
        case .fourHours: return TrustCopy.timed4h
        case .eightHours: return TrustCopy.timed8h
        }
    }

    public func endDate(from now: Date) -> Date {
        now.addingTimeInterval(TimeInterval(minutes * 60))
    }
}

public struct TrustedPerson: Identifiable, Equatable, Sendable {
    public var person: Person
    public var presence: PresenceSnapshot
    /// Your outbound share toward this person.
    public var share: PersonShareState
    /// Their share toward you reveals live (Always / For a while) — "Available".
    public var inboundLive: Bool
    /// Coordinates only when this person is visible to you. Always nil when sealed.
    public var livePoint: LocationPoint?
    public var outboundPresenceGranted: Bool
    public var inboundPresenceGranted: Bool
    /// Nil when they are Hidden, have no signal yet, or have not granted presence.
    public var homePresence: HomePresenceSnapshot?
    public var promise: PromiseSnapshot?
    /// Their share toward you, when the server says. Nil = not in the payload (pre-`inboundShare`
    /// servers), so the client only learns "Off" from a `share_off` Look answer.
    public var inboundPresentation: SharePresentation?

    public var id: UUID { person.id }
    public var displayName: String { person.identity }
    /// First name for sheets and toasts ("Look at Maya?").
    public var firstName: String { person.displayName.trustFirstName }

    /// Circle row semantics (design SoT Round 7).
    public var isAvailable: Bool { inboundLive }
    public var isSealed: Bool { !inboundLive }
    /// True only when the server said their share toward you is Off. Unknown reads false.
    public var isNotSharingWithYou: Bool { inboundPresentation?.isOff == true }

    /// Home / Away when visible; nil means the row reads "presence hidden".
    public var visiblePresence: HomePresenceKind? {
        guard let state = homePresence?.state, state == .home || state == .away else { return nil }
        return state
    }

    public init(
        person: Person,
        presence: PresenceSnapshot,
        share: PersonShareState,
        inboundLive: Bool,
        livePoint: LocationPoint? = nil,
        outboundPresenceGranted: Bool = false,
        inboundPresenceGranted: Bool = false,
        homePresence: HomePresenceSnapshot? = nil,
        promise: PromiseSnapshot? = nil,
        inboundPresentation: SharePresentation? = nil
    ) {
        self.person = person
        self.presence = presence
        self.share = share
        self.inboundLive = inboundLive
        self.livePoint = inboundLive ? livePoint : nil
        self.outboundPresenceGranted = outboundPresenceGranted
        self.inboundPresenceGranted = inboundPresenceGranted
        self.homePresence = homePresence
        self.promise = promise
        self.inboundPresentation = inboundPresentation
    }
}

public enum LookError: Error, Equatable {
    case confirmationRequired
    case pairInactive
    case noPartner
    /// Their share toward you is Off — nothing to Look at.
    case shareOff
    /// Their share toward you is already Available — use View, not Look.
    case lookRequiresSealed
    /// View only works while their share toward you is Available.
    case viewRequiresAvailable
}

public extension String {
    /// "Maya Chen" → "Maya"; "@maya" → "maya".
    var trustFirstName: String {
        var trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("@") { trimmed = String(trimmed.dropFirst()) }
        return trimmed.split(separator: " ").first.map(String.init) ?? trimmed
    }
}

public enum PairingError: Error, Equatable {
    case invalidCode
    case alreadyPaired
}
