import Foundation

public enum AccountTier: Int, Codable, Sendable {
    case free = 0
    case pro = 1
}

public enum BoardAccessMode: Int, Codable, Sendable {
    case open = 0
    case readOnly = 1
}

public enum PlacementOutcome: Int, Codable, Sendable {
    case accepted = 0
    case rejected = 1
}

public enum ReportReason: Int, Codable, CaseIterable, Identifiable, Sendable {
    case explicitSexualContent
    case graphicViolence
    case hateOrHarassment
    case threat
    case illegalContent
    case copyright
    case other

    public var id: Int { rawValue }
}

public struct BoardMetadata: Codable, Equatable, Sendable {
    public let apiVersion: Int
    public let tileRows: Int
    public let tileColumns: Int
    public let defaultColor: String
    public let coordinateConvention: String
    public let accessMode: BoardAccessMode

    public init(apiVersion: Int, tileRows: Int, tileColumns: Int, defaultColor: String, coordinateConvention: String, accessMode: BoardAccessMode) {
        self.apiVersion = apiVersion
        self.tileRows = tileRows
        self.tileColumns = tileColumns
        self.defaultColor = defaultColor
        self.coordinateConvention = coordinateConvention
        self.accessMode = accessMode
    }
}

public struct TileSnapshot: Codable, Equatable, Sendable {
    public let apiVersion: Int
    public let tileRow: Int
    public let tileColumn: Int
    public var pixels: [[String]]
    public let capturedAt: Date

    public init(apiVersion: Int, tileRow: Int, tileColumn: Int, pixels: [[String]], capturedAt: Date) {
        self.apiVersion = apiVersion
        self.tileRow = tileRow
        self.tileColumn = tileColumn
        self.pixels = pixels
        self.capturedAt = capturedAt
    }
}

public struct ClientContext: Codable, Equatable, Sendable {
    public let platform: String
    public let appVersion: String

    public init(platform: String = "ios", appVersion: String) {
        self.platform = platform
        self.appVersion = appVersion
    }
}

public struct PlacementRequest: Codable, Equatable, Sendable {
    public let row: Int
    public let column: Int
    public let color: String
    public let idempotencyKey: String
    public let client: ClientContext

    public init(row: Int, column: Int, color: String, idempotencyKey: String, client: ClientContext) {
        self.row = row
        self.column = column
        self.color = color
        self.idempotencyKey = idempotencyKey
        self.client = client
    }
}

public struct PixelState: Codable, Equatable, Sendable {
    public let row: Int
    public let column: Int
    public let color: String
    public let placedAt: Date

    public init(row: Int, column: Int, color: String, placedAt: Date) {
        self.row = row
        self.column = column
        self.color = color
        self.placedAt = placedAt
    }
}

public struct CooldownState: Codable, Equatable, Sendable {
    public let nextPlacementAt: Date?
    public let cooldownSeconds: Int

    public init(nextPlacementAt: Date?, cooldownSeconds: Int) {
        self.nextPlacementAt = nextPlacementAt
        self.cooldownSeconds = cooldownSeconds
    }
}

public struct APIErrorPayload: Codable, Error, Equatable, Sendable {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

public struct PlacementResult: Codable, Equatable, Sendable {
    public let outcome: PlacementOutcome
    public let placementId: String?
    public let pixel: PixelState?
    public let cooldown: CooldownState
    public let error: APIErrorPayload?

    public init(outcome: PlacementOutcome, placementId: String?, pixel: PixelState?, cooldown: CooldownState, error: APIErrorPayload?) {
        self.outcome = outcome
        self.placementId = placementId
        self.pixel = pixel
        self.cooldown = cooldown
        self.error = error
    }
}

public struct AccountState: Codable, Equatable, Sendable {
    public let tier: AccountTier
    public let canPlace: Bool
    public let communityStandardsAccepted: Bool
    public let cooldown: CooldownState

    public init(tier: AccountTier, canPlace: Bool, communityStandardsAccepted: Bool, cooldown: CooldownState) {
        self.tier = tier
        self.canPlace = canPlace
        self.communityStandardsAccepted = communityStandardsAccepted
        self.cooldown = cooldown
    }
}

public struct ReportRegion: Codable, Equatable, Sendable {
    public let top: Int
    public let left: Int
    public let width: Int
    public let height: Int

    public init(top: Int, left: Int, width: Int = 1, height: Int = 1) {
        self.top = top
        self.left = left
        self.width = width
        self.height = height
    }
}

public struct CreateReportRequest: Codable, Equatable, Sendable {
    public let region: ReportRegion?
    public let reason: ReportReason?
    public let note: String?
    public let client: ClientContext?

    public init(region: ReportRegion?, reason: ReportReason?, note: String?, client: ClientContext?) {
        self.region = region
        self.reason = reason
        self.note = note
        self.client = client
    }
}

public struct ReportResponse: Codable, Equatable, Sendable {
    public let reportId: String
    public let status: Int
    public let submittedAt: Date

    public init(reportId: String, status: Int, submittedAt: Date) {
        self.reportId = reportId
        self.status = status
        self.submittedAt = submittedAt
    }
}

public struct AcceptedPixelEvent: Codable, Equatable, Sendable {
    public let type: String
    public let placementId: String
    public let pixel: PixelState

    public init(type: String, placementId: String, pixel: PixelState) {
        self.type = type
        self.placementId = placementId
        self.pixel = pixel
    }
}

public struct StoreKitAccountTokenResponse: Codable, Equatable, Sendable {
    public let appAccountToken: UUID

    public init(appAccountToken: UUID) {
        self.appAccountToken = appAccountToken
    }
}

public struct VerifyStoreKitTransactionRequest: Codable, Equatable, Sendable {
    public let signedTransactionInfo: String

    public init(signedTransactionInfo: String) {
        self.signedTransactionInfo = signedTransactionInfo
    }
}

public struct StoreKitEntitlement: Codable, Equatable, Sendable {
    public let tier: AccountTier
    public let expiresAt: Date?

    public init(tier: AccountTier, expiresAt: Date?) {
        self.tier = tier
        self.expiresAt = expiresAt
    }
}
