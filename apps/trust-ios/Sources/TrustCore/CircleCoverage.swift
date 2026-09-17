import Foundation

public enum CircleError: Error, Equatable {
    case proRequired
    case seatLimitReached
}

/// Plus coverage. You are covered when you pay, or when a paying member covers you on
/// your shared edge. Coverage unlocks capacity and convenience (seats, Always / For a while,
/// full view log) — never receipts, the seal default, Stop, Hidden, presence, Look, Invite,
/// or Delete. Server values win when present; the constants are the 1.0 defaults.
public struct CircleCoverage: Equatable, Sendable {
    public var isCovered: Bool
    public var sponsorName: String?
    public var actingIsSponsor: Bool
    /// From `/circle` coverage when available.
    public var serverSeatLimit: Int?
    public var serverLookLogDays: Int?

    public static let freeHistoryHours = 2
    public static let proHistoryHours = 24
    public static let freeTrustedPeople = 5
    public static let proTrustedPeople = 20
    public static let freeLookLogDays = 30
    public static let proLookLogDays = 365

    public init(
        isCovered: Bool,
        sponsorName: String?,
        actingIsSponsor: Bool,
        serverSeatLimit: Int? = nil,
        serverLookLogDays: Int? = nil
    ) {
        self.isCovered = isCovered
        self.sponsorName = sponsorName
        self.actingIsSponsor = actingIsSponsor
        self.serverSeatLimit = serverSeatLimit
        self.serverLookLogDays = serverLookLogDays
    }

    public var trustedPeopleLimit: Int {
        serverSeatLimit ?? (isCovered ? Self.proTrustedPeople : Self.freeTrustedPeople)
    }

    public var lookLogRetentionDays: Int {
        serverLookLogDays ?? (isCovered ? Self.proLookLogDays : Self.freeLookLogDays)
    }

    /// Always and For a while are Plus. Off and Until they look never are.
    public var canShareAvailable: Bool { isCovered }

    public var hasPlacePings: Bool { isCovered }

    public var canExtendHistory: Bool { isCovered }

    public var canExportLookLog: Bool { isCovered }

    public var planLabel: String { isCovered ? TrustCopy.plusPlan : TrustCopy.freePlan }

    public var banner: String? {
        guard isCovered, let sponsorName else { return nil }
        if actingIsSponsor {
            return TrustCopy.bannerYouPay
        }
        return TrustCopy.bannerSponsorCovers(name: sponsorName)
    }
}
