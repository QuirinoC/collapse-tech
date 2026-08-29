using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed record StripeEntitlementSnapshot(
    AccountTier Tier,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RevokedAt);

public static class StripeBilling
{
    public const string Source = "stripe";
    public const string StoreKitSource = "storekit";

    public static string? PriceId(string? interval, StripeOptions options)
    {
        if (string.Equals(interval, "month", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.MonthlyPriceId))
        {
            return options.MonthlyPriceId;
        }

        if (string.Equals(interval, "year", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(options.AnnualPriceId))
        {
            return options.AnnualPriceId;
        }

        return null;
    }

    public static bool IsPaidStatus(string status) =>
        status is "active" or "trialing" or "past_due";

    public static bool ShouldApply(string? eventType) =>
        eventType is "checkout.session.completed"
            or "customer.subscription.created"
            or "customer.subscription.updated"
            or "customer.subscription.deleted"
            or "invoice.paid"
            or "invoice.payment_failed";

    public static StripeEntitlementSnapshot ToEntitlement(
        string status,
        DateTimeOffset periodEnd,
        DateTimeOffset now)
    {
        if (IsPaidStatus(status) && periodEnd > now)
        {
            return new StripeEntitlementSnapshot(AccountTier.Pro, periodEnd, null);
        }

        return new StripeEntitlementSnapshot(AccountTier.Free, periodEnd, now);
    }

    public static bool MayOverwrite(
        string? existingSource,
        DateTimeOffset? existingSignedAt,
        DateTimeOffset? existingRevokedAt,
        DateTimeOffset? existingExpiresAt,
        AccountTier existingTier,
        AccountTier incomingTier,
        DateTimeOffset incomingSignedAt,
        DateTimeOffset now)
    {
        if (existingSignedAt is { } signed && incomingSignedAt < signed)
        {
            return false;
        }

        var storeKitActive = string.Equals(
                existingSource,
                StoreKitSource,
                StringComparison.Ordinal)
            && existingRevokedAt is null
            && existingTier == AccountTier.Pro
            && (existingExpiresAt is null || existingExpiresAt > now);
        return !storeKitActive || incomingTier == AccountTier.Pro;
    }
}
