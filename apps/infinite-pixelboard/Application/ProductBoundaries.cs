using PixelBoard.Contracts.V1;
using PixelBoard.Domain;

namespace PixelBoard.Application;

public readonly record struct AccountId(string Value);

public sealed record AuthenticatedAccount(
    AccountId Id,
    bool IsBanned,
    bool CommunityStandardsAccepted);

public sealed class AccountDeletedException()
    : Exception("This account has been deleted.");

public sealed record EntitlementState(
    AccountTier Tier,
    DateTimeOffset? ExpiresAt,
    string? Source = null);

public sealed record PaintBoostState(
    int CooldownSeconds,
    DateTimeOffset ExpiresAt);

public enum ReferralClaimOutcome
{
    Granted,
    InvalidCode,
    AlreadyClaimed,
    OwnCode,
    LimitReached,
    CommunityStandardsRequired,
    AccountDeleted
}

public sealed record AccountPolicyState(
    bool IsBanned,
    bool CommunityStandardsAccepted);

public sealed record PlacementCommand(
    AccountId AccountId,
    BoardPosition Position,
    string Color,
    string IdempotencyKey,
    ClientContext Client);

public sealed record PlacementValidation(
    bool IsValid,
    ApiError? Error);

public sealed record ReportCommand(
    ReportId ReportId,
    AccountId ReporterAccountId,
    ReportRegion Region,
    ReportReason Reason,
    string? Note,
    ClientContext Client,
    DateTimeOffset SubmittedAt);

public sealed record ReportValidation(
    bool IsValid,
    ReportCommand? Command,
    ApiError? Error);

public enum ReportAdmissionOutcome
{
    Allowed,
    Duplicate,
    RateLimited
}

public sealed record ReportEvidence(
    string SnapshotJson,
    byte[] EvidenceHash);

public sealed record RateLimitDecision(
    bool IsAllowed,
    CooldownState Cooldown);

public sealed record AdvertisingDecision(
    bool ShowAd,
    string Placement);

public sealed record PlatformSafetyState(
    bool PlacementsFrozen,
    bool AdsDisabled);

public sealed record ModerationReport(
    ReportId ReportId,
    ReportStatus Status,
    ReportRegion Region,
    ReportReason Reason,
    string? Note,
    string SnapshotJson,
    byte[] EvidenceHash,
    DateTimeOffset SubmittedAt);

public sealed record ModerationActionCommand(
    ModerationActionId ActionId,
    string IdempotencyKey,
    AccountId ActorAccountId,
    string ActionType,
    string Reason,
    ReportId? ReportId,
    AccountId? TargetAccountId,
    IReadOnlyList<PlacementId> PlacementIds,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset CreatedAt);

public sealed record ModerationActionResult(
    ModerationActionId ActionId,
    string Status,
    bool IsReplay);

public interface IAccountIdentityAccessor
{
    ValueTask<AuthenticatedAccount?> GetCurrentAsync(
        CancellationToken cancellationToken = default);
}

public interface IEntitlementService
{
    ValueTask<EntitlementState> GetAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);
}

public interface IPaintBoostService
{
    ValueTask<PaintBoostState?> GetAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);
}

public interface IReferralService
{
    ValueTask<string?> GetOrCreateCodeAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask<ReferralClaimOutcome> ClaimAsync(
        AccountId refereeAccountId,
        string? code,
        CancellationToken cancellationToken = default);
}

public interface IAccountPolicyService
{
    ValueTask<AccountPolicyState> GetAsync(
        AccountId accountId,
        string requiredCommunityStandardsVersion,
        CancellationToken cancellationToken = default);

    ValueTask AcceptCommunityStandardsAsync(
        AccountId accountId,
        string version,
        CancellationToken cancellationToken = default);
}

public interface IAccountDeletionService
{
    ValueTask<bool> IsDeletedAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask DeleteAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);
}

public interface IAccountOperationGuard
{
    ValueTask<IAsyncDisposable?> AcquireIfActiveAsync(
        IReadOnlyCollection<AccountId> accountIds,
        CancellationToken cancellationToken = default);
}

public interface IPlacementValidator
{
    PlacementValidation Validate(
        PlacementCommand command,
        AccountTier tier = AccountTier.Free);
}

public interface IReportValidator
{
    ReportValidation Validate(
        CreateReportRequest? request,
        AccountId reporterAccountId,
        ReportId reportId,
        DateTimeOffset submittedAt);
}

public interface IReportRateLimiter
{
    ValueTask<ReportAdmissionOutcome> TryAcquireAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default);

    ValueTask ReleaseAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default);
}

public interface IReportEvidenceCollector
{
    ValueTask<ReportEvidence> CollectAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default);
}

public interface IReportStore
{
    ValueTask<bool> SaveAsync(
        ReportCommand command,
        ReportEvidence evidence,
        CancellationToken cancellationToken = default);
}

public interface IPlacementRateLimiter
{
    ValueTask<bool> TryAcquireAsync(
        AccountId accountId,
        string? clientIp,
        CancellationToken cancellationToken = default);
}

public interface IBoardEventPublisher
{
    ValueTask PublishAsync(
        AcceptedPixelEvent pixelEvent,
        CancellationToken cancellationToken = default);
}

public interface IAdvertisingPolicy
{
    ValueTask<AdvertisingDecision> DecideAsync(
        AccountId? accountId,
        AccountTier tier,
        CancellationToken cancellationToken = default);
}

public interface IPlatformSafetyService
{
    ValueTask<PlatformSafetyState> GetStateAsync(
        CancellationToken cancellationToken = default);
}

public interface IBoardVisibilityFilter
{
    ValueTask<bool> IsVisibleAsync(
        BoardPosition position,
        CancellationToken cancellationToken = default);

    ValueTask ApplyAsync(
        TileAddress tile,
        string[][] pixels,
        CancellationToken cancellationToken = default);
}

public interface IModerationService : IPlatformSafetyService, IBoardVisibilityFilter
{
    ValueTask<IReadOnlyList<ModerationReport>> ListReportsAsync(
        int limit,
        CancellationToken cancellationToken = default);

    ValueTask<ModerationReport?> GetReportAsync(
        ReportId reportId,
        CancellationToken cancellationToken = default);

    ValueTask<ModerationActionResult> ExecuteAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken = default);

    ValueTask<ModerationActionResult> SetSafetyStateAsync(
        ModerationActionCommand command,
        PlatformSafetyState state,
        CancellationToken cancellationToken = default);
}
