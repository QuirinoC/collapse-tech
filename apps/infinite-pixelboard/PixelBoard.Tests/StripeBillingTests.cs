using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class StripeBillingTests
{
    private static readonly StripeOptions Prices = new()
    {
        MonthlyPriceId = "price_month",
        AnnualPriceId = "price_year"
    };

    [Theory]
    [InlineData("month", "price_month")]
    [InlineData("year", "price_year")]
    [InlineData("MONTH", "price_month")]
    public void PriceIdMapsSupportedIntervals(string interval, string expected)
    {
        Assert.Equal(expected, StripeBilling.PriceId(interval, Prices));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("week")]
    [InlineData("unlimited")]
    public void PriceIdRejectsUnknownIntervals(string? interval)
    {
        Assert.Null(StripeBilling.PriceId(interval, Prices));
    }

    [Theory]
    [InlineData("active", true)]
    [InlineData("trialing", true)]
    [InlineData("past_due", true)]
    [InlineData("canceled", false)]
    [InlineData("unpaid", false)]
    [InlineData("incomplete", false)]
    public void PaidStatusesKeepPro(string status, bool paid)
    {
        Assert.Equal(paid, StripeBilling.IsPaidStatus(status));
    }

    [Fact]
    public void ActiveSubscriptionGrantsProUntilPeriodEnd()
    {
        var now = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        var periodEnd = now.AddDays(30);
        var entitlement = StripeBilling.ToEntitlement("active", periodEnd, now);
        Assert.Equal(AccountTier.Pro, entitlement.Tier);
        Assert.Equal(periodEnd, entitlement.ExpiresAt);
        Assert.Null(entitlement.RevokedAt);
    }

    [Fact]
    public void CanceledSubscriptionRevokesPro()
    {
        var now = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        var entitlement = StripeBilling.ToEntitlement("canceled", now.AddDays(10), now);
        Assert.Equal(AccountTier.Free, entitlement.Tier);
        Assert.Equal(now, entitlement.RevokedAt);
    }

    [Fact]
    public void StripeCancelDoesNotClearActiveStoreKitPro()
    {
        var now = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        Assert.False(StripeBilling.MayOverwrite(
            "storekit",
            now.AddMinutes(-1),
            null,
            now.AddMonths(1),
            AccountTier.Pro,
            AccountTier.Free,
            now,
            now));
    }

    [Fact]
    public void StripeProCanReplaceActiveStoreKitPro()
    {
        var now = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        Assert.True(StripeBilling.MayOverwrite(
            "storekit",
            now.AddMinutes(-1),
            null,
            now.AddMonths(1),
            AccountTier.Pro,
            AccountTier.Pro,
            now,
            now));
    }

    [Fact]
    public void OlderEventsDoNotOverwriteNewerEntitlements()
    {
        var now = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        Assert.False(StripeBilling.MayOverwrite(
            "stripe",
            now,
            null,
            now.AddMonths(1),
            AccountTier.Pro,
            AccountTier.Free,
            now.AddMinutes(-1),
            now));
    }

    [Theory]
    [InlineData("checkout.session.completed", true)]
    [InlineData("customer.subscription.updated", true)]
    [InlineData("invoice.paid", true)]
    [InlineData("charge.succeeded", false)]
    public void WebhookTypesAreFiltered(string eventType, bool expected)
    {
        Assert.Equal(expected, StripeBilling.ShouldApply(eventType));
    }
}
