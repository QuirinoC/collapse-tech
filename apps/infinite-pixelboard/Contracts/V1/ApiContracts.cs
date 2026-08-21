namespace PixelBoard.Contracts.V1;

public static class ApiVersions
{
    public const int V1 = 1;
}

public static class ApiErrorCodes
{
    public const string AuthenticationRequired = "authentication_required";
    public const string AccountBanned = "account_banned";
    public const string BoardReadOnly = "board_read_only";
    public const string CommunityStandardsRequired = "community_standards_required";
    public const string CooldownActive = "cooldown_active";
    public const string DuplicateRequest = "duplicate_request";
    public const string InvalidColor = "invalid_color";
    public const string InvalidClientContext = "invalid_client_context";
    public const string InvalidCoordinates = "invalid_coordinates";
    public const string InvalidIdempotencyKey = "invalid_idempotency_key";
    public const string InvalidReportNote = "invalid_report_note";
    public const string InvalidReportReason = "invalid_report_reason";
    public const string InvalidReportRegion = "invalid_report_region";
    public const string ReportRateLimited = "report_rate_limited";
    public const string ServiceUnavailable = "service_unavailable";
    public const string InvalidStoreKitTransaction = "invalid_storekit_transaction";
    public const string StoreKitAccountMismatch = "storekit_account_mismatch";
    public const string TileUnavailable = "tile_unavailable";
}

public enum AccountTier
{
    Free,
    Pro
}

public enum PlacementOutcome
{
    Accepted,
    Rejected
}

public enum ReportReason
{
    ExplicitSexualContent,
    GraphicViolence,
    HateOrHarassment,
    Threat,
    IllegalContent,
    Copyright,
    Other
}

public enum ReportStatus
{
    Received,
    UnderReview,
    Actioned,
    Closed
}

public enum BoardAccessMode
{
    Open,
    ReadOnly
}

public sealed record BoardMetadataResponse(
    int ApiVersion,
    int TileRows,
    int TileColumns,
    string DefaultColor,
    string CoordinateConvention,
    BoardAccessMode AccessMode);

public sealed record TileSnapshotResponse(
    int ApiVersion,
    int TileRow,
    int TileColumn,
    string[][] Pixels,
    DateTimeOffset CapturedAt);

public sealed record ClientContext(
    string Platform,
    string AppVersion);

public sealed record PlacementRequest(
    int Row,
    int Column,
    string Color,
    string IdempotencyKey,
    ClientContext Client);

public sealed record PixelState(
    int Row,
    int Column,
    string Color,
    DateTimeOffset PlacedAt);

public sealed record CooldownState(
    DateTimeOffset? NextPlacementAt,
    int CooldownSeconds);

public sealed record ApiError(
    string Code,
    string Message);

public sealed record PlacementResult(
    PlacementOutcome Outcome,
    PlacementId? PlacementId,
    PixelState? Pixel,
    CooldownState Cooldown,
    ApiError? Error);

public sealed record AccountStateResponse(
    AccountTier Tier,
    bool CanPlace,
    bool CommunityStandardsAccepted,
    CooldownState Cooldown);

public sealed record ReportRegion(
    int Top,
    int Left,
    int Width,
    int Height);

public sealed record CreateReportRequest(
    ReportRegion? Region,
    ReportReason? Reason,
    string? Note,
    ClientContext? Client);

public sealed record ReportResponse(
    ReportId ReportId,
    ReportStatus Status,
    DateTimeOffset SubmittedAt);

public sealed record ModerationStateResponse(
    BoardAccessMode AccessMode,
    IReadOnlyList<ReportRegion> HiddenRegions);

public sealed record AcceptedPixelEvent(
    string Type,
    PlacementId PlacementId,
    PixelState Pixel);

public sealed record StoreKitAccountTokenResponse(AppAccountToken AppAccountToken);

public sealed record VerifyStoreKitTransactionRequest(string SignedTransactionInfo);

public sealed record StoreKitNotificationRequest(string SignedPayload);

public sealed record StoreKitEntitlementResponse(
    AccountTier Tier,
    DateTimeOffset? ExpiresAt);
