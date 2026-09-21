import Foundation

public enum CircleError: Error, Equatable {
    case proRequired
    case seatLimitReached
}

/// Plus is this account. A paying friend does not cover you.
/// Coverage unlocks seats, Always, the people map, and a longer history.
public struct CircleCoverage: Equatable, Sendable {
    public var isCovered: Bool
    public var sponsorName: String?
    public var actingIsSponsor: Bool
    /// From `/circle` coverage when available.
    public var serverSeatLimit: Int?
    public var serverLookLogDays: Int?

    public static let freeTrustedPeople = 5
    public static let proTrustedPeople = 20
    public static let freeLookLogDays = 30
    public static let proLookLogDays = 365
    /// Recent place list on the person screen. Plus keeps a longer trail; free still shows history.
    public static let freeHistoryHours = 24
    public static let plusHistoryDays = 30

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

    /// Always is Plus. Sealed, Pause, and Off are not.
    public var canShareAvailable: Bool { isCovered }

    public var hasPlacePings: Bool { isCovered }

    public var canExtendHistory: Bool { isCovered }

    public var canExportLookLog: Bool { isCovered }

    public var planLabel: String { isCovered ? TrustCopy.plusPlan : TrustCopy.freePlan }

    /// Plus is this account. A friend's Plus never produces a banner here.
    public var banner: String? {
        guard isCovered, actingIsSponsor else { return nil }
        return TrustCopy.plusOnThisAccount
    }
}
