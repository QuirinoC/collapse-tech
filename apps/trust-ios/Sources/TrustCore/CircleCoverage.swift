import Foundation

public enum CircleError: Error, Equatable {
    case proRequired
    case seatLimitReached
}

/// Circle is covered when anyone in the pair has Pro. The unpaid partner still
/// shares, looks, and participates. Free 1:1 looks are never paywalled.
public struct CircleCoverage: Equatable, Sendable {
    public var isCovered: Bool
    public var sponsorName: String?
    public var actingIsSponsor: Bool

    public static let freeHistoryHours = 2
    public static let proHistoryHours = 24
    public static let freeTrustedPeople = 1
    public static let proTrustedPeople = 6
    public static let freeLookLogDays = 30
    public static let proLookLogDays = 365

    public init(isCovered: Bool, sponsorName: String?, actingIsSponsor: Bool) {
        self.isCovered = isCovered
        self.sponsorName = sponsorName
        self.actingIsSponsor = actingIsSponsor
    }

    public var trustedPeopleLimit: Int {
        isCovered ? Self.proTrustedPeople : Self.freeTrustedPeople
    }

    public var lookLogRetentionDays: Int {
        isCovered ? Self.proLookLogDays : Self.freeLookLogDays
    }

    public var hasPlacePings: Bool { isCovered }

    public var canExtendHistory: Bool { isCovered }

    public var canExportLookLog: Bool { isCovered }

    public var banner: String? {
        guard isCovered, let sponsorName else { return nil }
        if actingIsSponsor {
            return TrustCopy.bannerYourCircle
        }
        return TrustCopy.bannerSponsorCovers(name: sponsorName)
    }

    public var statusLine: String {
        if let banner {
            return banner
        }
        return TrustCopy.statusFreeCircle(hours: Self.freeHistoryHours)
    }
}
