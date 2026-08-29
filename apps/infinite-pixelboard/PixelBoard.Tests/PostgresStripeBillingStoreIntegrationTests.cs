using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.StoreKit;
using PixelBoard.Infrastructure.Stripe;

namespace PixelBoard.Tests;

public sealed class PostgresStripeBillingStoreIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task StripeSubscriptionsGrantAndRevokeProWithoutClearingStoreKit()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var stripe = new PostgresStripeBillingStore(dataSource);
        var storeKit = new PostgresStoreKitEntitlementStore(dataSource);
        var entitlements = (IEntitlementService)new PostgresAccountStateService(dataSource);
        var stripeAccount = new AccountId($"stripe-{Guid.NewGuid():N}");
        var storeKitAccount = new AccountId($"stripe-sk-{Guid.NewGuid():N}");
        var now = DateTimeOffset.UtcNow;

        Assert.True(await stripe.ApplyAsync(Update(
            stripeAccount,
            "cus_a",
            "sub_a",
            "active",
            now.AddMonths(1),
            now)));
        Assert.Equal(AccountTier.Pro, (await entitlements.GetAsync(stripeAccount)).Tier);
        Assert.Equal("cus_a", await stripe.GetCustomerIdAsync(stripeAccount));

        Assert.True(await stripe.ApplyAsync(Update(
            stripeAccount,
            "cus_a",
            "sub_a",
            "canceled",
            now.AddDays(10),
            now.AddMinutes(1))));
        Assert.Equal(AccountTier.Free, (await entitlements.GetAsync(stripeAccount)).Tier);

        var token = await storeKit.GetOrCreateAccountTokenAsync(storeKitAccount);
        Assert.True(token.HasValue);
        Assert.True(await storeKit.ApplyAsync(
            storeKitAccount,
            new VerifiedStoreKitTransaction(
                $"transaction-{Guid.NewGuid():N}",
                $"original-{Guid.NewGuid():N}",
                "pixelboard.pro.monthly",
                token.Value,
                "Sandbox",
                now,
                now.AddMonths(1),
                null)));
        Assert.Equal(AccountTier.Pro, (await entitlements.GetAsync(storeKitAccount)).Tier);
        Assert.True(await stripe.ApplyAsync(Update(
            storeKitAccount,
            "cus_b",
            "sub_b",
            "canceled",
            now.AddDays(10),
            now.AddMinutes(1))));
        Assert.Equal(AccountTier.Pro, (await entitlements.GetAsync(storeKitAccount)).Tier);

        await CleanupAsync(dataSource, stripeAccount, storeKitAccount);
    }

    private static StripeSubscriptionUpdate Update(
        AccountId account,
        string customerId,
        string subscriptionId,
        string status,
        DateTimeOffset periodEnd,
        DateTimeOffset eventAt) =>
        new(
            account,
            customerId,
            subscriptionId,
            status,
            "price_test",
            periodEnd,
            eventAt);

    private static async Task CleanupAsync(NpgsqlDataSource dataSource, params AccountId[] accounts)
    {
        var accountIds = accounts.Select(account => account.Value).ToArray();
        string[] tables =
        [
            "stripe_subscriptions",
            "stripe_customers",
            "storekit_transactions",
            "storekit_subscription_owners",
            "entitlements",
            "storekit_account_tokens"
        ];
        foreach (var table in tables)
        {
            await using var command = dataSource.CreateCommand(
                $"DELETE FROM pixelboard.{table} WHERE firebase_uid = ANY($1);");
            command.Parameters.AddWithValue(accountIds);
            await command.ExecuteNonQueryAsync();
        }
    }
}
