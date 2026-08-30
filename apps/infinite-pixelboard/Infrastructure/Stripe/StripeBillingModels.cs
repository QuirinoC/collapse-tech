using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Stripe;

public sealed record StripeCheckoutSessionRequest(
    AccountId AccountId,
    string CustomerId,
    string PriceId,
    string SuccessUrl,
    string CancelUrl,
    int? TrialPeriodDays);

public sealed record StripeWebhookParseResult(
    bool IsValid,
    string? EventType,
    DateTimeOffset EventAt,
    string? FirebaseUid,
    string? CustomerId,
    string? SubscriptionId,
    string? Error)
{
    public static StripeWebhookParseResult Invalid(string error) =>
        new(false, null, default, null, null, null, error);
}

public sealed record StripeSubscriptionSnapshot(
    string SubscriptionId,
    string CustomerId,
    string Status,
    string? PriceId,
    DateTimeOffset CurrentPeriodEnd,
    string? FirebaseUid);

public sealed record StripeSubscriptionUpdate(
    AccountId AccountId,
    string CustomerId,
    string SubscriptionId,
    string Status,
    string? PriceId,
    DateTimeOffset CurrentPeriodEnd,
    DateTimeOffset EventAt);

public interface IStripeBillingStore
{
    ValueTask<string?> GetCustomerIdAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask<bool> HasCustomerAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask<bool> TryClaimStripeTrialAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask<string?> FindFirebaseUidByCustomerAsync(
        string stripeCustomerId,
        CancellationToken cancellationToken = default);

    ValueTask<string?> SaveCustomerAsync(
        AccountId accountId,
        string stripeCustomerId,
        CancellationToken cancellationToken = default);

    ValueTask<bool> ApplyAsync(
        StripeSubscriptionUpdate update,
        CancellationToken cancellationToken = default);
}

public interface IStripeBillingGateway
{
    StripeWebhookParseResult ParseWebhook(string payload, string signature);

    Task<string> CreateCustomerAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    Task<string> CreateCheckoutSessionAsync(
        StripeCheckoutSessionRequest request,
        CancellationToken cancellationToken = default);

    Task<string> CreatePortalSessionAsync(
        string customerId,
        string returnUrl,
        CancellationToken cancellationToken = default);

    Task<StripeSubscriptionSnapshot?> GetSubscriptionAsync(
        string subscriptionId,
        CancellationToken cancellationToken = default);
}
