using PixelBoard.Contracts.V1;
using PixelBoard.Domain;

namespace PixelBoard.Application;

public readonly record struct AccountId(string Value);

public sealed record AuthenticatedAccount(
    AccountId Id,
    bool IsBanned,
    bool CommunityStandardsAccepted);

public sealed record EntitlementState(
    AccountTier Tier,
    DateTimeOffset? ExpiresAt);

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

public sealed record RateLimitDecision(
    bool IsAllowed,
    CooldownState Cooldown);

public sealed record AdvertisingDecision(
    bool ShowAd,
    string Placement);

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

public interface IPlacementValidator
{
    PlacementValidation Validate(PlacementCommand command);
}

public interface IPlacementRateLimiter
{
    ValueTask<RateLimitDecision> TryAcquireAsync(
        AccountId accountId,
        AccountTier tier,
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
