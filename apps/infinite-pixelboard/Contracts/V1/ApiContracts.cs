namespace PixelBoard.Contracts.V1;

public static class ApiVersions
{
    public const int V1 = 1;
}

public static class RealtimeProtocol
{
    public const int V1 = 1;
    public const string AcceptedPixelType = "pixel.accepted";
    public const string AcceptedPixelClientMethod = "AcceptedPixelV1";
}

public static class ApiErrorCodes
{
    public const string AuthenticationRequired = "authentication_required";
    public const string AccountBanned = "account_banned";
    public const string AccountDeleted = "account_deleted";
    public const string BoardReadOnly = "board_read_only";
    public const string CommunityStandardsRequired = "community_standards_required";
    public const string InvalidReferralCode = "invalid_referral_code";
    public const string ReferralAlreadyClaimed = "referral_already_claimed";
    public const string ReferralOwnCode = "referral_own_code";
    public const string ReferralLimitReached = "referral_limit_reached";
    public const string InvalidSpecialCode = "invalid_special_code";
    public const string SpecialCodeAlreadyRedeemed = "special_code_already_redeemed";
    public const string SpecialCodeExpired = "special_code_expired";
    public const string InvalidSpecialCodeRequest = "invalid_special_code_request";
    public const string SpecialCodeDuplicate = "special_code_duplicate";
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
    public const string PlacementRateLimited = "placement_rate_limited";
    public const string ServiceUnavailable = "service_unavailable";
    public const string InvalidStoreKitTransaction = "invalid_storekit_transaction";
    public const string InvalidModerationAction = "invalid_moderation_action";
    public const string ModerationConflict = "moderation_conflict";
    public const string StoreKitAccountMismatch = "storekit_account_mismatch";
    public const string StoreKitTransactionNotLinked = "storekit_transaction_not_linked";
    public const string InvalidStripeInterval = "invalid_stripe_interval";
    public const string SubscriptionAlreadyActive = "subscription_already_active";
    public const string StripeCustomerMissing = "stripe_customer_missing";
    public const string InvalidStripeWebhook = "invalid_stripe_webhook";
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
    BoardAccessMode AccessMode,
    string? StatusMessage = null,
    string? MinimumIosVersion = null);

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

public sealed record PaintBoostResponse(
    int CooldownSeconds,
    DateTimeOffset ExpiresAt);

public sealed record AccountStateResponse(
    AccountTier Tier,
    bool CanPlace,
    bool CommunityStandardsAccepted,
    CooldownState Cooldown,
    string? ReferralCode,
    PaintBoostResponse? PaintBoost,
    bool IsBanned,
    IReadOnlyList<string>? AllowedColors = null,
    string? EntitlementSource = null);

public sealed record ClaimReferralRequest(string? Code);

public sealed record RedeemSpecialCodeRequest(string? Code);

public sealed record CreateSpecialCodeRequest(
    string? Code,
    int CooldownSeconds,
    DateTimeOffset? CodeExpiresAt,
    int? BenefitDurationSeconds,
    DateTimeOffset? BenefitExpiresAt,
    string? Note);

public sealed record SpecialCodeResponse(
    string Code,
    int CooldownSeconds,
    DateTimeOffset? CodeExpiresAt,
    int? BenefitDurationSeconds,
    DateTimeOffset? BenefitExpiresAt,
    string? Note,
    DateTimeOffset CreatedAt);

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

public sealed record AcceptedPixelEventData(
    PlacementId PlacementId,
    PixelState Pixel);

public sealed record RealtimeEventEnvelope(
    int ProtocolVersion,
    string Type,
    string Cursor,
    AcceptedPixelEventData Data);

public sealed record StoreKitAccountTokenResponse(AppAccountToken AppAccountToken);

public sealed record VerifyStoreKitTransactionRequest(string SignedTransactionInfo);

public sealed record StoreKitNotificationRequest(string SignedPayload);

public sealed record StoreKitEntitlementResponse(
    AccountTier Tier,
    DateTimeOffset? ExpiresAt);

public sealed record StripeConfigResponse(bool Enabled);

public sealed record StripeStatusResponse(
    bool HasCustomer,
    bool TrialAvailable,
    string? CurrentInterval = null);

public sealed record CreateStripeCheckoutSessionRequest(string? Interval);

public sealed record StripeRedirectResponse(string Url);
